import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = "aes-256-gcm";

if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length !== 32) {
  console.warn("⚠️ [SECURITY] ENCRYPTION_KEY is missing or invalid (must be 32 bytes). Encryption/Decryption features will fail.");
}

export function encryptData(text: string): string {
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY!), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `LEXGCM_${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptData(text: string): string {
  if (!text) return "";

  if (text.startsWith("LEXGCM_")) {
    try {
      const payload = text.replace("LEXGCM_", "");
      const [ivHex, authTagHex, encryptedHex] = payload.split(":");

      if (!ivHex || !authTagHex || !encryptedHex) {
        return "[DECRYPTION_FORMAT_ERROR]";
      }

      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY!), iv);

      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (err) {
      console.error("Decryption failed:", err);
      return "[DECRYPTION_FAILURE]";
    }
  }

  if (text.startsWith("LEXENC_")) {
    try {
      const rawBase64 = text.replace("LEXENC_", "");
      return Buffer.from(rawBase64, "base64").toString("utf-8");
    } catch (err) {
      return "[LEGACY_DECRYPTION_ERROR]";
    }
  }

  return text;
}
