import crypto from "crypto";
import { pool } from "../config/database.js";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = "aes-256-gcm";

if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length !== 32) {
  console.warn("⚠️ [SECURITY] ENCRYPTION_KEY is missing or invalid (must be 32 bytes). Encryption/Decryption features will fail.");
}

export function encryptData(text: string): string {
  if (!text) return "";
  if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes.");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `LEXGCM_${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptData(text: string): string {
  if (!text) return "";

  if (text.startsWith("LEXGCM_")) {
    try {
      if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length !== 32) {
        throw new Error("ENCRYPTION_KEY must be 32 bytes.");
      }
      const payload = text.replace("LEXGCM_", "");
      const [ivHex, authTagHex, encryptedHex] = payload.split(":");

      if (!ivHex || !authTagHex || !encryptedHex) {
        return "[DECRYPTION_FORMAT_ERROR]";
      }

      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (err) {
      console.error("Decryption failed:", err);
      // Log failed decryption for compliance audit in an RLS-compliant way
      (async () => {
        let client;
        try {
          client = await pool.connect();
          await client.query("SET LOCAL app.current_user_role = 'ADMIN'");
          await client.query(`
            INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
            VALUES ($1, $2, $3)
          `, [null, 'decryption_failure', JSON.stringify({ error: (err as Error).message, timestamp: new Date().toISOString() })]);
        } catch (auditErr) {
          console.error("Failed to log decryption failure audit:", auditErr);
        } finally {
          if (client) client.release();
        }
      })();
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

// Aliases for requirement
export const encrypt = encryptData;
export const decrypt = decryptData;
