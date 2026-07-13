# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS build

WORKDIR /app

ENV CI=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build


FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/backend/dist ./backend/dist

EXPOSE 8080 

CMD ["node", "backend/dist/server.js"]