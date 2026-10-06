# mirage.os — browser-emulator-os (edición deploy-ready)

Emulador de navegador remoto multi-perfil (Chromium/Firefox/WebKit vía Playwright),
streaming de frames por WebSocket con fallback HTTP, y Tor real opcional.
Edición preparada para despliegue por contenedores, derivada de
`forthemoonsssake/browser-emulator-os` (mismo código, misma licencia).

## Cambios de esta edición respecto al original

| Archivo | Cambio | Motivo |
|---|---|---|
| `next.config.ts` | `outputFileTracingIncludes` añade `playwright-core/browsers.json` y `package.json` | El tracer de Vercel omitía esos assets y la lambda crasheaba al arrancar |
| `src/app/api/session/route.ts` | `maxDuration` 120 → 60 | Límite del plan Hobby de Vercel (con Fluid apagado) |
| `vercel.json` | nuevo: `functions maxDuration 60` | Ídem |
| `Dockerfile` | nuevo: imagen universal (Playwright + Tor + build) | Hosts de contenedores (HF Spaces, Render, CF Containers…) |
| App en la **raíz** del repo (antes `browser-emulator/`) | reestructuración | Contextos de build Docker/CI más simples |

## Matriz de hosts probados / preparados

| Host | Estado | Nota |
|---|---|---|
| **Vercel** | ✅ Desplegado: https://local-remote-browser-emulator.vercel.app | Plan Hobby: sin afinidad de instancias ⇒ las sesiones interactivas no aguantan (ver `DEPLOY.md` original: serverless = best-effort). UI y perfiles sí funcionan |
| **Hugging Face Spaces (Docker)** | ⏸ Bloqueado por plan | Desde 2026 los Spaces Docker/Gradio en `cpu-basic` exigen suscripción PRO. Con PRO: crear Space sdk=docker y este repo; puerto 7860 ya respetado |
| **Render** | 🟢 Listo | New → Web Service → conectar este repo → Dockerfile detectado. 512 MB gratis: justo para 1 Chromium |
| **Cloudflare Containers** | 🟢 Listo (plan Workers Paid, 5 $/mes) | Mover `deploy/cloudflare/{wrangler.jsonc,worker.ts}` a la raíz y `npx wrangler deploy` (o Workers Builds). Ver `deploy/cloudflare/` |
| **Local / VM** | ✅ | `npm install && npx playwright install chromium && npm run build && npm start` (experiencia completa: WS :3001 + Tor) |

## Uso rápido (contenedores)

```bash
docker build -t mirage-os .
docker run -p 7860:7860 mirage-os
# abre http://localhost:7860
```

## Licencia

Proprietary Source-Visible License (PSVL) © Elxan Hüseynov — ver `LICENSE`…
(esta edición se publica bajo permiso explícito del dueño del repositorio;
el despliegue público queda autorizado por el propio titular de los derechos).
