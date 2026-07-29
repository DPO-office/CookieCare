import { Request, Response } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";
import { config } from "../config/index.js";
import crypto from "crypto";
import { getOrCreateDefaultFolder, migrateUnassignedDocuments } from "./folders.js";
import { verifyIdToken } from "../services/identityPlatform/identityPlatformService.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Issue the standard app JWT used by all protected routes. */
function issueToken(userId: string, email: string): string {
  return jwt.sign({ id: userId, email }, config.jwtSecret, { expiresIn: "24h" });
}

/** Build the user payload returned to the frontend on successful auth. */
function userPayload(user: { id: string; email: string; name: string; status: string; role: string }) {
  return { id: user.id, email: user.email, name: user.name, status: user.status, role: user.role };
}

/** Fire-and-forget default folder bootstrap after login. */
function bootstrapDefaultFolder(userId: string, role: string): void {
  getOrCreateDefaultFolder(userId, role)
    .then(folderId => migrateUnassignedDocuments(userId, folderId, role))
    .catch(err => console.warn("[defaultFolder] Setup on login failed:", err));
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────

export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Please enter all required fields." });
  }

  const normalizedEmail = email.toLowerCase();
  const newUserId = "user_" + crypto.randomUUID();

  try {
    const checkMail = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (checkMail.rows.length > 0) {
      return res.status(400).json({ error: "Email already exists." });
    }

    const passwordHash = await argon2.hash(password);

    await pool.query(
      "INSERT INTO users (id, email, name, password_hash, status, role, auth_provider) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [newUserId, normalizedEmail, name, passwordHash, "PENDING_APPROVAL", "USER", "LOCAL"]
    );

    return res.status(201).json({
      message: "Account created successfully. Awaiting administrator approval.",
      code: "PENDING_APPROVAL",
    });
  } catch (err: any) {
    console.error("Registration failed:", err);
    return res.status(500).json({ error: "Registration failed." });
  }
};

// ─── POST /api/auth/login ────────────────────────────────────────────────────

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing identity credentials" });
  }

  const normalizedEmail = email.toLowerCase();

  try {
    const { rows } = await pool.query(
      "SELECT id, email, name, password_hash, status, role FROM users WHERE email = $1",
      [normalizedEmail]
    ).catch(dbErr => {
      console.error("Database query failed during login:", dbErr);
      throw new Error("DATABASE_ERROR");
    });

    if (rows.length > 0) {
      const user = rows[0];

      // Google-only accounts have no password — block password login for them.
      if (!user.password_hash) {
        return res.status(401).json({ error: "This account uses Google sign-in. Please use Continue with Google." });
      }

      const isPasswordValid = await argon2.verify(user.password_hash, password);
      if (isPasswordValid) {
        if (user.status !== "APPROVED") {
          return res.status(403).json({
            error: "Your account is awaiting admin approval.",
            code: "PENDING_APPROVAL",
          });
        }

        const token = issueToken(user.id, user.email);
        bootstrapDefaultFolder(user.id, user.role);

        return res.json({ token, user: userPayload(user) });
      }
    }
  } catch (err: any) {
    console.error("Login failed:", err);
    if (err.message === "DATABASE_ERROR") {
      return res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
    }
    return res.status(500).json({ error: "Login failed due to an internal server error." });
  }

  return res.status(401).json({ error: "Invalid email or password." });
};

// ─── POST /api/auth/google ───────────────────────────────────────────────────

export const googleLogin = async (req: Request, res: Response) => {
  const { idToken } = req.body;
  if (!idToken || typeof idToken !== "string") {
    return res.status(400).json({ error: "Missing or invalid ID token." });
  }

  try {
    // 1. Verify the Identity Platform / Firebase ID token
    const decoded = await verifyIdToken(idToken);

    const googleEmail = decoded.email?.toLowerCase();
    const emailVerified = decoded.email_verified;
    const googleSub = decoded.uid; // stable Identity Platform UID
    const googleName = decoded.name || decoded.email || "Google User";
    const avatarUrl = decoded.picture || null;

    if (!googleEmail) {
      return res.status(400).json({ error: "Google account has no email address." });
    }
    if (!emailVerified) {
      return res.status(403).json({ error: "Google email is not verified." });
    }

    // 2. Look up by google_sub first, then by email
    let user: any = null;

    const { rows: subRows } = await pool.query(
      "SELECT id, email, name, password_hash, status, role, google_sub, auth_provider FROM users WHERE google_sub = $1",
      [googleSub]
    );

    if (subRows.length > 0) {
      user = subRows[0];
    } else {
      // Check if a local account exists with the same email
      const { rows: emailRows } = await pool.query(
        "SELECT id, email, name, password_hash, status, role, google_sub, auth_provider FROM users WHERE email = $1",
        [googleEmail]
      );

      if (emailRows.length > 0) {
        const existing = emailRows[0];

        // Another Google sub already attached — conflict
        if (existing.google_sub && existing.google_sub !== googleSub) {
          return res.status(409).json({
            error: "This email is already linked to a different Google account.",
          });
        }

        // Link this Google identity to the existing local account
        await pool.query(
          "UPDATE users SET google_sub = $1, auth_provider = CASE WHEN auth_provider = 'LOCAL' THEN 'LOCAL' ELSE auth_provider END WHERE id = $2",
          [googleSub, existing.id]
        );
        user = { ...existing, google_sub: googleSub };
      }
    }

    // 3. Create new user if not found
    if (!user) {
      const newUserId = "user_" + crypto.randomUUID();
      const { rows: inserted } = await pool.query(
        `INSERT INTO users (id, email, name, password_hash, status, role, auth_provider, google_sub)
         VALUES ($1, $2, $3, NULL, 'PENDING_APPROVAL', 'USER', 'GOOGLE', $4)
         RETURNING id, email, name, status, role`,
        [newUserId, googleEmail, googleName, googleSub]
      );
      user = inserted[0];
    }

    // 4. Check approval status
    if (user.status !== "APPROVED") {
      return res.status(403).json({
        error: "Your account is awaiting admin approval.",
        code: "PENDING_APPROVAL",
      });
    }

    // 5. Issue app JWT for approved users
    const token = issueToken(user.id, user.email);
    bootstrapDefaultFolder(user.id, user.role);

    return res.json({ token, user: userPayload(user) });
  } catch (err: any) {
    console.error("Google login failed:", err);

    // Firebase token verification errors
    if (err.code === "auth/id-token-expired") {
      return res.status(401).json({ error: "Google token has expired. Please try again." });
    }
    if (err.code === "auth/argument-error" || err.code === "auth/id-token-revoked") {
      return res.status(401).json({ error: "Invalid Google token." });
    }

    return res.status(500).json({ error: "Google authentication failed." });
  }
};
