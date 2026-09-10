import { LegalDocument, Signature, RedlineProposal } from "../../shared/types";
import { JOB_TYPE_LABELS, JOB_TYPE_TABS } from "./constants";
import type {
  DashboardJob,
  DashboardJobStatus,
  DocumentRow,
} from "./types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function timeAgo(isoDate: string): string {
  if (!isoDate) return "—";
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function normalizeJob(raw: unknown): DashboardJob | null {
  const row = asRecord(raw);
  const id = pickString(row.id);
  if (!id) return null;

  const status = String(row.status || "queued").toLowerCase() as DashboardJobStatus;
  const valid: DashboardJobStatus[] = ["queued", "processing", "completed", "failed"];

  return {
    id,
    type: pickString(row.type) || "unknown",
    status: valid.includes(status) ? status : "queued",
    progress: typeof row.progress === "number" ? row.progress : Number(row.progress) || 0,
    message: pickString(row.message),
    payload: asRecord(row.payload),
    result: row.result ?? null,
    error: pickString(row.error),
    createdAt: pickString(row.createdAt, row.created_at) || new Date().toISOString(),
    completedAt: pickString(row.completedAt, row.completed_at) || undefined,
    updatedAt: pickString(row.updatedAt, row.updated_at) || undefined,
  };
}

export function jobLabel(type: string): string {
  return JOB_TYPE_LABELS[type] || type.replace(/_/g, " ");
}

export function jobTab(type: string): string {
  return JOB_TYPE_TABS[type] || "dashboard";
}

export function jobTarget(job: DashboardJob): string {
  const p = job.payload;
  const names = Array.isArray(p.fileNames)
    ? p.fileNames.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    : [];
  const original = asRecord(p.original);

  return (
    pickString(
      p.fileTitle,
      p.fileName,
      names[0],
      p.vendorUrl,
      p.websiteUrl,
      p.url,
      p.title,
      original.fileName
    ) || job.message || "Untitled"
  );
}

export function scanScore(job: DashboardJob): number | null {
  const result = asRecord(job.result);
  const summary = asRecord(result.scanSummary);
  const riskScores = asRecord(result.riskScores);
  const value = [summary.overallScore, result.overallScore, riskScores.overallScore].find(
    (v) => typeof v === "number" && Number.isFinite(v)
  );
  return typeof value === "number" ? Math.round(value) : null;
}

export function isRunningJob(job: DashboardJob): boolean {
  return job.status === "queued" || job.status === "processing";
}

export function jobTime(job: DashboardJob): string {
  return job.completedAt || job.updatedAt || job.createdAt;
}

function docField(doc: LegalDocument, key: string): unknown {
  return (doc as unknown as Record<string, unknown>)[key];
}

export function docId(doc: LegalDocument): string {
  return pickString(doc.id, docField(doc, "id")) || "";
}

export function docTitle(doc: LegalDocument): string {
  return pickString(doc.title, docField(doc, "name")) || "Untitled";
}

export function docType(doc: LegalDocument): string {
  return pickString(doc.type) || "Document";
}

export function docTimestamp(doc: LegalDocument): string {
  return pickString(
    doc.updatedAt,
    docField(doc, "updated_at"),
    doc.createdAt,
    docField(doc, "created_at")
  );
}

export function docSignatures(doc: LegalDocument): Signature[] {
  const value = doc.signatures ?? docField(doc, "signatures");
  return Array.isArray(value) ? (value as Signature[]) : [];
}

export function docRedlines(doc: LegalDocument): RedlineProposal[] {
  const value = doc.redlines ?? docField(doc, "redlines");
  return Array.isArray(value) ? (value as RedlineProposal[]) : [];
}

export function pendingRedlineCount(doc: LegalDocument): number {
  return docRedlines(doc).filter((r) => r.status === "pending").length;
}

export function pendingSignatureCount(doc: LegalDocument): number {
  return docSignatures(doc).filter((s) => s.status === "pending").length;
}

export function findingCount(doc: LegalDocument): number | null {
  const analysis = (doc.analysis ?? docField(doc, "analysis")) as
    | { risks?: unknown[]; findings?: unknown[] }
    | null
    | undefined;
  if (!analysis || typeof analysis !== "object") return null;
  if (Array.isArray(analysis.risks)) return analysis.risks.length;
  if (Array.isArray(analysis.findings)) return analysis.findings.length;
  return 0;
}

export function isAnalyzed(doc: LegalDocument): boolean {
  return findingCount(doc) !== null;
}

export function countAnalyzed(documents: LegalDocument[]): number {
  return (documents ?? []).filter(isAnalyzed).length;
}

export function countPendingRedlines(documents: LegalDocument[]): number {
  return (documents ?? []).reduce((sum, doc) => sum + pendingRedlineCount(doc), 0);
}

export function countPendingSignatures(documents: LegalDocument[]): number {
  return (documents ?? []).reduce((sum, doc) => sum + pendingSignatureCount(doc), 0);
}

export function countRunningJobs(jobs: DashboardJob[]): number {
  return jobs.filter(isRunningJob).length;
}

export function countFailedJobsLast7Days(jobs: DashboardJob[]): number {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  return jobs.filter((job) => {
    if (job.status !== "failed") return false;
    const t = new Date(jobTime(job)).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  }).length;
}

export function runningJobs(jobs: DashboardJob[]): DashboardJob[] {
  return jobs
    .filter(isRunningJob)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function recentJobs(jobs: DashboardJob[], limit = 8): DashboardJob[] {
  return [...jobs]
    .filter((job) => job.status === "completed" || job.status === "failed")
    .sort((a, b) => new Date(jobTime(b)).getTime() - new Date(jobTime(a)).getTime())
    .slice(0, limit);
}

export function recentDocuments(documents: LegalDocument[], limit = 6): DocumentRow[] {
  return [...(documents ?? [])]
    .sort((a, b) => new Date(docTimestamp(b)).getTime() - new Date(docTimestamp(a)).getTime())
    .slice(0, limit)
    .map((doc) => {
      const updatedAt = docTimestamp(doc);
      const findings = findingCount(doc);
      return {
        id: docId(doc),
        title: docTitle(doc),
        type: docType(doc),
        updatedAt,
        updatedLabel: timeAgo(updatedAt),
        analyzed: findings !== null,
        findingCount: findings,
      };
    });
}

export function buildSummary(
  docCount: number,
  running: number,
  failed: number,
  redlines: number,
  signatures: number
): string {
  if (docCount === 0 && running === 0) {
    return "No documents in the vault yet. Analyze or draft an agreement to get started.";
  }

  const parts: string[] = [];
  parts.push(`${docCount} document${docCount === 1 ? "" : "s"}`);
  if (running > 0) parts.push(`${running} job${running === 1 ? "" : "s"} running`);
  if (failed > 0) parts.push(`${failed} failed in the last 7 days`);
  if (redlines > 0) parts.push(`${redlines} pending redline${redlines === 1 ? "" : "s"}`);
  if (signatures > 0) parts.push(`${signatures} pending signature${signatures === 1 ? "" : "s"}`);
  return parts.join(" · ") + ".";
}
