import { apiUrl } from "../../../config";
import { AuthSuccessPayload } from "../types";

export async function loginUser(email: string, password: string): Promise<AuthSuccessPayload> {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    let msg = "Authentication failed";
    try { const d = await res.json(); msg = d.error || msg; } catch { msg = `Server error (${res.status})`; }
    throw new Error(msg);
  }
  return res.json();
}

export async function registerUser(email: string, password: string, name: string): Promise<AuthSuccessPayload> {
  const res = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    let msg = "Registration failed";
    try { const d = await res.json(); msg = d.error || msg; } catch { msg = `Server error (${res.status})`; }
    throw new Error(msg);
  }
  return res.json();
}
