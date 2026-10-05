# Deployment Guide

## Netlify (serverless)

The repository includes a root-level `netlify.toml`. It sets this app's base
folder to `browser-emulator`, runs `npm run build`, and publishes the Next.js
build. Netlify automatically applies its maintained Next.js adapter; you do not
need to add a legacy `@netlify/plugin-nextjs` plugin or change the site base
folder in the dashboard. The configuration pins the build/runtime to Node 24,
which is supported by the bundled serverless Chromium package.

Deploy by importing this repository in Netlify and triggering a deploy. No
secrets or database are required for the app to start. Optionally configure
`DATABASE_URL` with a hosted PostgreSQL URL to enable browsing history.

Netlify uses the serverless-compatible mode automatically:

- **Browser engine:** bundled `@sparticuz/chromium`; Firefox and WebKit profiles
  are shown as unavailable.
- **Transport:** HTTP frame polling. A separate long-running WebSocket listener
  is not started inside serverless functions.
- **Tor:** disabled on serverless because a Tor daemon and persistent SOCKS
  listener cannot run there. The Tor profile is marked unavailable instead of
  accepting a launch that would fail.
- **State:** browser sessions live in the warm server-function instance and
  may be lost when Netlify recycles or scales that instance. For durable,
  always-on sessions, deploy to a persistent Node host (VM, Fly.io, Render, or
  Railway) instead.

The Chromium archive is explicitly included in Next.js output-file tracing so
the function can unpack it at runtime. The profile-list endpoint does not launch
Chromium just to render the page; Chromium starts only after the user launches
a session, avoiding a slow or timed-out homepage request.

## Vercel (serverless)

Vercel uses the same serverless Chromium and HTTP-polling strategy. Deploy with
the Next.js framework preset. The app runs without a database; configure
`DATABASE_URL` only if you want browsing history.

## Local (full experience — Chromium, Firefox, WebKit, WebSocket, optional Tor)

```bash
cd browser-emulator
npm install
npx playwright install --with-deps chromium firefox webkit

# Optional: install Tor locally; the app can also start it on demand.
sudo apt-get install tor        # macOS: brew install tor

npm run build && npm start
# open http://localhost:3000  (WebSocket side-channel on :3001)
```

| Component | Local | Netlify / Vercel |
|---|---|---|
| Engines | Chromium, Firefox, WebKit | Chromium only |
| Streaming | WebSocket + HTTP fallback | HTTP polling |
| Tor | Real Tor daemon, when available | Unavailable |
| Database | Optional PostgreSQL history | Optional hosted PostgreSQL history |

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Optional PostgreSQL connection for browsing history |
| `TOR_SOCKS_PORT` | Override the local Tor SOCKS port (default `9050`) |
| `TOR_BINARY` | Override the local Tor executable path |
