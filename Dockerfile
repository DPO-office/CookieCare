# --- Build Stage ---
FROM node:22-slim AS builder

WORKDIR /app

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libasound2 \
    libxshmfence1 \
    libglu1 \
    libgbm1 \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# --- Production Stage ---
FROM node:22-slim AS runner

WORKDIR /app

# Install production dependencies for Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libasound2 \
    libxshmfence1 \
    libgbm1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/backend/src/config/open-cookie-database.json ./dist/backend/src/config/

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# Install Playwright browsers (chromium only for size)
RUN npx playwright install chromium

EXPOSE 3000

CMD ["npm", "start"]
