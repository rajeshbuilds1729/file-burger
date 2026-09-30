# Security review

This is an honest security assessment of File Burger — what is covered and,
just as importantly, what is **not**. No software is "fully secure"; this
document lists the limitations so you can deploy with clear eyes.

## Covered

### Transport encryption

- WebRTC DataChannels are always encrypted with **DTLS** — part of the WebRTC
  protocol, not optional.
- Signaling runs over the same origin as the app: **WSS** in production
  (HTTPS), and all REST signaling endpoints inherit the site's HTTPS.
- Production deployments should serve HTTPS only (see docs/DEPLOYMENT.md).

### Transfer ID enumeration

- Transfer IDs are derived from **60 bits of cryptographically random data**
  (Crockford base32) — enumeration of active transfers is computationally
  infeasible.
- IDs are normalized on lookup (case-insensitive, ambiguous characters mapped)
  but never shortened to guessable forms.

### Passwords

- The plaintext password **never leaves the browser** and is **never stored**:
  the sender's browser derives a PBKDF2-SHA256 verifier (150,000 iterations)
  from the password; the receiver's browser derives the same verifier
  independently. Only the verifier and its salt are stored server-side.
- Verification uses a constant-time comparison.
- The password gate gates the file list (metadata endpoint withholds files
  until verified) *and* the transfer accept (the sender double-checks the
  receiver's proof before sending anything).
- Brute force is blunted by rate limiting (10 verifications/min per IP+room)
  on top of the KDF cost.

### Sender-only operations

- Revoke/kick require an **owner key**: 128 bits of random data, generated at
  room creation, held only in the sender's sessionStorage, sent as a
  `x-owner-key` header — never in URLs (so it doesn't leak into logs or
  Referer headers).

### File contents

- The server **never receives** file contents — only metadata (filenames,
  sizes, MIME types) and WebRTC signaling messages.
- Received data lives only in the receiving browser (memory, IndexedDB, or
  disk via the File System Access API).

### Signaling abuse

- **Origin validation** on the WebSocket endpoint (same-origin by default,
  extendable via `ALLOWED_ORIGINS`).
- **Max payload** enforced by the WebSocket server (128 KiB) and re-checked on
  every REST signal body.
- **Rate limiting**: room creation (20/min per IP), joins (60/min per IP),
  signaling (600/min per IP), password verification (10/min per IP+room).
- **Message authentication**: the sender role requires the room's owner key;
  peers may only signal as themselves (peer IDs are server-assigned and never
  shared between peers); signals to unknown peers are rejected.
- **Peer caps** (64 per room) and idle-peer sweeping limit resource use.

### Malicious filenames

- Filenames are sanitized server-side at room creation and client-side when
  writing to disk or building ZIP entries: path separators, Windows drive
  prefixes, traversal sequences (`..`), control characters, and leading dots
  are stripped; length is bounded.
- The UI never uses `dangerouslySetInnerHTML`; React escapes all rendered
  filenames by default.

### Oversized payloads / DoS vectors

- Signaling messages are size-capped (128 KiB) and count-capped (512 files per
  transfer, 256 KiB manifest).
- Rate limiting caps request floods; room/peer caps bound memory growth per
  process; sessions expire automatically (default 6 h, configurable 1–72 h).
- The transfer protocol's chunking + backpressure bounds memory use on both
  sides regardless of file size.

## Not covered (honest limitations)

- **A malicious sender can send anything.** Integrity verification (SHA-256)
  detects *corruption*, not malice — the receiver should scan files with their
  own tools before opening them. The UI says so.
- **The password is a shared secret, not end-to-end crypto.** A receiver who
  knows the password can always accept the transfer. The password protects
  access to the transfer session, not the recipient's device after download.
- **In-memory rate limiting is per-process.** Behind a load balancer or with
  multiple instances, limits are per instance (Redis-backed room state helps
  with state, not rate limiting). Deploy behind a rate-limiting proxy for
  serious scale.
- **Signaling is unauthenticated beyond the checks above.** Anyone who knows a
  transfer ID can connect as a receiver (that's inherent to link-based
  sharing, like any "secret link" product). With a password set, they can't
  see the files or start a transfer without it.
- **Static TURN credentials are public.** `NEXT_PUBLIC_TURN_*` values are
  served to every browser. For production, serve short-lived credentials from
  a credential API (coturn `use-auth-secret` + a small REST endpoint).
- **No CSRF tokens on the REST API.** The API is same-origin by design;
  browsers enforce that cross-origin POSTs can't read responses (CORS is not
  enabled), and no cookies are used for authentication — there is nothing to
  forge. If you add cookie-based auth, add CSRF protection.
- **The receiver's ZIP is built client-side.** It inherits the trust model of
  the received data; entry names are sanitized, but the contents are whatever
  the sender sent.
- **Transfer resume works while both tabs stay open.** A full page reload
  loses in-memory file handles on the sender side (documented in the UI); the
  receiver restarts the transfer. The protocol's chunk indexes and resume
  offsets are in place for deeper persistence later.
- **HTTP on a LAN has no WebCrypto/WebRTC.** Both APIs require a secure
  context (HTTPS or localhost). The app shows a degraded experience with a
  clear message rather than silently failing.
- **Dependency advisories in the build toolchain.** `npm audit` reports
  vulnerabilities in `postcss` as bundled by Next.js 15 (fixed in Next 16, a
  breaking major upgrade). These affect the build-time CSS pipeline only —
  the app's CSS is first-party, and no attacker-controlled CSS or
  `sourceMappingURL` exists at runtime. Revisit when upgrading to Next 16.
