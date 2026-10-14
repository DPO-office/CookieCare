import { Layers, Pencil, Trash2 } from "lucide-react";
import type { AiTool } from "../types";
import { categoryLabel, formatDate, isReviewOverdue, riskLabel, statusLabel } from "../utils";

interface InventoryTableProps {
  tools: AiTool[];
  loading: boolean;
  onEdit: (tool: AiTool) => void;
  onDelete: (id: string) => void;
}

function StatusBadge({ tool }: { tool: AiTool }) {
  const map: Record<AiTool["status"], string> = {
    active: "bg-badge-green text-badge-green-text",
    pilot: "bg-[#EEF2FF] text-[#4F5BD9]",
    under_review: "bg-badge-yellow text-badge-yellow-text",
    proposed: "bg-[#F2F4F7] text-[#667085]",
    retired: "bg-badge-red text-badge-red-text",
  };
  const dot: Record<AiTool["status"], string> = {
    active: "bg-[#3D9B8F]",
    pilot: "bg-[#4F5BD9]",
    under_review: "bg-[#C9843A]",
    proposed: "bg-[#98A2B3]",
    retired: "bg-[#B54A45]",
  };
  return (
    <span className={`score-badge inline-flex items-center gap-1.5 text-[11px] font-medium ${map[tool.status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[tool.status]}`} />
      {statusLabel(tool.status)}
    </span>
  );
}

function RiskBadge({ tool }: { tool: AiTool }) {
  const map: Record<AiTool["euRisk"], string> = {
    minimal: "bg-badge-green text-badge-green-text",
    limited: "bg-badge-yellow text-badge-yellow-text",
    high: "bg-badge-red text-badge-red-text",
    prohibited: "bg-badge-red text-badge-red-text",
  };
  return (
    <span className={`score-badge text-[11px] font-medium ${map[tool.euRisk]}`}>
      {riskLabel(tool.euRisk)}
    </span>
  );
}

export function InventoryTable({ tools, loading, onEdit, onDelete }: InventoryTableProps) {
  if (loading) {
    return (
      <div className="px-6 py-16 text-center text-[13px] text-dark-200">Loading inventory…</div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <div className="dashboard-icon-tile mx-auto mb-3">
          <Layers className="h-4 w-4" strokeWidth={1.5} />
        </div>
        <p className="text-[13px] font-medium text-[#1a1a1a]">No tools in this view</p>
        <p className="mt-1 text-[12px] text-dark-200">
          Register an AI system, model, or vendor tool to start the inventory.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[rgba(16,24,40,0.06)]">
            {["Tool", "Owner", "Category", "EU risk", "Status", "Last reviewed", ""].map((col) => (
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
          {tools.map((tool) => {
            const overdue = isReviewOverdue(tool);
            return (
              <tr
                key={tool.id}
                className="vlt-row cursor-pointer"
                onClick={() => onEdit(tool)}
              >
                <td className="px-5 py-3.5 sm:px-6">
                  <p className="truncate text-[13px] font-semibold text-[#1a1a1a]">{tool.name}</p>
                  <p className="mt-0.5 truncate text-[12px] text-dark-200">
                    {tool.vendor || "No vendor"}
                    {tool.modelName ? ` · ${tool.modelName}` : ""}
                  </p>
                </td>
                <td className="px-5 py-3.5 sm:px-6">
                  <p className="truncate text-[13px] text-[#1a1a1a]">{tool.ownerName || "—"}</p>
                  <p className="mt-0.5 truncate text-[12px] text-dark-200">
                    {tool.department || "Unassigned"}
                  </p>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-dark-200 sm:px-6">
                  {categoryLabel(tool.category)}
                </td>
                <td className="px-5 py-3.5 sm:px-6">
                  <RiskBadge tool={tool} />
                </td>
                <td className="px-5 py-3.5 sm:px-6">
                  <StatusBadge tool={tool} />
                </td>
                <td className="px-5 py-3.5 sm:px-6">
                  <p className="text-[13px] tabular-nums text-[#1a1a1a]">
                    {formatDate(tool.lastReviewedAt)}
                  </p>
                  {overdue && (
                    <p className="mt-0.5 text-[11px] text-badge-yellow-text">Review due</p>
                  )}
                </td>
                <td className="px-5 py-3.5 sm:px-6" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      className="vlt-icon-btn"
                      title="Edit"
                      onClick={() => onEdit(tool)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="vlt-icon-btn danger"
                      title="Delete"
                      onClick={() => {
                        if (window.confirm(`Remove “${tool.name}” from the inventory?`)) {
                          onDelete(tool.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
