import dotenv from "dotenv";

dotenv.config();

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