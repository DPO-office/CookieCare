import { Download, Plus, Search } from "lucide-react";
import { DASHBOARD_STYLES } from "../dashboard/styles/dashboardStyles";
import { VAULT_STYLES } from "../vault/styles/vaultStyles";
import { InventoryMetrics } from "./components/InventoryMetrics";
import { InventoryTable } from "./components/InventoryTable";
import { ToolFormModal } from "./components/ToolFormModal";
import { STATUS_TABS } from "./constants";
import { useAiToolsInventory } from "./hooks/useAiToolsInventory";
import { exportCsv } from "./utils";
import { useAppContext } from "../../contexts/AppContext";

/** @deprecated authToken is now read from AppContext */
interface AIToolsInventoryProps {
  authToken?: string;
}

export default function AIToolsInventory(_props: AIToolsInventoryProps = {}) {
  const { authToken: ctxToken } = useAppContext();
  const authToken = ctxToken ?? "";
  const inv = useAiToolsInventory(authToken);

  return (
    <>
      <style>{DASHBOARD_STYLES}</style>
      <style>{VAULT_STYLES}</style>
      <div className="vlt dpa-results-bg flex-1 overflow-y-auto min-h-0 font-sans">
        <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-10">
          <div className="flex flex-col gap-5">
            <section className="dashboard-hero px-6 py-7 sm:px-8 sm:py-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
                    AI Governance
                  </p>
                  <h1 className="text-[clamp(1.75rem,4vw,2.125rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-[#1a1a1a]">
                    AI tools inventory
                  </h1>
                  <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-dark-200">
                    Register every AI system, model, and vendor tool in use. Track owner, purpose,
                    data processed, lifecycle status, and EU AI Act risk class.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    className="vlt-btn-ghost"
                    onClick={() => exportCsv(inv.visible)}
                    disabled={inv.visible.length === 0}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </button>
                  <button type="button" className="vlt-btn-primary" onClick={inv.openCreate}>
                    <Plus className="h-3.5 w-3.5" />
                    Add tool
                  </button>
                </div>
              </div>
            </section>

            {inv.error && (
              <p className="rounded-[16px] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B54A45]">
                {inv.error}
              </p>
            )}

            <InventoryMetrics
              total={inv.metrics.total}
              active={inv.metrics.active}
              highRisk={inv.metrics.highRisk}
              overdue={inv.metrics.overdue}
            />

            <section className="dashboard-section-card overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-[rgba(16,24,40,0.06)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="relative min-w-0 flex-1 max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#98A2B3]" />
                  <input
                    className="vlt-search"
                    placeholder="Search by name, vendor, owner or purpose"
                    value={inv.query}
                    onChange={(e) => inv.setQuery(e.target.value)}
                  />
                </div>
                <div className="vlt-tabs flex shrink-0 gap-1 overflow-x-auto">
                  {STATUS_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`vlt-tab rounded-full px-3 py-1.5 text-[12px] font-medium ${
                        inv.tab === tab.id ? "active" : "text-dark-200"
                      }`}
                      onClick={() => inv.setTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <InventoryTable
                tools={inv.visible}
                loading={inv.loading}
                onEdit={inv.openEdit}
                onDelete={inv.removeTool}
              />
            </section>
          </div>
        </div>
      </div>

      <ToolFormModal
        open={inv.formOpen}
        tool={inv.defaultForm}
        saving={inv.saving}
        onClose={inv.closeForm}
        onSave={inv.saveTool}
      />
    </>
  );
}
