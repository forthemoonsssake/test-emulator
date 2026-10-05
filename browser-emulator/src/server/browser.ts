import { execSync } from "child_process";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type BrowserType,
  type CDPSession,
  type Page,
} from "playwright";
import type { WebSocket } from "ws";
import type {
  DeviceProfile,
  Engine,
  InputEvent,
  NavAction,
  SessionMeta,
} from "@/lib/types";
import { getProfile } from "./profiles";
import { ensureTor, isServerless, TOR_SOCKS } from "./tor";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RemoteSession {
  id: string;
  profile: DeviceProfile;
  engine: Engine;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession | null;
  url: string;
  title: string;
  loading: boolean;
  stack: string[];
  stackIdx: number;
  lastFrame: Buffer | null;
  frameSeq: number;
  lastFrameAt: number;
  frameWaiters: Array<(seq: number) => void>;
  sockets: Set<WebSocket>;
  createdAt: number;
  lastActive: number;
  closed: boolean;
  capturing: boolean;
  captureTimer: NodeJS.Timeout | null;
  /** Only set for the Tor profile: whether the circuit is a real SOCKS5 route. */
  torMode: "real" | "simulated" | null;
  activeProxy: string | null;
}

interface EngineEntry {
  browser: Browser | null;
  launching: Promise<Browser> | null;
  available: boolean | null;
  version: string;
  error: string | null;
}

/* ------------------------------------------------------------------ */
/*  Global store (shared across Next.js bundles via globalThis)        */
/* ------------------------------------------------------------------ */

const MAX_SESSIONS = 6;
const IDLE_WITH_CONSUMERS_MS = 12 * 60 * 1000;
const IDLE_WITHOUT_CONSUMERS_MS = 75 * 1000;

interface TorEntry {
  browser: Browser | null;
  launching: Promise<Browser | null> | null;
}

interface Store {
  sessions: Map<string, RemoteSession>;
  engines: Partial<Record<Engine, EngineEntry>>;
  tor: TorEntry | null;
  reaperStarted: boolean;
  probing: Promise<void> | null;
}

const g = globalThis as unknown as { __rb_store?: Store };

function store(): Store {
  if (!g.__rb_store) {
    g.__rb_store = {
      sessions: new Map(),
      engines: {},
      tor: null,
      reaperStarted: false,
      probing: null,
    };
  }
  const s = g.__rb_store;
  if (!s.reaperStarted) {
    s.reaperStarted = true;
    setInterval(reapSessions, 20_000).unref?.();
    for (const sig of ["SIGINT", "SIGTERM"] as const) {
      process.once(sig, () => {
        for (const sess of s.sessions.values()) destroySession(sess.id).catch(() => {});
      });
    }
  }
  return s;
}

/* ------------------------------------------------------------------ */
/*  Stealth / anti-detection init scripts                              */
/* ------------------------------------------------------------------ */

const STEALTH_COMMON = `
// Hide the automation flag — the #1 bot tell.
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
// Realistic languages for the Accept-Language we send.
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
// Permissions API: return real notification state instead of 'denied' tells.
try {
  const origQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
  window.navigator.permissions.query = (p) =>
    p && p.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : origQuery(p);
} catch (e) {}
// outerWidth/outerHeight sanity (headless reports 0x0 otherwise).
try {
  Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
  Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 85 });
} catch (e) {}
// Prevent the "focus steal" detection used by some captchas.
try {
  window.addEventListener('blur', () => {}, true);
} catch (e) {}
`;

const STEALTH_CHROMIUM = `
// window.chrome exists on every real Chrome/Edge.
if (!('chrome' in window)) {
  window.chrome = { runtime: {}, app: {}, csi: () => {}, loadTimes: () => {} };
}
// Non-empty plugin list (headless Chrome ships zero plugins).
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const arr = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer' },
    ];
    arr.item = (i) => arr[i];
    arr.namedItem = (n) => arr.find((p) => p.name === n) || null;
    arr.refresh = () => {};
    return arr;
  },
});
// WebGL vendor/renderer: report a real GPU string.
try {
  const getParam = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (p) {
    if (p === 37445) return 'Intel Inc.';
    if (p === 37446) return 'Intel Iris OpenGL Engine';
    return getParam.call(this, p);
  };
} catch (e) {}
`;

function stealthFor(engine: Engine): string {
  return STEALTH_COMMON + (engine === "chromium" ? STEALTH_CHROMIUM : "");
}

/* ------------------------------------------------------------------ */
/*  Engine pool                                                        */
/* ------------------------------------------------------------------ */

const ENGINE_DEFS: Record<Engine, { type: () => BrowserType; args?: string[] }> = {
  chromium: {
    type: () => chromium,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=AutomationControlled,TranslateUI",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  },
  firefox: { type: () => firefox },
  webkit: { type: () => webkit },
};

function engineEntry(engine: Engine): EngineEntry {
  const s = store();
  if (!s.engines[engine]) {
    s.engines[engine] = {
      browser: null,
      launching: null,
      available: null,
      version: "",
      error: null,
    };
  }
  return s.engines[engine]!;
}

export async function getEngineBrowser(engine: Engine): Promise<Browser> {
  const entry = engineEntry(engine);
  if (entry.browser && entry.browser.isConnected()) return entry.browser;
  if (entry.launching) return entry.launching;

  entry.launching = (async () => {
    try {
      if (isServerless()) {
        if (engine !== "chromium") {
          throw new Error(
            `${engine} can't run on serverless platforms — Chromium only there`
          );
        }
        // Vercel / AWS Lambda: use the lambda-optimised Chromium build.
        const sparticuz = (await import("@sparticuz/chromium")).default;
        sparticuz.setGraphicsMode = false;
        const executablePath = await sparticuz.executablePath();
        const browser = await chromium.launch({
          headless: true,
          executablePath,
          args: [...sparticuz.args, "--disable-dev-shm-usage"],
        });
        entry.browser = browser;
        entry.available = true;
        entry.version = browser.version();
        entry.error = null;
        browser.on("disconnected", () => {
          entry.browser = null;
        });
        return browser;
      }

      const def = ENGINE_DEFS[engine];
      const launchOpts: Parameters<BrowserType["launch"]>[0] = {
        headless: true,
        args: def.args ?? [],
      };
      if (engine === "firefox") {
        launchOpts.firefoxUserPrefs = {
          "dom.webdriver.enabled": false,
          "useAutomationExtension": false,
          "toolkit.telemetry.enabled": false,
        };
      }
      if (engine === "webkit") {
        // Required for WebKit/MiniBrowser in containerised environments.
        launchOpts.env = {
          ...process.env,
          WEBKIT_DISABLE_DMABUF_RENDERER: "1",
        } as NodeJS.ProcessEnv;
      }
      let browser: Browser;
      try {
        browser = await def.type().launch(launchOpts);
      } catch (launchErr) {
        // If the binary is missing, auto-install it and retry once.
        const msg = launchErr instanceof Error ? launchErr.message : "";
        if (msg.includes("Executable doesn't exist") || msg.includes("executable doesn't exist")) {
          console.log(`[engine] ${engine} binary missing — auto-installing…`);
          try {
            execSync(`npx playwright install --with-deps ${engine}`, {
              timeout: 180_000,
              stdio: "pipe",
              env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
            });
            console.log(`[engine] ✓ ${engine} installed successfully`);
          } catch (installErr) {
            console.error(`[engine] ✗ failed to install ${engine}:`, installErr);
            throw launchErr;
          }
          // Retry the launch
          browser = await def.type().launch(launchOpts);
        } else {
          throw launchErr;
        }
      }
      entry.browser = browser;
      entry.available = true;
      entry.version = browser.version();
      entry.error = null;
      browser.on("disconnected", () => {
        entry.browser = null;
      });
      return browser;
    } catch (err) {
      entry.available = false;
      entry.error = err instanceof Error ? err.message.split("\n")[0] : String(err);
      throw err;
    } finally {
      entry.launching = null;
    }
  })();

  return entry.launching;
}

/** Probe all engines once (used by /api/profiles). */
export function probeEngines(): Promise<void> {
  const s = store();
  if (!s.probing) {
    s.probing = (async () => {
      if (isServerless()) {
        // Only Chromium is possible on serverless — mark the rest unavailable
        // without wasting cold-start time trying.
        for (const e of ["firefox", "webkit"] as const) {
          const entry = engineEntry(e);
          entry.available = false;
          entry.error = "not available on serverless deploys";
        }
        await Promise.allSettled([getEngineBrowser("chromium")]);
        return;
      }
      await Promise.allSettled([
        getEngineBrowser("chromium"),
        getEngineBrowser("firefox"),
        getEngineBrowser("webkit"),
      ]);
    })();
  }
  return s.probing;
}

export function engineStatus() {
  const s = store();
  const out: Record<Engine, { available: boolean | null; version: string; error: string | null }> = {
    chromium: { available: null, version: "", error: null },
    firefox: { available: null, version: "", error: null },
    webkit: { available: null, version: "", error: null },
  };
  for (const e of Object.keys(out) as Engine[]) {
    const entry = s.engines[e];
    if (entry) {
      out[e] = {
        available: entry.available,
        version: entry.version,
        error: entry.error,
      };
    }
  }
  return out;
}

export function resolveUA(profile: DeviceProfile): string {
  const s = store();
  const version = s.engines[profile.engine]?.version;
  let v = version || "";
  if (profile.engine === "firefox" && v && !v.includes(".")) v = `${v}.0`;
  if (!v) {
    // Static fallbacks that roughly match whatever Playwright ships.
    v = profile.engine === "chromium" ? "131.0.0.0" : profile.engine === "firefox" ? "133.0" : "";
  }
  return profile.ua.replaceAll("{v}", v);
}

/* ------------------------------------------------------------------ */
/*  Tor integration — dedicated browser with DNS-over-SOCKS            */
/* ------------------------------------------------------------------ */

/**
 * Returns a Chromium instance with ALL traffic (including DNS for .onion
 * resolution) routed through the Tor SOCKS5 proxy.
 *
 * We MUST use browser-level --proxy-server + --host-resolver-rules for
 * .onion sites to work. Context-level proxy does NOT route DNS through
 * the proxy, so .onion addresses fail with ERR_SOCKS_CONNECTION_FAILED.
 */
export async function getTorBrowser(): Promise<Browser | null> {
  const s = store();
  if (!s.tor) s.tor = { browser: null, launching: null };
  const entry = s.tor;

  if (entry.browser && entry.browser.isConnected()) return Promise.resolve(entry.browser);
  if (entry.launching) return entry.launching;

  entry.launching = (async () => {
    const ok = await ensureTor();
    if (!ok) return null;
    try {
      const browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
          `--proxy-server=${TOR_SOCKS}`,
          // Force ALL DNS through the SOCKS proxy — required for .onion resolution
          "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1",
        ],
      });
      browser.on("disconnected", () => { entry.browser = null; });
      entry.browser = browser;
      return browser;
    } catch (e) {
      console.error("[tor] browser launch failed:", e);
      return null;
    }
  })().finally(() => { entry.launching = null; });

  return entry.launching;
}

export async function isTorReady(): Promise<boolean> {
  return ensureTor();
}

/* ------------------------------------------------------------------ */
/*  Session lifecycle                                                  */
/* ------------------------------------------------------------------ */

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function meta(session: RemoteSession): SessionMeta {
  return {
    url: session.url,
    title: session.title,
    loading: session.loading,
    canBack: session.stackIdx > 0,
    canFwd: session.stackIdx < session.stack.length - 1,
  };
}

export function sessionMeta(session: RemoteSession): SessionMeta {
  return meta(session);
}

function broadcastMeta(session: RemoteSession) {
  const msg = JSON.stringify({ type: "meta", meta: meta(session) });
  for (const ws of session.sockets) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(msg);
      } catch {}
    }
  }
}

function pushFrame(session: RemoteSession, buf: Buffer) {
  if (session.closed) return;
  session.lastFrame = buf;
  session.frameSeq += 1;
  session.lastFrameAt = Date.now();
  const waiters = session.frameWaiters.splice(0);
  for (const resolve of waiters) resolve(session.frameSeq);
  for (const ws of session.sockets) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(buf);
      } catch {}
    }
  }
}

export function getSession(id: string): RemoteSession | undefined {
  return store().sessions.get(id);
}

export function activeSessionCount(): number {
  return store().sessions.size;
}

export async function createSession(
  profileId: string,
  startUrl?: string,
  customProxies?: string[]
): Promise<RemoteSession> {
  const s = store();
  if (s.sessions.size >= MAX_SESSIONS) {
    throw new Error("Too many active sessions — close one first (max 6)");
  }
  const profile = getProfile(profileId);
  if (!profile) throw new Error(`Unknown device profile "${profileId}"`);

  let browser: Browser;
  let torMode: "real" | "simulated" | null = null;
  if (profile.id === "tor") {
    // Use the dedicated Tor browser (browser-level proxy + DNS-over-SOCKS).
    // This is required for .onion site resolution.
    const torBrowser = await getTorBrowser().catch(() => null);
    if (!torBrowser) {
      throw new Error(
        "Failed to start Tor. Auto-installation was attempted but the daemon could not bootstrap a circuit. Check server logs for details."
      );
    }
    browser = torBrowser;
    torMode = "real";
  } else {
    browser = await getEngineBrowser(profile.engine);
  }

  const contextOpts: Parameters<Browser["newContext"]>[0] = {
    viewport: { width: profile.width, height: profile.height },
    screen: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
    hasTouch: profile.touch,
    userAgent: resolveUA(profile),
    locale: "en-US",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    // Firefox does not support isMobile
    ...(profile.engine !== "firefox" ? { isMobile: !!profile.mobile } : {}),
    ...(profile.id === "tor" ? { timezoneId: "Etc/UTC" as const } : {}),
  };

  let activeProxy: string | null = null;
  if (profile.id === "tor" && torMode === "real") {
    // Proxy is already set at browser level for .onion DNS resolution.
    // Do NOT set context-level proxy (it would conflict).
    activeProxy = TOR_SOCKS;
  } else if (customProxies && customProxies.length > 0) {
    activeProxy = customProxies[Math.floor(Math.random() * customProxies.length)] || null;
    if (activeProxy) {
      contextOpts.proxy = { server: activeProxy };
    }
  }

  const context = await browser.newContext(contextOpts);
  await context.addInitScript(stealthFor(profile.engine));
  const page = await context.newPage();

  const session: RemoteSession = {
    id: newId(),
    profile,
    engine: profile.engine,
    browser,
    context,
    page,
    cdp: null,
    url: "about:blank",
    title: "New Tab",
    loading: false,
    stack: ["about:blank"],
    stackIdx: 0,
    lastFrame: null,
    frameSeq: 0,
    lastFrameAt: 0,
    frameWaiters: [],
    sockets: new Set(),
    createdAt: Date.now(),
    lastActive: Date.now(),
    closed: false,
    capturing: false,
    captureTimer: null,
    torMode,
    activeProxy,
  };
  s.sessions.set(session.id, session);

  wirePageEvents(session);
  await startStreaming(session).catch(() => {});

  if (startUrl) {
    navigate(session, "goto", startUrl).catch(() => {});
  }
  return session;
}

export async function destroySession(id: string): Promise<void> {
  const s = store();
  const session = s.sessions.get(id);
  if (!session || session.closed) return;
  session.closed = true;
  s.sessions.delete(id);
  if (session.captureTimer) clearInterval(session.captureTimer);
  const waiters = session.frameWaiters.splice(0);
  for (const resolve of waiters) resolve(-1);
  for (const ws of session.sockets) {
    try {
      ws.close(1000, "session closed");
    } catch {}
  }
  session.sockets.clear();
  try {
    if (session.cdp && session.engine === "chromium") {
      await session.cdp.send("Page.stopScreencast").catch(() => {});
    }
  } catch {}
  await session.context.close().catch(() => {});
}

function reapSessions() {
  const s = store();
  const now = Date.now();
  for (const session of s.sessions.values()) {
    const idleFor = now - session.lastActive;
    const hasConsumers = session.sockets.size > 0;
    const limit = hasConsumers ? IDLE_WITH_CONSUMERS_MS : IDLE_WITHOUT_CONSUMERS_MS;
    if (idleFor > limit) destroySession(session.id).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/*  Page event wiring                                                  */
/* ------------------------------------------------------------------ */

function wirePageEvents(session: RemoteSession) {
  const { page, context } = session;

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    if (!url || url === session.url) return;
    session.url = url;
    // Maintain our own history stack (back/forward land on existing entries).
    if (session.stack[session.stackIdx] !== url) {
      session.stack = session.stack.slice(0, session.stackIdx + 1);
      session.stack.push(url);
      session.stackIdx = session.stack.length - 1;
      if (session.stack.length > 60) {
        session.stack.shift();
        session.stackIdx -= 1;
      }
    }
    session.title = titleFromUrl(url);
    broadcastMeta(session);
  });

  page.on("domcontentloaded", () => {
    session.loading = false;
    page
      .title()
      .then((t) => {
        if (t && t !== session.title) {
          session.title = t;
          broadcastMeta(session);
        } else {
          broadcastMeta(session);
        }
      })
      .catch(() => broadcastMeta(session));
  });

  page.on("crash", () => destroySession(session.id).catch(() => {}));
  page.on("close", () => {
    if (!session.closed) destroySession(session.id).catch(() => {});
  });

  // window.open / target=_blank → navigate the current page instead of spawning popups.
  context.on("page", (popup) => {
    if (popup === page) return;
    const fwd = async () => {
      try {
        const url = popup.url();
        await popup.close().catch(() => {});
        if (url && url !== "about:blank" && !session.closed) {
          await navigate(session, "goto", url);
        }
      } catch {}
    };
    if (popup.url() && popup.url() !== "about:blank") {
      fwd();
    } else {
      popup
        .waitForLoadState("domcontentloaded", { timeout: 5000 })
        .then(fwd)
        .catch(() => popup.close().catch(() => {}));
    }
  });
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

/* ------------------------------------------------------------------ */
/*  Frame streaming                                                    */
/* ------------------------------------------------------------------ */

async function startStreaming(session: RemoteSession) {
  if (session.engine === "chromium" && !isServerless()) {
    const cdp = await session.context.newCDPSession(session.page);
    session.cdp = cdp;
    await cdp.send("Page.enable").catch(() => {});
    cdp.on("Page.screencastFrame", (ev: { data: string; sessionId: number }) => {
      pushFrame(session, Buffer.from(ev.data, "base64"));
      cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 60,
      maxWidth: Math.round(session.profile.width),
      maxHeight: Math.round(session.profile.height),
      everyNthFrame: 1,
    });
    // Also force a baseline capture every 350 ms while loading or shortly
    // after input, so animations that miss screencast still update.
    session.captureTimer = setInterval(async () => {
      if (session.closed || session.capturing) return;
      const active = session.loading || Date.now() - session.lastActive < 2500;
      if (!active) return;
      if (Date.now() - session.lastFrameAt < 320) return;
      const buf = await captureNow(session).catch(() => null);
      if (buf) pushFrame(session, buf);
    }, 350);
  } else {
    // Firefox / WebKit: poll screenshots at ~5 fps.
    session.captureTimer = setInterval(async () => {
      if (session.closed || session.capturing) return;
      session.capturing = true;
      try {
        const buf = await session.page.screenshot({ type: "jpeg", quality: 55 });
        pushFrame(session, buf);
      } catch {}
      session.capturing = false;
    }, 200);
  }
}

export async function captureNow(session: RemoteSession): Promise<Buffer | null> {
  if (session.closed) return null;
  if (session.capturing && session.engine !== "chromium") return session.lastFrame;
  try {
    if (session.engine === "chromium" && session.cdp) {
      const res = (await session.cdp.send("Page.captureScreenshot", {
        format: "jpeg",
        quality: 65,
      })) as { data: string };
      return Buffer.from(res.data, "base64");
    }
    session.capturing = true;
    const buf = await session.page.screenshot({ type: "jpeg", quality: 60 });
    session.capturing = false;
    return buf;
  } catch {
    session.capturing = false;
    return null;
  }
}

/** Force a fresh capture and publish it as the latest frame. */
export async function forceFrame(session: RemoteSession): Promise<Buffer | null> {
  const buf = await captureNow(session);
  if (buf) pushFrame(session, buf);
  return buf;
}

/** Wait for the next frame after `since`, up to `timeoutMs`. */
export function waitForFrame(
  session: RemoteSession,
  since: number,
  timeoutMs: number
): Promise<number> {
  if (session.frameSeq > since) return Promise.resolve(session.frameSeq);
  if (session.closed) return Promise.resolve(-1);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const idx = session.frameWaiters.indexOf(done);
      if (idx >= 0) session.frameWaiters.splice(idx, 1);
      resolve(session.frameSeq > since ? session.frameSeq : 0);
    }, timeoutMs);
    const done = (seq: number) => {
      clearTimeout(timer);
      resolve(seq);
    };
    session.frameWaiters.push(done);
  });
}

/* ------------------------------------------------------------------ */
/*  Navigation                                                         */
/* ------------------------------------------------------------------ */

export function normalizeUrl(input: string, profileId: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "about:blank";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  if (
    /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(trimmed) ||
    trimmed.startsWith("localhost")
  ) {
    return `https://${trimmed}`;
  }

  const query = encodeURIComponent(trimmed);

  // Profile-specific default search engines
  if (profileId === "tor") {
    // DuckDuckGo's .onion service is frequently down/unreachable.
    // Google is the only major engine that reliably accepts Tor exit IPs.
    // Users can still navigate to .onion sites manually via the address bar.
    return `https://www.google.com/search?q=${query}`;
  }
  if (profileId.includes("brave")) {
    return `https://search.brave.com/search?q=${query}`;
  }
  if (profileId.includes("ddg") || profileId.includes("duckduckgo") || profileId.includes("mullvad")) {
    return `https://duckduckgo.com/?q=${query}`;
  }
  if (profileId.includes("opera")) {
    return `https://www.google.com/search?q=${query}&client=opera`;
  }
  return `https://www.google.com/search?q=${query}`;
}

export async function navigate(
  session: RemoteSession,
  action: NavAction,
  url?: string
): Promise<SessionMeta> {
  if (session.closed) throw new Error("Session closed");
  touch(session);
  const page = session.page;

  switch (action) {
    case "goto": {
      const target = normalizeUrl(url ?? "", session.profile.id);
      session.loading = true;
      session.url = target;
      session.title = titleFromUrl(target);
      broadcastMeta(session);
      page
        .goto(target, {
          // Use 'load' or 'networkidle' to fix the broken layout bug seen in the screenshot
          // (ensures CSS/Fonts are ready before first meaningful paint).
          waitUntil: "load",
          timeout: isServerless() ? 35_000 : 45_000,
        })
        .catch(() => {})
        .finally(() => {
          session.loading = false;
          broadcastMeta(session);
        });
      break;
    }
    case "back": {
      if (session.stackIdx > 0) {
        session.stackIdx -= 1;
      }
      session.loading = true;
      broadcastMeta(session);
      page
        .goBack({ timeout: 8_000 })
        .then((res) => {
          if (!res) {
            session.stackIdx += 1;
          }
        })
        .catch(() => {
          session.stackIdx = Math.max(0, session.stackIdx - 0);
        })
        .finally(() => {
          session.loading = false;
          broadcastMeta(session);
          syncStackWithPage(session);
        });
      break;
    }
    case "forward": {
      if (session.stackIdx < session.stack.length - 1) {
        session.stackIdx += 1;
      }
      session.loading = true;
      broadcastMeta(session);
      page
        .goForward({ timeout: 8_000 })
        .catch(() => {})
        .finally(() => {
          session.loading = false;
          broadcastMeta(session);
          syncStackWithPage(session);
        });
      break;
    }
    case "reload": {
      session.loading = true;
      broadcastMeta(session);
      page
        .reload({ waitUntil: "domcontentloaded", timeout: 30_000 })
        .catch(() => {})
        .finally(() => {
          session.loading = false;
          broadcastMeta(session);
        });
      break;
    }
  }
  return meta(session);
}

async function syncStackWithPage(session: RemoteSession) {
  try {
    const url = session.page.url();
    if (url && url !== session.url) {
      session.url = url;
    }
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Input dispatch                                                     */
/* ------------------------------------------------------------------ */

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

const KEY_MAP: Record<string, string> = {
  " ": " ",
  Escape: "Escape",
  Esc: "Escape",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Enter: "Enter",
  Backspace: "Backspace",
  Tab: "Tab",
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
  F6: "F6",
  F7: "F7",
  F8: "F8",
  F9: "F9",
  F10: "F10",
  F11: "F11",
  F12: "F12",
};

const BUTTONS: Record<number, "left" | "middle" | "right"> = {
  0: "left",
  1: "middle",
  2: "right",
};

export async function dispatchInput(session: RemoteSession, ev: InputEvent): Promise<void> {
  if (session.closed) return;
  touch(session);
  const { page, profile } = session;
  const W = profile.width - 1;
  const H = profile.height - 1;

  try {
    switch (ev.t) {
      case "move": {
        await page.mouse.move(clamp(ev.x, 0, W), clamp(ev.y, 0, H));
        break;
      }
      case "down": {
        const x = clamp(ev.x, 0, W);
        const y = clamp(ev.y, 0, H);
        if (profile.touch) {
          await page.touchscreen.tap(x, y);
        } else {
          await page.mouse.move(x, y);
          await page.mouse.down({ button: BUTTONS[ev.button] ?? "left" });
        }
        break;
      }
      case "up": {
        if (!profile.touch) {
          await page.mouse.up({ button: BUTTONS[ev.button] ?? "left" });
        }
        break;
      }
      case "tap": {
        const x = clamp(ev.x, 0, W);
        const y = clamp(ev.y, 0, H);
        if (profile.touch) {
          await page.touchscreen.tap(x, y);
        } else {
          await page.mouse.click(x, y);
        }
        break;
      }
      case "wheel": {
        const x = clamp(ev.x, 0, W);
        const y = clamp(ev.y, 0, H);
        await page.mouse.move(x, y);
        await page.mouse.wheel(clamp(ev.dx, -2400, 2400), clamp(ev.dy, -2400, 2400));
        break;
      }
      case "swipe": {
        // Approximated as a scroll gesture (works across all engines).
        await page.mouse.move(clamp(ev.x0, 0, W), clamp(ev.y0, 0, H));
        await page.mouse.wheel(
          clamp(ev.x0 - ev.x1, -1200, 1200),
          clamp(ev.y0 - ev.y1, -1200, 1200)
        );
        break;
      }
      case "key": {
        const mods: string[] = [];
        if (ev.ctrl) mods.push("Control");
        if (ev.alt) mods.push("Alt");
        if (ev.shift) mods.push("Shift");
        if (ev.meta) mods.push("Meta");
        const mapped = KEY_MAP[ev.key] ?? (ev.key.length === 1 ? ev.key : null);
        if (!mapped) break;
        await page.keyboard.press([...mods, mapped].join("+"));
        break;
      }
      case "type": {
        await page.keyboard.type(ev.text.slice(0, 500), { delay: 5 });
        break;
      }
    }
  } catch {
    // Input races with navigation — safe to ignore.
  }
}

export function touch(session: RemoteSession) {
  session.lastActive = Date.now();
}
