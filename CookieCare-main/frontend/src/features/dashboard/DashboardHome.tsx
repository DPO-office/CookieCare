import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../contexts/AppContext";
import {
  buildSummary,
  countAnalyzed,
  countFailedJobsLast7Days,
  countPendingRedlines,
  countPendingSignatures,
  countRunningJobs,
  recentDocuments,
  recentJobs,
  runningJobs,
} from "./utils";
import { DASHBOARD_STYLES } from "./styles/dashboardStyles";
import { WelcomeBand } from "./components/WelcomeBand";
import { MetricCards } from "./components/MetricCards";
import { JobsRunning } from "./components/PriorityWork";
import { ContinueWorking } from "./components/ContinueWorking";
import { RecentActivity } from "./components/RecentActivity";
import { useDashboardJobs } from "./hooks/useDashboardJobs";

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

export default function DashboardHome() {
  const { currentUser, documents, authToken } = useAppContext();
  const navigate = useNavigate();
  const userName = currentUser?.name ?? "";
  const firstName = userName.split(" ")[0] ?? userName;
  const { jobs, loading: jobsLoading } = useDashboardJobs(authToken ?? "");

  const analyzedCount = countAnalyzed(documents);
  const runningCount = countRunningJobs(jobs);
  const failedCount = countFailedJobsLast7Days(jobs);
  const redlineCount = countPendingRedlines(documents);
  const signatureCount = countPendingSignatures(documents);
  const liveJobs = runningJobs(jobs);
  const activityJobs = recentJobs(jobs);
  const docRows = recentDocuments(documents);

  return (
    <>
      <style>{DASHBOARD_STYLES}</style>
      <div className="dpa-results-bg flex-1 overflow-y-auto min-h-0 font-sans">
        <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-10">
          <div className="dashboard-root flex flex-col gap-5">
            <WelcomeBand
              greeting={getGreeting()}
              firstName={firstName}
              dateLabel={formatDateLabel()}
              summary={buildSummary(
                documents.length,
                runningCount,
                failedCount,
                redlineCount,
                signatureCount
              )}
            />

            <MetricCards
              documentCount={documents.length}
              analyzedCount={analyzedCount}
              runningCount={runningCount}
              failedCount={failedCount}
              redlineCount={redlineCount}
              signatureCount={signatureCount}
            />

            <div className="flex flex-col gap-5 min-w-0">
              <JobsRunning jobs={liveJobs} loading={jobsLoading} onOpen={(path) => navigate(path)} />
              <ContinueWorking
                items={docRows}
                onOpen={(path) => navigate(path)}
                onViewVault={() => navigate("/vault")}
              />
              <RecentActivity
                jobs={activityJobs}
                onStartDraft={() => navigate("/drafting")}
                onOpen={(path) => navigate(path)}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
