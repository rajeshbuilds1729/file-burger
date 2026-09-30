"use client";

import { CheckCircle2, Loader2, Radio, ShieldAlert, Wifi, WifiOff } from "lucide-react";
import { Badge } from "./ui/badge";
import type { ConnectionQuality } from "@/types/transfer";
import type { TransferPhase } from "@/types/transfer";

/** Connection quality badge: Direct P2P vs Relayed — never overstated. */
export function ConnectionBadge({ quality }: { quality: ConnectionQuality }) {
  switch (quality) {
    case "direct":
      return (
        <Badge tone="success">
          <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
          Direct P2P
        </Badge>
      );
    case "relayed":
      return (
        <Badge tone="warning">
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          Relayed
        </Badge>
      );
    case "checking":
      return (
        <Badge tone="neutral">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Checking path…
        </Badge>
      );
    case "failed":
      return (
        <Badge tone="danger">
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          Path failed
        </Badge>
      );
    default:
      return null;
  }
}

const PHASE_LABELS: Partial<Record<TransferPhase, { label: string; tone: "neutral" | "accent" | "success" | "danger" | "warning" }>> = {
  idle: { label: "Ready", tone: "neutral" },
  selecting: { label: "Selecting files", tone: "neutral" },
  ready: { label: "Ready to create", tone: "neutral" },
  creating: { label: "Creating transfer…", tone: "accent" },
  connecting: { label: "Your files are cooking…", tone: "accent" },
  waiting: { label: "Waiting for receiver", tone: "neutral" },
  negotiating: { label: "Negotiating connection…", tone: "accent" },
  transferring: { label: "Serving your files…", tone: "accent" },
  paused: { label: "Paused", tone: "warning" },
  reconnecting: { label: "Reconnecting…", tone: "warning" },
  completed: { label: "Burger served!", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  expired: { label: "Expired", tone: "danger" },
};

/** Transfer phase badge with screen-reader-friendly labeling. */
export function PhaseBadge({ phase }: { phase: TransferPhase }) {
  const config = PHASE_LABELS[phase];
  if (!config) return null;
  return (
    <Badge tone={config.tone}>
      {config.tone === "success" && (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {config.tone === "danger" && (
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {config.label}
    </Badge>
  );
}
