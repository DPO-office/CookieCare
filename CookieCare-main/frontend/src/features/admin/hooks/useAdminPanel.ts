import { useState, useEffect } from "react";
import { PendingUser } from "../types";
import { fetchPendingUsers, approveUser, rejectUser } from "../api/adminApi";

export function useAdminPanel(authToken: string) {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
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

  const handleReject = async (userId: string) => {
    setRejectingId(userId);
    try {
      await rejectUser(authToken, userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRejectingId(null);
    }
  };

  return { users, loading, approvingId, rejectingId, error, loadUsers, handleApprove, handleReject };
}
