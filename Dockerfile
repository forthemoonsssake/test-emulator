# mirage.os (browser-emulator-os) — imagen contenedora universal
# Válida para: Hugging Face Spaces (Docker, puerto 7860), Render, Railway,
# Fly.io, Cloudflare Containers o cualquier host Docker.
# Incluye Node + dependencias de Playwright (imagen oficial) + Tor real.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

# Tor real (en contenedores sí es posible; en serverless puro, no)
RUN apt-get update \
    && apt-get install -y --no-install-recommends tor \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# 7860 = convención de HF Spaces; Render/CF/others pueden sobrescribir con PORT
ENV PORT=7860 \
    WS_PORT=7861 \
    HOSTNAME=0.0.0.0

EXPOSE 7860

CMD ["npm", "start"]
