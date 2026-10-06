# Deployment Guide

## Local (full experience — 3 engines + WebSocket + real Tor)

```bash
npm install
npx playwright install --with-deps chromium firefox webkit

# Real Tor (optional but recommended): the app auto-starts it on demand
sudo apt-get install tor        # macOS: brew install tor

npm run build && npm start
# open http://localhost:3000  (WS side-channel on :3001)
```

| Component | Behaviour |
|---|---|
| Engines | Chromium, Firefox, WebKit — real binaries, pooled |
| Streaming | WebSocket `PORT+1` (CDP screencast on Chromium) with HTTP fallback |
| Tor | **Real onion routing** through `127.0.0.1:9050` (auto-spawned). Missing binary ⇒ clearly-labeled simulated mode |
| Database | Local PostgreSQL via `DATABASE_URL` (history only — optional) |

## Vercel (serverless mode)

Serverless platforms cannot run long-lived WebSocket servers or 300 MB
Firefox/WebKit binaries, so the app automatically switches strategy when
`VERCEL=1` is detected:

- **Engine:** lambda-optimised Chromium via `@sparticuz/chromium` (Firefox/WebKit marked unavailable in the UI)
- **Transport:** HTTP frame polling (the WebSocket server is not started)
- **Tor:** unavailable (no daemons on serverless) — Tor profile runs in labeled simulated mode
- **Limits:** sessions live in warm function instances; requests are capped at 60 s (`maxDuration`), so long idle gaps may require "wake" activity

Deploy:

```bash
npm i -g vercel
vercel            # framework: Next.js — zero config needed
```

Environment variables (optional):

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Hosted Postgres (Neon/Supabase) with SSL for browsing history. App runs fine without it |
| `TOR_SOCKS_PORT` | Override Tor SOCKS port (local only, default `9050`) |
| `TOR_BINARY` | Override tor binary path (local only) |

Notes for serverless mode:

1. First launch (cold start) downloads/unpacks the Chromium binary — expect a few seconds; the UI shows "launching chromium".
2. Session stickiness relies on warm-instance reuse, which Vercel performs best-effort. For production-grade stickiness put the API behind a single-instance target (Fly.io, Render, Railway, a VM) — the same build works there unchanged, and the WebSocket transport re-activates automatically outside Vercel.
3. Screenshots and navigation are stateless-safe: worst case the client re-creates the session transparently.

## Verifying Tor is real

Start a Tor session and visit `https://check.torproject.org` —
the page inside the emulator reports *“Congratulations. This browser is
configured to use Tor.”* The status bar chip reads **onion verified**
whenever traffic (including DNS) is truly routed through a live circuit.
