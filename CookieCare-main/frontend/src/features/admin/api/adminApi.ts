import { apiUrl } from "../../../config";
import { PendingUser } from "../types";

export async function fetchPendingUsers(authToken: string): Promise<PendingUser[]> {
  const res = await fetch(apiUrl("/api/admin/users"), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch pending users");
  return res.json();
}

export async function approveUser(authToken: string, userId: string): Promise<void> {
  const res = await fetch(apiUrl("/api/admin/users/update"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ userId, role: "USER" }),
  });
  if (!res.ok) throw new Error("Failed to approve user");
}
