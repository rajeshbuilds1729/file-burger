# File Burger

**Send files directly from your browser to another browser.**

File Burger is a privacy-focused, browser-based peer-to-peer file sharing app.
Drop your files, get a link, send it to someone — the two browsers connect via
WebRTC and files transfer directly between them. File contents never touch the
server.

```
Sender browser ──► WebRTC (DTLS-encrypted) ──► Receiver browser
                        ▲
                        │ signaling metadata only (never file contents)
                 File Burger server
```

## Features

- **Peer-to-peer transfers** — WebRTC DataChannels, always DTLS-encrypted
- **No account** — open the page and send
- **Multiple files** — mixed types, duplicate names, drag-and-drop, file picker, clipboard paste
- **Real-time progress** — live speed, ETA, per-file progress on both sides
- **Password protection** — optional; verified without the server ever seeing the password
- **QR sharing** — scan to open the transfer on another device
- **Native share sheet** — Web Share API where supported
- **Large-file support** — chunked streaming with backpressure; no `arrayBuffer()` on whole files
- **Integrity verification** — SHA-256 computed while streaming, verified on receipt
- **Reconnection** — automatic resume of interrupted transfers
- **Multiple receivers** — each with an independent progress indicator
- **Ephemeral sessions** — automatic expiration, revocable links

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 in two browser windows (or two devices on your
network), drop files in one, and open the link in the other.

Everything works with zero configuration. The signaling server runs in-process
with the Next.js custom server; rooms are kept in memory and expire
automatically.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Development server (Next.js + WebSocket signaling) with hot reload |
| `npm run build` | Production build |
| `npm run start` | Production server (serves the build + WebSocket signaling) |
| `npm run test` | Unit + integration tests (vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run e2e` | End-to-end tests (Playwright, Chromium) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |

## Environment variables

All optional — see `.env.example`:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP + WebSocket port for the custom server |
| `NEXT_PUBLIC_SITE_URL` | browser origin | Public base URL (share links, QR codes, metadata) |
| `NEXT_PUBLIC_TURN_URLS` | — | JSON array of TURN URLs for peers that can't connect directly |
| `NEXT_PUBLIC_TURN_USERNAME` | — | TURN username |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | — | TURN credential |
| `REDIS_URL` | in-memory | Store ephemeral transfer metadata in Redis instead of process memory |
| `SESSION_TTL_HOURS` | `6` | Transfer session expiration (1–72) |
| `ALLOWED_ORIGINS` | same-origin | Extra origins allowed to open the WebSocket signaling connection |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture. Short version:

```text
src/
  app/                    # Next.js App Router: pages + REST API routes
  components/             # Shared UI: design system, dropzone, file queue, branding
  features/
    sender/               # Sender engine + dashboard components
    receiver/             # Receiver engine + screens
    transfer/             # State machine + speed estimation
  hooks/                  # Copy, paste, Web Share, reduced-motion
  lib/
    webrtc/               # Transfer sessions, protocol, peer connections
    signaling/            # Transports (WS + HTTP polling), client, room store
    files/                # Chunking, hashing, sinks (FSA/IndexedDB/memory), ZIP
    crypto/               # PBKDF2 password verification
  types/                  # Shared transfer types
server/
  server.ts               # Custom Next.js server + WebSocket upgrade
  ws-hub.ts               # WebSocket signaling hub
tests/
  unit/                   # Chunking, hashing, IDs, protocol, state machine…
  integration/            # Full transfer lifecycle over in-memory channels; signaling
  e2e/                    # Playwright: sender → receiver flow
```

Key layers are framework-agnostic: the transfer engine is written against a
`DataChannelLike` interface, which is what makes the full transfer lifecycle
testable in Node without a browser.

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the honest list — what's covered
and what isn't. Highlights: transfer IDs are 60-bit random (non-enumerable),
passwords are never transmitted or stored in plaintext (PBKDF2 verifiers only),
file contents never reach the server, signaling payloads are size-capped and
rate-limited, and owner-only operations (revoke/kick) require a separate owner
key that never appears in URLs.

## Deployment

Self-host with Node, Docker, or Docker Compose — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). TURN (coturn) is optional; Redis is
optional. The HTTP-polling signaling fallback also makes the app compatible
with serverless hosts that don't support WebSockets.

## License

MIT
