import { apiUrl } from "../../../config";
import { AuthSuccessPayload } from "../types";

/**
 * Custom error that carries a machine-readable code alongside the message.
 * Used to distinguish "pending approval" from real errors in the UI.
 */
export class AuthError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

// ─── Password login ──────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string): Promise<AuthSuccessPayload> {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    let msg = "Authentication failed";
    let code: string | undefined;
    try {
      const d = await res.json();
      msg = d.error || msg;
      code = d.code;
    } catch { msg = `Server error (${res.status})`; }
    throw new AuthError(msg, code);
  }
  return res.json();
}

// ─── Manual register ─────────────────────────────────────────────────────────

/**
 * Register returns 201 with `{ message, code: "PENDING_APPROVAL" }` — not a token.
 * The return type is intentionally `{ message: string; code?: string }`.
 */
export async function registerUser(
  email: string, password: string, name: string,
): Promise<{ message: string; code?: string; token?: string; user?: AuthSuccessPayload["user"] }> {
  const res = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    let msg = "Registration failed";
    let code: string | undefined;
    try {
      const d = await res.json();
      msg = d.error || msg;
      code = d.code;
    } catch { msg = `Server error (${res.status})`; }
    throw new AuthError(msg, code);
  }
  return res.json();
}

// ─── Google login ────────────────────────────────────────────────────────────

export async function googleLoginApi(idToken: string): Promise<AuthSuccessPayload> {
  const res = await fetch(apiUrl("/api/auth/google"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    let msg = "Google authentication failed";
    let code: string | undefined;
    try {
      const d = await res.json();
      msg = d.error || msg;
      code = d.code;
    } catch { msg = `Server error (${res.status})`; }
    throw new AuthError(msg, code);
  }
  return res.json();
}
