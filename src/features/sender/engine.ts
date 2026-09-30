/**
 * Sender engine: top-level orchestrator for a transfer the sender owns.
 *
 * Responsibilities:
 *  - transfer creation (secure ID, optional password verifier, room
 *    registration with the signaling server)
 *  - signaling (WebSocket with HTTP fallback) and per-receiver WebRTC
 *    peer connections (receiver-initiated offers)
 *  - one SenderSession per accepted receiver
 *  - sender controls: cancel, revoke, kick, pause/resume
 *  - state snapshots for React (via useSyncExternalStore)
 *
 * The engine is framework-agnostic and lives outside React so it survives
 * route changes between /send and /send/[id].
 */

import { SignalingClient } from "@/lib/signaling/client";
import type { ServerSignal } from "@/lib/signaling/types";
import { createPeerConnection, defaultIceConfig } from "@/lib/webrtc/peer";
import {
  SenderSession,
  type SenderSessionSnapshot,
  type SenderSessionState,
} from "@/lib/webrtc/sender-session";
import type { DataChannelLike } from "@/lib/webrtc/channel";
import { createPhaseMachine, type PhaseMachine } from "@/features/transfer/state-machine";
import {
  deleteEngine,
  setEngine,
  type SelectedFile,
} from "@/lib/files/client-store";
import { generateSalt } from "@/lib/ids";
import { deriveVerifier } from "@/lib/crypto/password";
import { SITE_URL } from "@/lib/config";
import type {
  ConnectionQuality,
  FileMetaWithHash,
  ReceiverSummary,
  TransferError,
  TransferPhase,
} from "@/types/transfer";

export interface SenderEngineState {
  phase: TransferPhase;
  roomId: string | null;
  shareUrl: string | null;
  expiresAt: number | null;
  files: FileMetaWithHash[];
  receivers: ReceiverSummary[];
  currentFileId: string | null;
  currentFileName: string | null;
  fileBytes: number;
  totalBytes: number;
  totalSize: number;
  speed: number;
  etaSeconds: number;
  durationSeconds: number;
  /** File IDs verified complete (by the lead receiver). */
  doneFileIds: string[];
  connectionQuality: ConnectionQuality;
  signalingKind: "ws" | "http" | null;
  error: TransferError | null;
  requiresPassword: boolean;
}

interface PeerContext {
  peerId: string;
  pc: RTCPeerConnection;
  channel: DataChannelLike | null;
  session: SenderSession | null;
  summary: ReceiverSummary;
  pendingIce: RTCIceCandidateInit[];
  quality: ConnectionQuality;
}

const OWNER_KEY_STORAGE = "file-burger:owner";

let cachedIceServers: RTCIceServer[] | null = null;

async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers) return cachedIceServers;
  try {
    const response = await fetch("/api/ice", { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as { iceServers?: RTCIceServer[] };
      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        cachedIceServers = data.iceServers;
        return cachedIceServers;
      }
    }
  } catch {
    // Fall back to defaults.
  }
  return defaultIceConfig().iceServers;
}

export class SenderEngine {
  private readonly machine: PhaseMachine = createPhaseMachine("ready");
  private signaling: SignalingClient | null = null;
  private peers = new Map<string, PeerContext>();
  private peerSnapshots = new Map<string, SenderSessionSnapshot>();
  private selectedFiles: SelectedFile[] = [];
  private files: FileMetaWithHash[] = [];
  private room: { id: string; ownerKey: string; expiresAt: number } | null = null;
  private passwordVerifier: string | null = null;
  private iceServers: RTCIceServer[] = defaultIceConfig().iceServers;
  private connectionQuality: ConnectionQuality = "unknown";
  private signalingKind: "ws" | "http" | null = null;
  private error: TransferError | null = null;
  private disposed = false;
  private transferStartedAt = 0;
  private transferEndedAt = 0;

  private listeners = new Set<() => void>();
  private snapshotCache: SenderEngineState = this.computeSnapshot();

  // ── React store interface ────────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): SenderEngineState => this.snapshotCache;

  private emit(): void {
    this.snapshotCache = this.computeSnapshot();
    for (const listener of this.listeners) listener();
  }

  private computeSnapshot(): SenderEngineState {
    const lead = this.leadSnapshot();
    const acceptedIds = lead
      ? [...lead.done, ...lead.pending, ...(lead.fileId ? [lead.fileId] : [])]
      : [];
    const totalSize =
      acceptedIds.length > 0
        ? acceptedIds.reduce(
            (total, id) => total + (this.files.find((f) => f.id === id)?.size ?? 0),
            0,
          )
        : this.files.reduce((total, file) => total + file.size, 0);
    const currentFile = lead?.fileId
      ? this.files.find((f) => f.id === lead.fileId) ?? null
      : null;
    return {
      phase: this.machine.phase,
      roomId: this.room?.id ?? null,
      shareUrl:
        this.room && typeof window !== "undefined"
          ? `${SITE_URL || window.location.origin}/receive/${this.room.id}`
          : null,
      expiresAt: this.room?.expiresAt ?? null,
      files: this.files,
      receivers: Array.from(this.peers.values()).map((peer) => peer.summary),
      currentFileId: currentFile?.id ?? null,
      currentFileName: currentFile?.name ?? null,
      fileBytes: lead?.fileBytes ?? 0,
      totalBytes: lead ? lead.completedBytes + lead.fileBytes : 0,
      totalSize,
      speed: lead?.speed ?? 0,
      etaSeconds: lead?.etaSeconds ?? Infinity,
      durationSeconds:
        this.transferStartedAt > 0
          ? ((this.transferEndedAt > 0 ? this.transferEndedAt : Date.now()) -
              this.transferStartedAt) / 1000
          : 0,
      doneFileIds: lead?.done ?? [],
      connectionQuality: this.connectionQuality,
      signalingKind: this.signalingKind,
      error: this.error,
      requiresPassword: this.passwordVerifier !== null,
    };
  }

  /** The most-progressed active receiver drives the headline stats. */
  private leadSnapshot(): SenderSessionSnapshot | null {
    let lead: SenderSessionSnapshot | null = null;
    for (const snapshot of this.peerSnapshots.values()) {
      if (snapshot.state === "cancelled" || snapshot.state === "failed") continue;
      if (!lead || snapshot.progress > lead.progress) lead = snapshot;
    }
    if (lead) return lead;
    for (const snapshot of this.peerSnapshots.values()) {
      if (!lead || snapshot.progress > lead.progress) lead = snapshot;
    }
    return lead;
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  async createTransfer(input: {
    files: SelectedFile[];
    password: string | null;
  }): Promise<{ roomId: string; shareUrl: string; expiresAt: number }> {
    if (this.room) {
      throw new Error("transfer_already_created");
    }
    if (input.files.length === 0) {
      this.error = { code: "invalid_input", message: "Select at least one file." };
      this.emit();
      throw new Error("invalid_input");
    }

    this.selectedFiles = input.files;
    this.machine.dispatch("create-started");
    this.emit();

    // Password verifier is derived in the browser; the plaintext password
    // never leaves this tab.
    let password: { salt: string; verifier: string } | null = null;
    if (input.password) {
      try {
        const salt = await generateSalt();
        const verifier = await deriveVerifier(input.password, salt);
        password = { salt, verifier };
        this.passwordVerifier = verifier;
      } catch (error) {
        if (error instanceof Error && error.message === "insecure_context") {
          this.error = {
            code: "invalid_input",
            message:
              "Password protection requires a secure connection (HTTPS or localhost).",
          };
        } else {
          this.error = {
            code: "unknown",
            message: "Could not set up password protection.",
          };
        }
        this.machine.dispatch("transfer-failed");
        this.emit();
        throw new Error("password_setup_failed");
      }
    }

    this.iceServers = await fetchIceServers();

    const files: FileMetaWithHash[] = input.files.map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      hash: null,
    }));

    let response: Response;
    try {
      response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files, password }),
        cache: "no-store",
      });
    } catch {
      this.failWithError({
        code: "signaling_unavailable",
        message: "Could not reach the File Burger server. Check your connection.",
      });
      throw new Error("signaling_unavailable");
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      this.failWithError({
        code: (body?.error as TransferError["code"]) ?? "invalid_input",
        message: body?.message ?? "Could not create the transfer.",
      });
      throw new Error(body?.error ?? "invalid_input");
    }

    const data = (await response.json()) as {
      roomId: string;
      ownerKey: string;
      expiresAt: number;
    };

    this.room = { id: data.roomId, ownerKey: data.ownerKey, expiresAt: data.expiresAt };
    this.files = files;

    // Owner key survives reloads (tab-scoped) so the dashboard can still
    // revoke the link after a refresh. The WebRTC transfer itself cannot
    // resume after a reload — file handles live in memory.
    try {
      sessionStorage.setItem(
        OWNER_KEY_STORAGE,
        JSON.stringify({ roomId: data.roomId, ownerKey: data.ownerKey }),
      );
    } catch {
      // Storage unavailable — revoke-after-reload degrades gracefully.
    }

    setEngine(data.roomId, this);

    this.signaling = new SignalingClient({
      roomId: data.roomId,
      role: "sender",
      ownerKey: data.ownerKey,
      onMessage: (signal) => this.handleSignalingMessage(signal),
      onStatus: (status, kind) => this.handleSignalingStatus(status, kind),
      onFatal: (code) => this.handleSignalingFatal(code),
    });
    void this.signaling.start();

    this.machine.dispatch("room-created");
    this.emit();

    const origin = SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
    // The share link points recipients at the receive screen; the sender's
    // own dashboard lives at /send/<id>.
    const shareUrl = `${origin}/receive/${data.roomId}`;
    return { roomId: data.roomId, shareUrl, expiresAt: data.expiresAt };
  }

  /** Recover the owner key after a page reload (dashboard-only mode). */
  static getRecoveredOwnerKey(roomId: string): string | null {
    if (typeof sessionStorage === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(OWNER_KEY_STORAGE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { roomId?: string; ownerKey?: string };
      if (parsed.roomId === roomId && parsed.ownerKey) return parsed.ownerKey;
      return null;
    } catch {
      return null;
    }
  }

  // ── sender controls ──────────────────────────────────────────────────────

  /** Cancel the transfer and revoke the link. */
  async cancel(reason = "sender_cancelled"): Promise<void> {
    for (const [, peer] of this.peers) {
      peer.session?.cancel(reason);
    }
    await this.teardown();
    if (this.machine.phase !== "completed") {
      this.machine.dispatch("transfer-cancelled");
    }
    this.emit();
  }

  /** Terminate one receiver's connection. */
  kick(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.session?.cancel("kicked");
    try {
      peer.pc.close();
    } catch {
      // ignore
    }
    this.peers.delete(peerId);
    this.peerSnapshots.delete(peerId);
    this.emit();
  }

  pauseReceiver(peerId: string): void {
    this.peers.get(peerId)?.session?.pause();
  }

  resumeReceiver(peerId: string): void {
    this.peers.get(peerId)?.session?.resume();
  }

  /** Release resources. The engine cannot be used afterwards. */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.room) deleteEngine(this.room.id);
    await this.signaling?.stop();
    for (const [, peer] of this.peers) {
      try {
        peer.pc.close();
      } catch {
        // ignore
      }
    }
    this.peers.clear();
  }

  private async teardown(): Promise<void> {
    if (this.room) deleteEngine(this.room.id);
    await this.signaling?.stop();
    this.signaling = null;
    for (const [, peer] of this.peers) {
      try {
        peer.pc.close();
      } catch {
        // ignore
      }
    }
  }

  // ── signaling handling ───────────────────────────────────────────────────

  private handleSignalingMessage(signal: ServerSignal): void {
    if (this.disposed) return;
    if (signal.t === "signal") {
      if (signal.kind === "description") {
        void this.handleOffer(
          signal.from,
          signal.data as RTCSessionDescriptionInit,
        );
        return;
      }
      if (signal.kind === "candidate") {
        void this.handleRemoteCandidate(
          signal.from,
          signal.data as RTCIceCandidateInit,
        );
        return;
      }
    }
  }

  private handleSignalingStatus(
    status: "connecting" | "open" | "closed",
    kind: "ws" | "http",
  ): void {
    if (this.disposed) return;
    this.signalingKind = kind;
    if (status === "open" && this.machine.phase === "connecting") {
      this.machine.dispatch("awaiting-receiver");
    }
    this.emit();
  }

  private handleSignalingFatal(code: string): void {
    if (this.disposed) return;
    if (code === "room_not_found") {
      this.failWithError({
        code: "room_expired",
        message: "This transfer session has expired. Create a new one to keep sharing.",
      });
      this.machine.reset("expired");
    } else if (code === "signaling_unavailable") {
      this.failWithError({
        code: "signaling_unavailable",
        message: "Lost contact with the signaling server.",
      });
      this.machine.reset("failed");
    } else {
      this.failWithError({
        code: "unknown",
        message: "The signaling server rejected this transfer.",
      });
      this.machine.reset("failed");
    }
    this.emit();
  }

  // ── WebRTC handling ──────────────────────────────────────────────────────

  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    let peer = this.peers.get(peerId);
    if (!peer) {
      const pc = createPeerConnection({
        iceServers: this.iceServers,
        onConnectionType: (quality) => this.handleConnectionQuality(peerId, quality),
      });
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void this.signaling
            ?.send(peerId, "candidate", event.candidate.toJSON())
            .catch(() => undefined);
        }
      };
      pc.ondatachannel = (event) => this.handleDataChannel(peerId, event.channel);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          this.handlePeerConnectionFailed(peerId);
        }
      };
      peer = {
        peerId,
        pc,
        channel: null,
        session: null,
        summary: { peerId, state: "connecting", progress: 0, joinedAt: Date.now() },
        pendingIce: [],
        quality: "checking",
      };
      this.peers.set(peerId, peer);
      if (this.machine.phase === "waiting") {
        this.machine.dispatch("negotiating");
      }
      this.emit();
    }

    try {
      await peer.pc.setRemoteDescription(offer);
      for (const candidate of peer.pendingIce.splice(0)) {
        try {
          await peer.pc.addIceCandidate(candidate);
        } catch {
          // Stale candidate — ignore.
        }
      }
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      await this.signaling
        ?.send(peerId, "description", peer.pc.localDescription?.toJSON() ?? answer)
        .catch(() => undefined);
      peer.summary.state = "connected";
      this.emit();
    } catch (error) {
      console.error("[file-burger] failed to answer receiver:", error);
      this.handlePeerConnectionFailed(peerId);
    }
  }

  private async handleRemoteCandidate(
    peerId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (!peer.pc.remoteDescription) {
      peer.pendingIce.push(candidate);
      return;
    }
    try {
      await peer.pc.addIceCandidate(candidate);
    } catch {
      // Stale candidate — ignore.
    }
  }

  private handleDataChannel(peerId: string, channel: RTCDataChannel): void {
    if (this.disposed) return;
    const peer = this.peers.get(peerId);
    if (!peer) return;

    const session = new SenderSession({
      peerId,
      files: this.files,
      getFile: (fileId) =>
        this.selectedFiles.find((file) => file.id === fileId)?.file,
      passwordVerifier: this.passwordVerifier,
      onSnapshot: (snapshot) => this.handleSessionSnapshot(snapshot),
      onFinished: (snapshot, terminal) =>
        this.handleSessionFinished(snapshot, terminal),
    });
    session.attach(channel);
    peer.session = session;
    peer.channel = channel;
    peer.summary.state = "connected";
    this.emit();
  }

  private handleConnectionQuality(peerId: string, quality: ConnectionQuality): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.quality = quality;
    // Headline quality follows the lead receiver's path.
    const lead = this.leadSnapshot();
    if (!lead || lead.peerId === peerId) {
      this.connectionQuality = quality;
    }
    this.emit();
  }

  private handlePeerConnectionFailed(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.summary.state = "failed";
    peer.session?.fail();
    this.emit();
  }

  // ── session aggregation ──────────────────────────────────────────────────

  private handleSessionSnapshot(snapshot: SenderSessionSnapshot): void {
    const peer = this.peers.get(snapshot.peerId);
    if (!peer) return;
    this.peerSnapshots.set(snapshot.peerId, snapshot);
    peer.summary = {
      peerId: snapshot.peerId,
      state: mapSessionState(snapshot.state),
      progress: snapshot.progress,
      joinedAt: peer.summary.joinedAt,
    };

    const phase = this.machine.phase;
    if (snapshot.state === "transferring") {
      if (this.transferStartedAt === 0) this.transferStartedAt = Date.now();
      if (phase === "waiting" || phase === "negotiating" || phase === "connecting") {
        this.machine.dispatch("transfer-started");
      } else if (phase === "paused") {
        this.machine.dispatch("transfer-resumed");
      }
    } else if (snapshot.state === "paused" && phase === "transferring") {
      this.machine.dispatch("transfer-paused");
    }
    this.emit();
  }

  private handleSessionFinished(
    snapshot: SenderSessionSnapshot,
    terminal: SenderSessionState,
  ): void {
    const peer = this.peers.get(snapshot.peerId);
    if (peer) {
      peer.summary = {
        peerId: snapshot.peerId,
        state: mapSessionState(terminal),
        progress: snapshot.progress,
        joinedAt: peer.summary.joinedAt,
      };
    }
    this.peerSnapshots.set(snapshot.peerId, snapshot);

    // Overall completion when every receiver session has finished.
    const sessions = Array.from(this.peerSnapshots.values());
    const hasAny = sessions.length > 0;
    const allTerminal = hasAny && sessions.every((s) => isTerminalState(s.state));
    if (allTerminal) {
      this.transferEndedAt = Date.now();
      const anyCompleted = sessions.some((s) => s.state === "completed");
      const allCancelled = sessions.every((s) => s.state === "cancelled");
      if (anyCompleted) {
        this.machine.dispatch("transfer-completed");
      } else if (allCancelled) {
        this.machine.dispatch("transfer-cancelled");
      } else {
        this.machine.dispatch("transfer-failed");
      }
    }
    this.emit();
  }

  private failWithError(error: TransferError): void {
    this.error = error;
    this.machine.dispatch("transfer-failed");
    this.emit();
  }
}

function isTerminalState(state: SenderSessionState): boolean {
  return (
    state === "completed" || state === "cancelled" || state === "failed"
  );
}

function mapSessionState(state: SenderSessionState): ReceiverSummary["state"] {
  switch (state) {
    case "handshaking":
      return "connecting";
    case "awaiting-accept":
      return "connected";
    case "transferring":
      return "transferring";
    case "paused":
      return "paused";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
  }
}
