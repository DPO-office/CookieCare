import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  jwtSecret: process.env.JWT_SECRET || "privsec-ai-enterprise-secret-2026",
  corsOrigin: process.env.CORS_ORIGIN || "",
  vercelUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  isVercel: !!process.env.VERCEL,
};

export const isProduction = config.nodeEnv === "production";
