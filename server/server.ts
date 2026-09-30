/**
 * File Burger custom server.
 *
 * Serves the Next.js app and attaches the WebSocket signaling hub at `/ws`.
 * Run with `npm run dev` (dev) or `npm run start` (production).
 */

import next from "next";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { handleWsConnection, startMaintenance } from "./ws-hub";

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOST ?? "0.0.0.0";

const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  const server = createServer((req, res) => {
    handle(req, res);
  });

  // WebSocket signaling at /ws.
  const wss = new WebSocketServer({
    noServer: true,
    // SDPs with many ICE candidates can be tens of KB; anything bigger is abuse.
    maxPayload: 128 * 1024,
  });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleWsConnection(ws, req);
      });
      return;
    }
    // Next.js dev handles its own HMR upgrade; production has none.
    if (!dev) {
      socket.destroy();
    }
  });

  const stopMaintenance = startMaintenance();

  server.listen(port, hostname, () => {
    console.log(
      `[file-burger] ready on http://localhost:${port} (${dev ? "development" : "production"})`,
    );
  });

  async function shutdown() {
    stopMaintenance();
    server.close();
    wss.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
