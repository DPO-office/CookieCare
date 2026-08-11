import { LegalDocument } from "../../shared/types";
import type { StatusBadgeVariant } from "../../shared/components/StatusBadge";

export function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export interface DocLogEntry {
  id: string;
  target: string;
  score: number;
  issues: number;
  type: string;
  scanTime: string;
  updatedAt: string;
}

export interface DocumentWorkItem {
  id: string;
  title: string;
  type: string;
  score: number;
  issues: number;
  pendingRedlines: number;
  pendingSignatures: number;
  updatedAt: string;
  updatedLabel: string;
  statusLabel: string;
  statusVariant: StatusBadgeVariant;
  suggestedTab: string;
  actionLabel: string;
}

function riskCount(doc: LegalDocument): number {
  return doc.analysis?.risks?.length ?? 0;
}

function pendingRedlines(doc: LegalDocument): number {
  return doc.redlines?.filter((r) => r.status === "pending").length ?? 0;
}

function pendingSignatures(doc: LegalDocument): number {
  return doc.signatures?.filter((s) => s.status === "pending").length ?? 0;
}

export function computeDocumentScore(doc: LegalDocument): number {
  const risks = riskCount(doc);
  const redlines = pendingRedlines(doc);
  return Math.max(0, 100 - risks * 15 - redlines * 5);
}

export function buildDocumentLogs(documents: LegalDocument[]): DocLogEntry[] {
  return (documents ?? []).map((doc) => {
    const issues = riskCount(doc) + pendingRedlines(doc);
    const updatedAt = doc.updatedAt || doc.createdAt || new Date().toISOString();
    return {
      id: doc.id,
      target: doc.title || "Untitled",
      score: computeDocumentScore(doc),
      issues,
      type: doc.type || "—",
      scanTime: timeAgo(updatedAt),
      updatedAt,
    };
  });
}

export function buildWorkItems(documents: LegalDocument[], limit = 5): DocumentWorkItem[] {
  return [...(documents ?? [])]
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime()
    )
    .slice(0, limit)
    .map((doc) => {
      const issues = riskCount(doc) + pendingRedlines(doc);
      const redlines = pendingRedlines(doc);
      const signatures = pendingSignatures(doc);
      const updatedAt = doc.updatedAt || doc.createdAt || new Date().toISOString();

      let statusLabel = "Ready to review";
      let statusVariant: StatusBadgeVariant = "neutral";
      let suggestedTab = "legal-review";
      let actionLabel = "Open document";

      if (redlines > 0) {
        statusLabel = `${redlines} redline${redlines === 1 ? "" : "s"} pending`;
        statusVariant = "warning";
        suggestedTab = "legal-negotiate";
        actionLabel = "Resume negotiation";
      } else if (issues > 0) {
        statusLabel = `${issues} issue${issues === 1 ? "" : "s"} found`;
        statusVariant = "danger";
        suggestedTab = "legal-review";
        actionLabel = "Review findings";
      } else if (signatures > 0) {
        statusLabel = `${signatures} signature${signatures === 1 ? "" : "s"} pending`;
        statusVariant = "brand";
        suggestedTab = "legal-review";
        actionLabel = "Check signatures";
      } else if (doc.analysis) {
        statusLabel = "Analysis complete";
        statusVariant = "success";
        actionLabel = "View analysis";
      }

      return {
        id: doc.id,
        title: doc.title || "Untitled",
        type: doc.type || "Custom",
        score: computeDocumentScore(doc),
        issues,
        pendingRedlines: redlines,
        pendingSignatures: signatures,
        updatedAt,
        updatedLabel: timeAgo(updatedAt),
        statusLabel,
        statusVariant,
        suggestedTab,
        actionLabel,
      };
    });
}

export function countAttentionItems(documents: LegalDocument[]): number {
  return (documents ?? []).filter((doc) => {
    const issues = riskCount(doc) + pendingRedlines(doc);
    const signatures = pendingSignatures(doc);
    return issues > 0 || signatures > 0;
  }).length;
}

export function computeAverageTrustScore(documents: LegalDocument[]): number | null {
  if (!documents?.length) return null;
  const total = documents.reduce((sum, doc) => sum + computeDocumentScore(doc), 0);
  return Math.round(total / documents.length);
}

export function getPriorityItem(items: DocumentWorkItem[]): DocumentWorkItem | null {
  if (!items.length) return null;
  const attention = items.find(
    (i) => i.statusVariant === "danger" || i.statusVariant === "warning"
  );
  return attention ?? items[0];
}
