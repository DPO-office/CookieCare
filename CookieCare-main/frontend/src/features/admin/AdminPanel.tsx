import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAdminPanel } from "./hooks/useAdminPanel";
import type { PendingUser } from "./types";

interface AdminPanelProps {
  authToken: string;
}

const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";

function formatRequested(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function AdminPanel({ authToken }: AdminPanelProps) {
  const {
    users,
    loading,
    approvingId,
    rejectingId,
    error,
    loadUsers,
    handleApprove,
    handleReject,
  } = useAdminPanel(authToken);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="dpa-results-bg flex-1 overflow-y-auto">
      <div
        className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "none" : "translateY(8px)",
          transition: "opacity 0.35s ease, transform 0.35s ease",
        }}
      >
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex items-center gap-2 text-[13px] font-medium text-dark-200" aria-label="Breadcrumb">
            <span>Admin</span>
            <span className="text-gray-300">/</span>
            <span className="inline-flex items-center gap-1.5 text-[#1a1a1a]">
              <img src="/icons/info.svg" alt="" className="h-4 w-4 object-contain" />
              Access control
            </span>
          </nav>
          <button
            type="button"
            onClick={loadUsers}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-[13px] font-medium text-dark-200 transition-colors hover:bg-light-blue-100"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Refresh
          </button>
        </div>

        <section className="mb-8 rounded-[24px] bg-white p-6 sm:p-8" style={{ boxShadow: CARD_SHADOW }}>
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[34px]">
            Access control
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-dark-200">
            Review new registrations before they enter the workspace. Approve trusted users or reject requests that should not proceed.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="rounded-2xl bg-[#F7F8FB] px-4 py-4 sm:px-5 sm:py-5">
              <p className="mb-2 text-[12px] font-medium text-dark-200">Pending</p>
              <p className={`text-[24px] font-semibold leading-none tracking-tight tabular-nums ${
                users.length > 0 ? "text-badge-red-text" : "text-[#1a1a1a]"
              }`}>
                {loading && users.length === 0 ? "—" : users.length}
              </p>
            </div>
            <div className="rounded-2xl bg-[#F7F8FB] px-4 py-4 sm:px-5 sm:py-5">
              <p className="mb-2 text-[12px] font-medium text-dark-200">Queue status</p>
              <span className={`score-badge mt-1 text-[11px] font-medium ${
                users.length > 0
                  ? "bg-badge-yellow text-badge-yellow-text"
                  : "bg-badge-green text-badge-green-text"
              }`}>
                {users.length > 0 ? "Needs review" : "Clear"}
              </span>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl bg-badge-red px-4 py-3">
            <img src="/icons/warning.svg" alt="" className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-[13px] text-badge-red-text">{error}</p>
          </div>
        )}

        <section className="overflow-hidden rounded-[24px] bg-white" style={{ boxShadow: CARD_SHADOW }}>
          <div className="flex items-center justify-between gap-3 bg-light-blue-200 px-5 py-3.5 sm:px-6">
            <div className="flex items-center gap-3">
              <img src="/icons/ats-warning.svg" alt="" className="h-6 w-6" />
              <h2 className="text-[14px] font-semibold text-gray-900">Pending approvals</h2>
            </div>
            <span className="score-badge bg-white/70 text-[11px] font-semibold tabular-nums text-dark-200">
              {users.length}
            </span>
          </div>

          {loading && users.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <Loader2 className="mb-3 h-5 w-5 animate-spin text-[#8e98ff]" />
              <p className="text-[13px] text-dark-200">Loading requests…</p>
            </div>
          ) : users.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <img src="/icons/check.svg" alt="" className="mx-auto mb-3 h-8 w-8 opacity-70" />
              <p className="text-[14px] font-semibold text-[#1a1a1a]">Queue is clear</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-dark-200">
                There are no registrations waiting for review. New requests will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[rgba(16,24,40,0.06)]">
                    {["User", "Requested", "Status", ""].map((col) => (
                      <th
                        key={col || "actions"}
                        className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98A2B3] sm:px-6"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <ApprovalRow
                      key={user.id}
                      user={user}
                      approving={approvingId === user.id}
                      rejecting={rejectingId === user.id}
                      busy={approvingId === user.id || rejectingId === user.id}
                      onApprove={() => handleApprove(user.id)}
                      onReject={() => handleReject(user.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ApprovalRow({
  user,
  approving,
  rejecting,
  busy,
  onApprove,
  onReject,
}: {
  user: PendingUser;
  approving: boolean;
  rejecting: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <tr className="border-b border-[rgba(16,24,40,0.04)] last:border-b-0 hover:bg-[#FAFBFF]">
      <td className="px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[12px] font-semibold text-[#4F5BD9]">
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#1a1a1a]">{user.name}</p>
            <p className="truncate text-[12px] text-dark-200">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-4 text-[13px] text-dark-200 sm:px-6">
        {formatRequested(user.created_at)}
      </td>
      <td className="px-5 py-4 sm:px-6">
        <span className="score-badge bg-badge-yellow text-[11px] font-medium text-badge-yellow-text">
          Pending
        </span>
      </td>
      <td className="px-5 py-4 sm:px-6">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 text-[12px] font-semibold text-dark-200 transition-colors hover:bg-badge-red hover:text-badge-red-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Reject
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full primary-gradient px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Approve
          </button>
        </div>
      </td>
    </tr>
  );
}
