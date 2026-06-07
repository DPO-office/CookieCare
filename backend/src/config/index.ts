import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  jwtSecret: process.env.JWT_SECRET as string,
  corsOrigin: process.env.CORS_ORIGIN || "",
  vercelUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  isVercel: !!process.env.VERCEL,
};

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is missing. Platform security cannot be initialized.");
}

export const isProduction = config.nodeEnv === "production";
