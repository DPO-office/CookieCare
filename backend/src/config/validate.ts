import { config } from "./index.js";
import { doclingServiceSettings } from "../services/docling-client.js";

export function validateEnv() {
  if (config.skipDb) {
    if (config.nodeEnv === "production") {
      console.error("❌ [FATAL] SKIP_DB is not allowed in production.");
      process.exit(1);
    }
    console.log("⚠️  SKIP_DB=true — running without a database (UI / API smoke test only).");
    return;
  }

  const required = [
    { key: "DATABASE_URL", value: config.databaseUrl },
    { key: "ENCRYPTION_KEY", value: process.env.ENCRYPTION_KEY },
    { key: "GOOGLE_CLOUD_PROJECT", value: process.env.GOOGLE_CLOUD_PROJECT },
    {
      key: "GOOGLE_GEMINI_EXTERNAL_KEY",
      value: config.googleGeminiExternalKey || process.env.GOOGLE_GEMINI_EXTERNAL_KEY,
    },
    ...(config.nodeEnv === "production" ? [
      { key: "JWT_SECRET", value: process.env.JWT_SECRET },
      { key: "CORS_ORIGIN", value: process.env.CORS_ORIGIN },
      { key: "DOCLING_SERVICE_URL", value: process.env.DOCLING_SERVICE_URL },
      { key: "DOCLING_SERVICE_TOKEN", value: process.env.DOCLING_SERVICE_TOKEN },
    ] : []),
  ];
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
  if (config.nodeEnv === "production") {
    doclingServiceSettings();
    if ((process.env.DOCLING_SERVICE_TOKEN?.length ?? 0) < 32) {
      throw new Error("DOCLING_SERVICE_TOKEN must be at least 32 characters");
    }
  }

  console.log("✅ Environment validation successful.");
}
