import { LegalDocument } from "../../shared/types";

export function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export interface DocLogEntry {
  target: string;
  score: number;
  issues: number;
  type: string;
  scanTime: string;
}

export function buildDocumentLogs(documents: LegalDocument[]): DocLogEntry[] {
  return (documents ?? []).map((doc) => {
    const riskCount = (doc as any)?.analysis?.risks?.length ?? 0;
    const pendingRedlines = ((doc as any)?.redlines ?? []).filter((r: any) => r.status === "pending").length ?? 0;
    const score = Math.max(0, 100 - riskCount * 15 - pendingRedlines * 5);
    return {
      target: (doc as any)?.title || "Untitled",
      score,
      issues: riskCount + pendingRedlines,
      type: (doc as any)?.type || "—",
      scanTime: timeAgo((doc as any)?.updatedAt || (doc as any)?.createdAt || new Date().toISOString()),
    };
  });
}
