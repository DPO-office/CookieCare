import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the backend root regardless of whether this code runs as the esbuild
// bundle (server.js lives directly in backend/, so __dirname === backend/) or
// via tsx (src/config/index.ts is the real file, so __dirname === backend/src/config/).
// Walking up to the first directory that contains package.json finds backend/ in both cases.
function findBackendRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}
const backendRoot = findBackendRoot(__dirname);
dotenv.config({ path: path.join(backendRoot, ".env") });

/**
 * Windows / corporate dev environments often lack the CA chain required for
 * Google OAuth (oauth2.googleapis.com). Compare chat and other Gemini calls
 * fail with "unable to get local issuer certificate" without this.
 * Set GEMINI_SSL_INSECURE=false to disable in development.
 */
if (
  (process.env.NODE_ENV || "development") !== "production" &&
  process.env.GEMINI_SSL_INSECURE !== "false"
) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  // OpenRouter replaces Gemini as the AI provider
  openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
  openRouterModel: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3-0324",
  openRouterTemperature: numberFromEnv(process.env.OPENROUTER_TEMPERATURE, 0.2),
  openRouterMaxTokens: numberFromEnv(process.env.OPENROUTER_MAX_TOKENS, 4096),
  // Kept for backward compatibility — no longer used for AI calls
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  jwtSecret: process.env.JWT_SECRET || "privsec-ai-enterprise-secret-2026",
  // Fixed: Added the Render production URL as a default fallback
  corsOrigin: process.env.CORS_ORIGIN || "https://privlex-ai.onrender.com",
};

export const isProduction = config.nodeEnv === "production";