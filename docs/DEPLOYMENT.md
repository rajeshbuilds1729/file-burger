# Deployment

File Burger is designed to be self-hosted. Three paths, from simplest to
most controlled.

## Requirements

- Node.js 20+ (22 recommended)
- HTTPS in production (WebRTC requires a secure context: HTTPS or localhost)
- No database required — session metadata is ephemeral (in-memory or Redis)

## 1. Traditional Node hosting (VPS)

```bash
git clone <your-repo> file-burger
cd file-burger
npm install
npm run build
npm run start   # PORT=3000 by default
```

Put a reverse proxy (nginx, Caddy, Caddy makes HTTPS automatic) in front:

```nginx
# nginx: WebSocket + HTTPS termination
server {
    listen 443 ssl;
    server_name fileburger.example.com;
    # ... certificates ...

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;      # WebSocket (/ws)
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Set `NEXT_PUBLIC_SITE_URL=https://fileburger.example.com` so share links and
QR codes use the right origin.

Run it under a process manager (systemd unit, pm2, etc.). The custom server
handles graceful shutdown on SIGINT/SIGTERM.

## 2. Docker

```bash
docker build -t file-burger .
docker run -p 3000:3000 -e NEXT_PUBLIC_SITE_URL=https://fileburger.example.com file-burger
```

## 3. Docker Compose (with optional Redis + TURN)

```bash
docker compose up --build
```

The compose file includes optional `redis` (enabled via the `redis` profile)
and `coturn` (via the `turn` profile) services:

```bash
# with Redis:
docker compose --profile redis up --build
# with Redis + TURN:
docker compose --profile redis --profile turn up --build
```

When Redis is on, set `REDIS_URL=redis://redis:6379` in the app service
environment (see docker-compose.yml).

## TURN configuration (coturn)

STUN handles most NAT traversal. For peers on strict networks (symmetric NAT,
corporate firewalls), configure a TURN relay:

1. Enable the `turn` profile (or run coturn yourself).
2. Point the app at it:

```env
NEXT_PUBLIC_TURN_URLS=["turn:turn.example.com:3478?transport=udp","turn:turn.example.com:3478?transport=tcp","turns:turn.example.com:5349?transport=tcp"]
NEXT_PUBLIC_TURN_USERNAME=fileburger
NEXT_PUBLIC_TURN_CREDENTIAL=<secret>
```

3. Open the relay ports (3478/udp, 3478/tcp, 5349/tcp) and the relay port
   range coturn uses for media (default 49152-65535/udp — see
   `min-port`/`max-port` in the compose config).

**Security note:** with static credentials, anyone using the site can read
them from `/api/ice` (they are served to the browser by design). For
production, use coturn's `use-auth-secret` with a tiny credential API that
issues short-lived HMAC credentials, and have `/api/ice` call it instead of
reading static env vars.

**Honesty about paths:** not every transfer will be direct. The app detects
the selected candidate pair via WebRTC stats and labels transfers
**Direct P2P** or **Relayed** in the UI — no pretending.

## Vercel / serverless

The HTTP-polling signaling fallback works on platforms without WebSocket
support: the API routes are standard Next.js route handlers, and the client
falls back to HTTP polling automatically when the WebSocket can't connect.
Deploy the repo to Vercel with no special configuration.

Caveats:
- Without WebSockets, signaling latency is higher (~700 ms poll interval) —
  connection setup takes a second longer, transfers are unaffected (they are
  direct P2P).
- The in-memory room store is per-instance on serverless; enable Redis
  (`REDIS_URL`) for shared state across instances.
- The custom server (`npm run start`) is not used on Vercel; the platform
  runs the Next.js build directly.

## Environment variables

See `.env.example` and the README table. Nothing is hard-coded to specific
infrastructure: every deployment knob is an environment variable.
