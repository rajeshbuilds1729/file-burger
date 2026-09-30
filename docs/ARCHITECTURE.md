# Architecture

This document explains how File Burger is put together, why the layers are
split the way they are, and which decisions were made for which reasons.

## Overview

```
┌────────────────────────────── Browser (sender) ─────────────────────────────┐
│  UI (React)          Transfer engine           File processing              │
│  /send, dashboards   SenderEngine              Blob.slice → chunks          │
│  hooks + stores      SenderSession (per peer)  incremental SHA-256          │
└──────────────┬───────────────────────┬───────────────────────────────────────┘
               │ signaling             │ file chunks (DTLS-encrypted)
               ▼                       ▼
┌──────────────────────┐        ┌──────────────────────┐
│  File Burger server  │        │  Receiver browser    │
│  ws-hub / REST routes│        │  ReceiverEngine      │
│  room store (memory  │        │  ReceiverTransfer    │
│  or Redis, TTL'd)    │        │  sinks → verify      │
└──────────────────────┘        └──────────────────────┘
```

The server brokers connections and holds ephemeral metadata only. File
contents travel directly between the two browsers over WebRTC DataChannels,
which are always encrypted with DTLS (that's part of the WebRTC protocol, not
an option we toggled).

## Layers

### 1. UI (`src/app`, `src/components`, `src/features/*/components`)

React Server Components for static pages, client components for everything
interactive. Reusable primitives (Button, Card, Dialog, Progress, Badge) are
hand-rolled in `components/ui` — deliberately small, accessible, and
dependency-light (clsx + tailwind-merge only). Framer Motion is used sparingly
for entrance/scale animations and respects `prefers-reduced-motion`.

### 2. Transfer engine (`src/features/*/engine.ts`, `src/lib/webrtc`)

The engines are plain TypeScript classes outside React. They expose a
subscribe/getSnapshot store interface consumed via `useSyncExternalStore`, so
they survive route changes (the sender engine is created on `/send` and lives
through `/send/[id]`).

- **SenderEngine** — creates the room, owns signaling, maintains one
  `RTCPeerConnection` per receiver (receiver-initiated offers), and one
  `SenderSession` per accepted receiver. Provides cancel/revoke/kick/pause.
- **ReceiverEngine** — fetches metadata (password gate), accepts/declines,
  establishes the connection, and drives `ReceiverTransfer` with automatic
  reconnection (up to 3 attempts with backoff).

**Sessions** (`lib/webrtc/sender-session.ts`, `lib/webrtc/receiver-transfer.ts`)
implement the file transfer protocol over a `DataChannelLike`:

- one DataChannel carries control messages (JSON text frames) and file data
  (binary frames of raw chunk bytes)
- chunking with **adaptive chunk sizes** (16 KiB → 64 KiB) and **real
  backpressure** — the sender stops reading from the file while the channel
  buffer is above the high-water mark, resuming on `bufferedamountlow`
- **incremental SHA-256** on both sides, computed while streaming (never
  `file.arrayBuffer()` on whole files)
- pause/resume, cancellation, a completion handshake (`complete` sent by the
  receiver only after every file is verified, so the sender never closes the
  channel mid-processing)

The `DataChannelLike` abstraction is what makes the transfer layer testable in
Node: `createChannelPair` (lib/webrtc/channel.ts) builds connected in-memory
channels, and the integration tests run the *real* protocol end to end over
them — handshake, chunking, backpressure, hashing, resume, cancellation.

### 3. Signaling (`src/lib/signaling`, `server/ws-hub.ts`)

Only connection metadata (join/leave, session descriptions, ICE candidates)
flows through signaling. Never file contents.

**Transports** behind one interface:

- **WebSocket** (primary): a single connection to the custom server, push
  delivery, heartbeats, origin checks.
- **HTTP short-polling** (fallback): REST endpoints, ~700 ms poll. Works on
  any host including serverless platforms without WebSocket support. The
  client probes WebSocket first and falls back automatically; a peer declares
  its transport on join so mixed WS/HTTP rooms route cleanly.

**Receiver-initiated offers**: the receiver creates the offer and sends it to
the `"sender"` alias. This means the sender doesn't need to know when
receivers join — it learns via offers — and the same flow works over both
transports.

**Room store** (`lib/signaling/store.ts`): in-memory by default (zero
configuration, single process) with TTL-based expiry and periodic sweeps;
Redis-backed (`REDIS_URL`) when configured, with TTLs so sessions expire even
across restarts. Rooms hold filenames/sizes/types, the password verifier, and
per-peer signal queues.

### 4. File processing (`src/lib/files`)

- **chunker.ts** — async generator over `Blob.slice` slices; adaptive sizes;
  one small slice in memory at a time.
- **hash.ts** — incremental SHA-256 (js-sha256) so multi-GB files hash while
  streaming.
- **sink.ts** — where received data is written, behind one interface:
  - **FileSystemDirectorySink** — streams chunks straight to disk via the
    File System Access API (Chromium, opt-in; the user picks a folder when
    accepting). No memory limits.
  - **IndexedDbSink** — chunks stored in IndexedDB (stored by reference in
    Chromium), assembled into a Blob at the end. Default for large files.
  - **MemorySink** — Blob parts in memory. Default for small files.
- **zip.ts** — "Download All" builds a ZIP in the receiver's browser
  (client-zip, streaming) from already-received data. It never passes through
  the server. Entry names are sanitized.

### 5. State management (`src/features/transfer`)

- **state-machine.ts** — a pure `transition(current, event)` function plus an
  allowed-transitions table. The engines drive their overall phase through it,
  so the machine is genuinely load-bearing (and unit-tested).
- **speedometer.ts** — EMA-based speed estimation and ETA.

### 6. Infrastructure (optional)

- **Redis** — ephemeral room metadata + signal queues when `REDIS_URL` is set.
- **coturn** — TURN relay for peers that cannot connect directly; configured
  via `NEXT_PUBLIC_TURN_URLS` (see docs/DEPLOYMENT.md).
- **Docker / Docker Compose** — multi-stage build; Redis and coturn services
  are optional profiles.

## Key decisions

| Decision | Why |
| --- | --- |
| Receiver-initiated offers | Sender learns about receivers via offers; identical flow over WS and HTTP transports |
| One DataChannel, text control + binary chunks | Ordered/reliable channel means no per-chunk header is needed; simpler and robust |
| 16→64 KiB adaptive chunks | 16 KiB is safe in every modern browser; growing when the channel keeps up recovers throughput |
| Backpressure via `bufferedAmount` + `bufferedamountlow` | Standard WebRTC flow control; polling fallback for browsers/hosts that don't fire the event |
| Password verifier derived in the browser (PBKDF2, 150k iterations) | The plaintext password never leaves either browser; the server only sees/stores a KDF verifier; constant-time comparison |
| Owner key for sender operations (never in URLs) | Revoke/kick are authorized by a 128-bit key held in sessionStorage, sent as a header |
| SHA-256 while streaming | No upfront hashing delay on huge files; the receiver verifies the digest on completion |
| `DataChannelLike` abstraction | The transfer lifecycle is testable in Node (no browser needed) and the WebRTC wiring stays thin |
| HTTP polling fallback | Signaling works on serverless hosts; WS stays primary where available |
| In-memory room store with optional Redis | Zero-config local runs; Redis keeps state across restarts for self-hosters |

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing: hero + dropzone, how it works, privacy, features, FAQ preview |
| `/send` | File selection and transfer creation |
| `/send/[id]` | Sender transfer dashboard (share card, receivers, progress) |
| `/receive/[id]` | Receiver screen (consent gate, progress, completion) |
| `/about` | How it works / under the hood |
| `/faq` | FAQ |
| `/privacy` | Privacy policy |
| `/terms` | Terms |
| `/api/rooms` | POST create room (metadata only) |
| `/api/rooms/[id]` | GET metadata (password-gated) · DELETE revoke (owner key) |
| `/api/rooms/[id]/verify` | POST password verifier → file list |
| `/api/rooms/[id]/join` | POST join for HTTP polling → peer ID |
| `/api/rooms/[id]/signals` | GET poll · POST route signals |
| `/api/rooms/[id]/leave` | POST leave |
| `/api/ice` | GET ICE server configuration |
| `/api/health` | Health check |

## Protocol walkthrough

```
receiver → sender : hello {protocol}
sender → receiver : manifest [{id, name, size, type, hash}]
receiver → sender : accept {files: [ids], proof?, resume?: {fileId, offset}}
sender → receiver : file-start {fileId, name, size, type, chunkSize}
sender → receiver : <binary chunks>
sender → receiver : file-end {fileId, hash}
receiver → sender : complete {files}        ← only after all files verified
either side       : pause / resume / cancel / error
```

The receiver detects its own completion (all bytes received, hash verified).
The sender marks a receiver complete on its `complete` message and closes the
channel — safe, because the receiver only sends it after everything is written.

### Resume after a dropped connection

Both sessions survive a DataChannel drop. The receiver's engine re-joins
signaling, re-offers, and reports its resume state (`fileId` + `offset`) in the
`accept` message. The sender re-hashes the prefix the receiver already has,
then continues streaming from the offset. Already-completed files are skipped
(the accept lists only the files the receiver still wants). If the sender's
browser closed (room gone), the receiver sees a clear "sender disconnected"
error.
