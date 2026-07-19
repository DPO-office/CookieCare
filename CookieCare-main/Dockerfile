# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS build

WORKDIR /app

ENV CI=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV npm_config_audit=false
ENV npm_config_fund=false

COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund

COPY . .

RUN npm run build

RUN npm prune --omit=dev


FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/backend/dist ./backend/dist

EXPOSE 8080 

CMD ["node", "backend/dist/server.js"]