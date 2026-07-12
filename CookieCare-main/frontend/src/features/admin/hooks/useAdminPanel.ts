import { useState, useEffect } from "react";
import { PendingUser } from "../types";
import { fetchPendingUsers, approveUser } from "../api/adminApi";

export function useAdminPanel(authToken: string) {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchPendingUsers(authToken));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, [authToken]);

  const handleApprove = async (userId: string) => {
    setApprovingId(userId);
    try {
      await approveUser(authToken, userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setApprovingId(null);
    }
  };

  return { users, loading, approvingId, error, loadUsers, handleApprove };
}
