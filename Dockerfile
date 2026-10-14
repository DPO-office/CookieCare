# syntax=docker/dockerfile:1

# docling.rs 1.41's linux-x64-gnu napi binary needs GCC 13 libstdc++
# (_M_replace_cold). Jammy (22.04) only has GCC 11/12, so dlopen fails at upload.
# Tag must match the Playwright npm version in package-lock.json (currently 1.62.1).
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 is correct: this image already ships matching Chromium.
FROM mcr.microsoft.com/playwright:v1.62.1-noble AS build

WORKDIR /app

ENV CI=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV npm_config_audit=false
ENV npm_config_fund=false

COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund

# PDF layout/OCR/table assets are not bundled in the native addon. Keep this
# alongside the pinned docling.rs dependency and bake assets at image build.
RUN curl -fsSL https://raw.githubusercontent.com/docling-project/docling.rs/master/scripts/install/download_dependencies.sh | sh -s -- --no-asr --no-chunk

COPY . .

# Frontend Identity Platform config comes from frontend/.env.production
# (copied above). Do not set empty VITE_* ENV defaults here — Vite gives
# process.env higher priority than .env files, so blank ENVs would hide
# the Google button on Cloud Build.

RUN npm run build

RUN npm prune --omit=dev
# Keep the linux napi binary after prune; Analysis PDF parsing needs it at runtime.
RUN npm install --omit=dev --no-save --no-audit --no-fund docling.rs-linux-x64-gnu@1.41.0


FROM mcr.microsoft.com/playwright:v1.62.1-noble AS runner

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 libstdc++6 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8080
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV DOCLING_RS_HOME=/app
ENV PDFIUM_DYNAMIC_LIB_PATH=/app/.pdfium/lib
ENV LD_LIBRARY_PATH=/app/.pdfium/lib:/app/node_modules/docling.rs:/app/node_modules/docling.rs-linux-x64-gnu
ENV DOCUMENT_GRAPH_LLM_RELATIONS=0

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.models ./.models
COPY --from=build /app/.pdfium ./.pdfium
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/boot.mjs ./backend/boot.mjs

EXPOSE 8080 

# Bind PORT before loading the bundled app (Playwright/Docling/analysis graph).
CMD ["node", "backend/boot.mjs"]
