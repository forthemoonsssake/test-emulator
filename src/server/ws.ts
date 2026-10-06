import { WebSocketServer, WebSocket } from "ws";
import {
  captureNow,
  dispatchInput,
  getSession,
  navigate,
  sessionMeta,
  touch,
} from "./browser";
import type { InputEvent, NavAction } from "@/lib/types";

/**
 * Dedicated WebSocket server for frame streaming + input.
 * Runs on WS_PORT (default: main port + 1) so it works with a stock
 * `next start` server. The client falls back to HTTP polling when the
 * socket is unreachable (e.g. behind a single-port reverse proxy).
 */
export function startWsServer() {
  const g = globalThis as unknown as { __rb_wss_started?: boolean };
  if (g.__rb_wss_started) return;
  g.__rb_wss_started = true;

  // Vercel / serverless: no long-running listeners possible. The client
  // automatically falls back to HTTP frame polling in that environment.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.log("[rb-ws] serverless environment detected — websocket disabled");
    return;
  }

  const port = Number(process.env.WS_PORT || Number(process.env.PORT || 3000) + 1);

  try {
    const wss = new WebSocketServer({ port, path: "/rb" });

    wss.on("connection", (ws: WebSocket, req) => {
      const url = new URL(req.url || "/rb", "http://localhost");
      const sessionId = url.searchParams.get("session") || "";
      const session = getSession(sessionId);
      if (!session) {
        ws.close(4004, "unknown session");
        return;
      }

      session.sockets.add(ws);
      touch(session);

      // Prime the client: current meta + latest frame (or a fresh capture).
      try {
        ws.send(JSON.stringify({ type: "meta", meta: sessionMeta(session) }));
      } catch {}
      (async () => {
        const buf = session.lastFrame ?? (await captureNow(session).catch(() => null));
        if (buf && ws.readyState === ws.OPEN) {
          try {
            ws.send(buf);
          } catch {}
        }
      })();

      ws.on("message", (raw) => {
        touch(session);
        let msg: { kind: string; action?: NavAction; url?: string; ev?: InputEvent };
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (msg.kind === "input" && msg.ev) {
          dispatchInput(session, msg.ev).catch(() => {});
        } else if (msg.kind === "nav" && msg.action) {
          navigate(session, msg.action, msg.url).catch(() => {});
        } else if (msg.kind === "meta") {
          try {
            ws.send(JSON.stringify({ type: "meta", meta: sessionMeta(session) }));
          } catch {}
        }
      });

      ws.on("close", () => {
        session.sockets.delete(ws);
      });
      ws.on("error", () => {
        session.sockets.delete(ws);
      });

      const ping = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          try {
            ws.ping();
          } catch {}
        }
      }, 25_000);
      ws.on("close", () => clearInterval(ping));
    });

    wss.on("error", (err) => {
      // Port conflicts etc. should never crash the web server.
      console.error("[rb-ws] server error:", err.message);
    });

    console.log(`[rb-ws] remote-browser websocket listening on :${port}/rb`);
  } catch (err) {
    console.error("[rb-ws] failed to start:", err);
  }
}
