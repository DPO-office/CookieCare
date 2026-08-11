import { PageShell } from "../../shared/components/PageShell";
import { DashboardHomeProps } from "./types";
import {
  buildDocumentLogs,
  buildWorkItems,
  countAttentionItems,
  computeAverageTrustScore,
  getPriorityItem,
} from "./utils";
import { DASHBOARD_STYLES } from "./styles/dashboardStyles";
import { WelcomeBand } from "./components/WelcomeBand";
import { QuickJump } from "./components/QuickJump";
import { MetricCards } from "./components/MetricCards";
import { PriorityWork } from "./components/PriorityWork";
import { ContinueWorking } from "./components/ContinueWorking";
import { RecentActivity } from "./components/RecentActivity";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDateLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function buildSummary(
  attentionCount: number,
  stats: { pendingSigs: number; redlinesPending: number },
  docCount: number
): string {
  const parts: string[] = [];

  if (attentionCount > 0) {
    parts.push(
      `${attentionCount} agreement${attentionCount === 1 ? "" : "s"} need${attentionCount === 1 ? "s" : ""} your attention`
    );
  }
  if (stats.redlinesPending > 0) {
    parts.push(
      `${stats.redlinesPending} active redline${stats.redlinesPending === 1 ? "" : "s"} awaiting resolution`
    );
  }
  if (stats.pendingSigs > 0) {
    parts.push(
      `${stats.pendingSigs} signature${stats.pendingSigs === 1 ? "" : "s"} pending`
    );
  }

  if (parts.length === 0) {
    return docCount > 0
      ? "Your workspace is current. Pick up where you left off or start a new workflow below."
      : "Welcome to RandTrust. Analyze, draft, or compare your first agreement to begin.";
  }

  return parts.join(", ") + ".";
}

export default function DashboardHome({
  userName,
  setActiveTab,
  stats,
  documents,
}: DashboardHomeProps) {
  const firstName = userName.split(" ")[0] ?? userName;
  const attentionCount = countAttentionItems(documents);
  const workItems = buildWorkItems(documents, 6);
  const priorityItem = getPriorityItem(workItems);
  const avgTrust = computeAverageTrustScore(documents);
  const ledgerEntries = buildDocumentLogs(documents).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <>
      <style>{DASHBOARD_STYLES}</style>
      <PageShell width="wide">
        <div className="dashboard-root flex flex-col gap-5">
          <WelcomeBand
            greeting={getGreeting()}
            firstName={firstName}
            dateLabel={formatDateLabel()}
            summary={buildSummary(attentionCount, stats, documents.length)}
          />

          <QuickJump onNavigate={setActiveTab} />

          {priorityItem && (
            <PriorityWork item={priorityItem} onOpen={setActiveTab} />
          )}

          <MetricCards
            stats={stats}
            attentionCount={attentionCount}
            avgTrustScore={avgTrust}
          />

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_300px] gap-5">
            <div className="flex flex-col gap-5 min-w-0">
              <ContinueWorking
                items={workItems}
                onOpen={setActiveTab}
                onViewVault={() => setActiveTab("legal-vault")}
                excludeId={priorityItem?.id}
              />
              <RecentActivity
                entries={ledgerEntries}
                onStartDraft={() => setActiveTab("legal-draft")}
              />
            </div>

            <WorkspaceSidebar
              documentCount={documents.length}
              attentionCount={attentionCount}
              onNavigate={setActiveTab}
            />
          </div>
        </div>
      </PageShell>
    </>
  );
}
