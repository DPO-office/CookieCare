import type { SkillManifestEntry } from "./types.js";

/**
 * Governance manifest — one entry per authored skill folder.
 * Draft skills must never silently run as complete (select-skills surfaces warnings).
 */
export const skillManifest: SkillManifestEntry[] = [
  {
    skillId: "_global",
    axis: "global",
    status: "published",
    version: "1.0.0",
    owner: "analysis",
    lastReviewedAt: "2026-08-14",
    coverageNote: "Always-on general contract baseline.",
  },
  {
    skillId: "doc-types/dpa",
    axis: "doc-type",
    status: "published",
    version: "1.0.0",
    owner: "analysis",
    lastReviewedAt: "2026-08-14",
    coverageNote: "Structural DPA checks only; named-law content is in GDPR regime.",
  },
  {
    skillId: "doc-types/commercial-agreement",
    axis: "doc-type",
    status: "published",
    version: "1.0.0",
    owner: "analysis",
    lastReviewedAt: "2026-08-14",
  },
  {
    skillId: "doc-types/saas-agreement",
    axis: "doc-type",
    status: "reviewed",
    version: "1.0.0",
    owner: "analysis",
    coverageNote: "Inheritance proof — SLA/uptime delta on commercial-agreement.",
  },
  {
    skillId: "regimes/data-protection/gdpr",
    axis: "regime",
    status: "published",
    version: "2.0.1",
    owner: "analysis",
    lastReviewedAt: "2026-08-14",
    coverageNote:
      "EU GDPR Articles 1–99 reviewed; private controller/processor obligations and data-subject rights authored (v2.0.1 adds breach escalation/records, adequacy, BCR, complaint right, and conditional code/cert transfer rules). Chapters VI–VII and public/institutional duties excluded. UK coverage remains partial because the supplied UK PDF is only S.I. 2023/1417, not the consolidated UK GDPR.",
  },
  {
    skillId: "jurisdictions/delaware",
    axis: "jurisdiction",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote: "Stub — non-compete reasonableness only.",
  },
  {
    skillId: "jurisdictions/england-wales",
    axis: "jurisdiction",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote: "Stub — restrictive covenant reasonableness only.",
  },
  {
    skillId: "jurisdictions/ireland",
    axis: "jurisdiction",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote: "Stub — non-compete reasonableness only.",
  },
  {
    skillId: "jurisdictions/california",
    axis: "jurisdiction",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote: "Stub — Cal. Bus. & Prof. Code §16600 non-compete enforceability.",
  },
];

export function getManifestEntry(skillId: string): SkillManifestEntry | undefined {
  return skillManifest.find((e) => e.skillId === skillId);
}
