import React, { useState, useEffect } from "react";
import { ShieldCheck, UserCheck, Clock, RefreshCcw, Loader2 } from "lucide-react";
import { apiUrl } from "../config";

interface PendingUser {
  id: string;
  email: string;
  name: string;
  status: string;
  role: string;
  created_at: string;
}

interface AdminPanelProps {
  authToken: string;
}

export default function AdminPanel({ authToken }: AdminPanelProps) {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPendingUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/admin/users"), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch pending users");
      setUsers(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPendingUsers(); }, [authToken]);

  const handleApprove = async (userId: string) => {
    setApprovingId(userId);
    try {
      const res = await fetch(apiUrl("/api/admin/users/update"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ userId, role: "USER" }),
      });
      if (!res.ok) throw new Error("Failed to approve user");
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto px-10 py-8 bg-[#FAFAFB]">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-gray-500" />
              </div>
              Admin Panel
            </h1>
            <p className="text-[13px] text-gray-500 mt-1.5 ml-12">Review and approve new user registrations.</p>
          </div>
          <button
            onClick={fetchPendingUsers}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition shadow-xs"
            title="Refresh"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[13px]">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-[18px] border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="text-[13px] font-semibold text-gray-700">Pending approvals</h3>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Requested</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    <p className="text-[13px]">Loading requests...</p>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-[13px] text-gray-400">
                    No pending approval requests.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-[13px] shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-[13px] text-gray-900">{user.name}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-[13px] text-gray-500">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {new Date(user.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleApprove(user.id)}
                        disabled={approvingId === user.id}
                        className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-[13px] font-medium hover:bg-gray-800 transition shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        {approvingId === user.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5" />
                        )}
                        Approve
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
