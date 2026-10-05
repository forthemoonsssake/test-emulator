"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DeviceProfile,
  InputEvent,
  NavAction,
  ServerMessage,
  SessionMeta,
} from "@/lib/types";

export type SessionStatus = "idle" | "starting" | "live" | "error";
export type Transport = "ws" | "http" | null;

export interface RemoteSessionState {
  status: SessionStatus;
  error: string | null;
  sessionId: string | null;
  profile: DeviceProfile | null;
  meta: SessionMeta | null;
  transport: Transport;
  fps: number;
  activeProxy: string | null;
  /** 'real' = routed through an actual Tor circuit; 'simulated' otherwise. */
  torMode: "real" | "simulated" | null;
  serverless: boolean;
  autoRotate: boolean;
}

const INITIAL: RemoteSessionState = {
  status: "idle",
  error: null,
  sessionId: null,
  profile: null,
  meta: null,
  transport: null,
  fps: 0,
  activeProxy: null,
  torMode: null,
  serverless: false,
  autoRotate: false,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useRemoteSession() {
  const [state, setState] = useState<RemoteSessionState>(INITIAL);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const objUrlRef = useRef<string | null>(null);
  const deadRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const transportRef = useRef<Transport>(null);
  const seqRef = useRef(0);
  const metaRef = useRef<SessionMeta | null>(null);
  const fpsCountRef = useRef(0);
  const lastRecordedRef = useRef<string>("");

  /* ------------------------------------------------ frame plumbing */

  const deliverBlob = useCallback((blob: Blob) => {
    const el = imgRef.current;
    if (!el) return;
    const url = URL.createObjectURL(blob);
    el.src = url;
    if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current);
    objUrlRef.current = url;
    fpsCountRef.current += 1;
  }, []);

  const registerTarget = useCallback((el: HTMLImageElement | null) => {
    imgRef.current = el;
  }, []);

  // High-precision FPS: update every 500ms using a rolling average
  useEffect(() => {
    let lastTime = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const dt = now - lastTime;
      const currentFps = Math.round((fpsCountRef.current * 1000) / dt);
      setState((s) => ({ ...s, fps: currentFps }));
      fpsCountRef.current = 0;
      lastTime = now;
    }, 500);
    return () => clearInterval(t);
  }, []);

  /* ------------------------------------------------ meta + history */

  const applyMeta = useCallback((meta: SessionMeta) => {
    metaRef.current = meta;
    setState((s) => ({ ...s, meta }));
    // Record each freshly-loaded real URL once — but never for Tor sessions.
    if (state.profile?.id === "tor") return;
    const urlOk = meta.url && !meta.url.startsWith("about:") && !meta.url.startsWith("data:");
    if (!meta.loading && urlOk && lastRecordedRef.current !== meta.url) {
      lastRecordedRef.current = meta.url;
      const profileLabel = state.profile?.label;
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: meta.url, title: meta.title, profileLabel, engine: state.profile?.engine }),
      }).catch(() => {});
    }
  }, [state.profile?.label, state.profile?.engine]);

  /* ------------------------------------------------ transports */

  const stopTransports = useCallback(() => {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    transportRef.current = null;
  }, []);

  const sendInput = useCallback((ev: InputEvent) => {
    const id = state.sessionId;
    if (!id) return;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ kind: "input", ev }));
      return;
    }
    fetch(`/api/session/${id}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev),
      keepalive: true,
    }).catch(() => {});
  }, [state.sessionId]);

  /** HTTP long-poll loop — always available, used as fallback transport. */
  const startPolling = useCallback(
    (id: string) => {
      const ac = new AbortController();
      pollAbortRef.current = ac;
      (async () => {
        while (!deadRef.current && !ac.signal.aborted) {
          try {
            const res = await fetch(`/api/session/${id}/frame?seq=${seqRef.current}`, {
              signal: ac.signal,
              cache: "no-store",
            });
            if (res.status === 404) break;
            if (res.status === 200) {
              const seq = Number(res.headers.get("X-Frame-Seq") || 0);
              if (seq > seqRef.current) seqRef.current = seq;
              const blob = await res.blob();
              if (blob.size > 0) deliverBlob(blob);
            }
          } catch {
            await sleep(120);
          }
        }
      })();
      // Meta polling (WS clients receive pushes instead).
      (async () => {
        while (!deadRef.current && !ac.signal.aborted && transportRef.current === "http") {
          try {
            const res = await fetch(`/api/session/${id}/state`, { cache: "no-store", signal: ac.signal });
            if (res.status === 404) break;
            if (res.ok) {
              const data = (await res.json()) as { meta: SessionMeta };
              applyMeta(data.meta);
            }
          } catch {
            /* retry */
          }
          await sleep(900);
        }
      })();
    },
    [applyMeta, deliverBlob]
  );

  const startWebSocket = useCallback(
    (id: string, wsPort: number): Promise<boolean> =>
      new Promise((resolve) => {
        // The side-channel only makes sense when we can address a port
        // directly (local usage). Behind a port-less public URL we poll.
        if (typeof window === "undefined" || !window.location.port) {
          resolve(false);
          return;
        }
        let settled = false;
        const done = (ok: boolean) => {
          if (!settled) {
            settled = true;
            resolve(ok);
          }
        };
        try {
          const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
          const ws = new WebSocket(`${proto}//${window.location.hostname}:${wsPort}/rb?session=${id}`);
          ws.binaryType = "blob";
          const timer = setTimeout(() => {
            try {
              ws.close();
            } catch {}
            done(false);
          }, 1800);

          ws.onopen = () => {
            clearTimeout(timer);
            wsRef.current = ws;
            transportRef.current = "ws";
            setState((s) => ({ ...s, transport: "ws" }));
            done(true);
          };
          ws.onmessage = (e) => {
            if (typeof e.data === "string") {
              try {
                const msg = JSON.parse(e.data) as ServerMessage;
                if (msg.type === "meta") applyMeta(msg.meta);
              } catch {}
            } else if (e.data instanceof Blob) {
              deliverBlob(e.data);
            }
          };
          ws.onerror = () => {
            clearTimeout(timer);
            done(false);
          };
          ws.onclose = () => {
            if (wsRef.current === ws) {
              wsRef.current = null;
              if (transportRef.current === "ws" && !deadRef.current) {
                transportRef.current = "http";
                setState((s) => ({ ...s, transport: "http" }));
              }
            }
            done(false);
          };
        } catch {
          done(false);
        }
      }),
    [applyMeta, deliverBlob]
  );

  /* ------------------------------------------------ lifecycle */

  const stop = useCallback(async () => {
    deadRef.current = true;
    stopTransports();
    const id = state.sessionId;
    if (id) fetch(`/api/session/${id}`, { method: "DELETE" }).catch(() => {});
    if (objUrlRef.current) {
      URL.revokeObjectURL(objUrlRef.current);
      objUrlRef.current = null;
    }
    seqRef.current = 0;
    metaRef.current = null;
    lastRecordedRef.current = "";
    setState(INITIAL);
  }, [state.sessionId, stopTransports]);

  const proxyListRef = useRef<string[]>([]);
  const start = useCallback(
    async (profileId: string, url?: string, proxies?: string[], autoRotate?: boolean) => {
      proxyListRef.current = proxies || [];
      if (autoRotate !== undefined) {
        setState((s) => ({ ...s, autoRotate }));
      }
      
      // Tear down any previous session.
      const prevId = state.sessionId;
      deadRef.current = true;
      stopTransports();
      if (prevId) fetch(`/api/session/${prevId}`, { method: "DELETE" }).catch(() => {});
      seqRef.current = 0;
      metaRef.current = null;

      // Preserve the current profile during a hot-switch so the shell can
      // keep rendering while the replacement engine boots.
      setState((s) => ({
        status: "starting",
        error: null,
        sessionId: s.sessionId,
        profile: s.profile,
        meta: s.meta,
        transport: s.transport,
        fps: 0,
        activeProxy: s.activeProxy,
        torMode: s.torMode,
        serverless: s.serverless,
        autoRotate: s.autoRotate,
      }));
      deadRef.current = false;

      try {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId, url, proxies }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `Failed to start session (${res.status})`);
        }
        const data = (await res.json()) as {
          id: string;
          profile: DeviceProfile;
          meta: SessionMeta;
          wsPort: number;
          torMode: "real" | "simulated" | null;
          activeProxy: string | null;
          serverless: boolean;
        };
        if (deadRef.current) return;

        metaRef.current = data.meta;
        setState((s) => ({
          status: "live",
          error: null,
          sessionId: data.id,
          profile: data.profile,
          meta: data.meta,
          transport: null,
          fps: 0,
          activeProxy: data.activeProxy,
          torMode: data.torMode ?? null,
          serverless: !!data.serverless,
          autoRotate: s.autoRotate,
        }));

        // Try the fast path first; fall back to polling (which also always
        // runs in parallel for frame robustness).
        const wsOk = await startWebSocket(data.id, data.wsPort);
        if (deadRef.current) return;
        if (!wsOk) {
          transportRef.current = "http";
          setState((s) => (s.sessionId === data.id ? { ...s, transport: "http" } : s));
        }
        startPolling(data.id);
      } catch (err) {
        if (deadRef.current) return;
        setState({
          ...INITIAL,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [state.sessionId, startPolling, startWebSocket, stopTransports]
  );

  const nav = useCallback(
    (action: NavAction, url?: string) => {
      const id = state.sessionId;
      if (!id) return;
      fetch(`/api/session/${id}/nav`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, url }),
      })
        .then(async (res) => {
          if (res.status === 404) {
            setState((s) => ({
              ...INITIAL,
              status: "error",
              error: "The remote session expired. Start a new one.",
            }));
            return;
          }
          if (res.ok) {
            const data = (await res.json()) as { meta: SessionMeta };
            applyMeta(data.meta);
          }
        })
        .catch(() => {});
    },
    [state.sessionId, applyMeta]
  );

  // Cleanup on unmount / tab close.
  useEffect(() => {
    return () => {
      deadRef.current = true;
      stopTransports();
    };
  }, [stopTransports]);

  // Automatic proxy rotation: restart session every 5 min with a new proxy.
  useEffect(() => {
    if (state.autoRotate && state.status === "live") {
      const timer = setInterval(() => {
        const url = metaRef.current?.url && metaRef.current.url !== "about:blank" ? metaRef.current.url : undefined;
        start(state.profile!.id, url, proxyListRef.current, true);
      }, 5 * 60 * 1000);
      return () => clearInterval(timer);
    }
  }, [state.autoRotate, state.status, state.profile, start]);

  useEffect(() => {
    const id = state.sessionId;
    if (!id) return;
    const bye = () => {
      fetch(`/api/session/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
    window.addEventListener("beforeunload", bye);
    return () => window.removeEventListener("beforeunload", bye);
  }, [state.sessionId]);

  return { state, start, stop, nav, sendInput, registerTarget };
}
