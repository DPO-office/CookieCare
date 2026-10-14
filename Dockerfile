# syntax=docker/dockerfile:1

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

COPY . .

# Frontend Identity Platform config comes from frontend/.env.production
# (copied above). Do not set empty VITE_* ENV defaults here — Vite gives
# process.env higher priority than .env files, so blank ENVs would hide
# the Google button on Cloud Build.

RUN npm run build

RUN npm prune --omit=dev


FROM mcr.microsoft.com/playwright:v1.62.1-noble AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV DOCUMENT_GRAPH_LLM_RELATIONS=0

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/boot.mjs ./backend/boot.mjs

EXPOSE 8080 

# Bind PORT before loading the bundled app.
CMD ["node", "backend/boot.mjs"]
