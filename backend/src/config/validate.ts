import { config } from "./index.js";

export function validateEnv() {
  const required = [
    { key: "DATABASE_URL", value: config.databaseUrl },
    { key: "GEMINI_API_KEY", value: config.geminiApiKey },
    { key: "ENCRYPTION_KEY", value: process.env.ENCRYPTION_KEY },
  ];

  if (process.env.NODE_ENV === "production") {
    required.push({ key: "REDIS_URL", value: process.env.REDIS_URL });
  }

  const missing = required.filter((item) => !item.value || item.value.trim() === "");

  if (missing.length > 0) {
    if (process.env.NODE_ENV === "test") {
      console.warn("⚠️ Skipping env validation in test mode.");
      return;
    }
    console.error("❌ [FATAL] Missing required environment variables:");
    missing.forEach((item) => console.error(`   - ${item.key}`));
    console.error("\nPlease ensure your .env file or environment settings are correct.");
    process.exit(1);
  }

  if (process.env.ENCRYPTION_KEY && Buffer.from(process.env.ENCRYPTION_KEY).length !== 32) {
    console.error("❌ [FATAL] ENCRYPTION_KEY must be exactly 32 bytes.");
    process.exit(1);
  }

  console.log("✅ Environment validation successful.");
}
