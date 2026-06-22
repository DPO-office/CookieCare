import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  // OpenRouter replaces Gemini as the AI provider
  openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
  // Kept for backward compatibility — no longer used for AI calls
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  jwtSecret: process.env.JWT_SECRET || "privsec-ai-enterprise-secret-2026",
  // Fixed: Added the Render production URL as a default fallback
  corsOrigin: process.env.CORS_ORIGIN || "https://privlex-ai.onrender.com",
  vercelUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  isVercel: !!process.env.VERCEL,
};

export const isProduction = config.nodeEnv === "production";