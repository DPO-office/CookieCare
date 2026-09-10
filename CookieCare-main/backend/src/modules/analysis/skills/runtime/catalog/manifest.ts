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
    skillId: "doc-types/nda",
    axis: "doc-type",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote:
      "Thin mutual-NDA structure plus NLRB/Boeing confidentiality overlay. The supplied 'Standard Mutual NDA Blueprint' PDF is an ABA article, not a model NDA.",
  },
  {
    skillId: "doc-types/msa",
    axis: "doc-type",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote:
      "Inherits commercial. Sourced from MSA_AI_Prompt_Repository_Playbook (vetting checklist), not a model MSA. The file named Master Services Agreement (MSA).pdf is the Contract Clause Linkages Guide and was not used as the MSA primary source.",
  },
  {
    skillId: "doc-types/employment-agreement",
    axis: "doc-type",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote:
      "UK statutory-particulars overlay only (ERA 1996 ss.1, 4, 11 as amended by SI 2019). Not a full employment playbook.",
  },
  {
    skillId: "doc-types/vendor-agreement",
    axis: "doc-type",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote: "TIPS Vendor Agreement procurement overlay on commercial-agreement.",
  },
  {
    skillId: "doc-types/saas-agreement",
    axis: "doc-type",
    status: "reviewed",
    version: "1.1.0",
    owner: "analysis",
    lastReviewedAt: "2026-08-17",
    coverageNote:
      "Deepened from MSite SaaS Terms & SLA benchmark (99% quarterly availability, credits, archive/exit, customer-data ownership).",
  },
  {
    skillId: "doc-types/commercial-agreement",
    axis: "doc-type",
    status: "published",
    version: "1.1.0",
    owner: "analysis",
    lastReviewedAt: "2026-08-17",
    coverageNote:
      "General commercial baseline only. MSA, NDA, SaaS, and vendor packs are separate. Corporate governance / disputes still pending.",
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
    skillId: "regimes/data-protection/uk-gdpr-idta",
    axis: "regime",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote:
      "UK operational overlay (IDTA/Addendum, UK representative, ICO). Consolidated UK GDPR/DPA 2018 + drafting pack. GDPR UK.pdf is only S.I. 2023/1417 and is not treated as the UK GDPR.",
  },
  {
    skillId: "regimes/data-protection/ccpa-cpra",
    axis: "regime",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote:
      "CPRA service-provider contract overlay from the 20 March 2025 source. The small CCPA PDF in the skills folder is a 2018 law-review article, not the Act.",
  },
  {
    skillId: "regimes/data-protection/international-transfers",
    axis: "regime",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote:
      "EU SCC module/docking + EDPB Schrems II TIA/supplementary measures. Does not duplicate GDPR Chapter V.",
  },
  {
    skillId: "regimes/ai-governance/eu-ai-act",
    axis: "regime",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote:
      "Private provider/deployer/importer/distributor duties and affected-person rights under Regulation (EU) 2024/1689. Public/institutional duties excluded.",
  },
  {
    skillId: "regimes/healthcare/hipaa-baa",
    axis: "regime",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote:
      "BAA operational clauses from the UCLA Health BAA. The HHS PDF in the skills folder is a Katrina enforcement bulletin, not a model BAA.",
  },
  {
    skillId: "topics/cybersecurity-and-incident-response",
    axis: "topic",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote:
      "NIS2 Arts 21/23 legal duties plus NIST CSF 2.0 recommendations. The supplied SEC PDF is a 2026 Reg S-K comment letter, not Item 1.05, and is not authored.",
  },
  {
    skillId: "topics/vendor-risk-and-diligence",
    axis: "topic",
    status: "draft",
    version: "0.1.0",
    owner: "analysis",
    coverageNote:
      "EBA/GL/2019/02 outsourcing + NIST SP 800-161 C-SCRM. Not a MiFID II / PSD2 / FCA regime pack.",
  },
  {
    skillId: "jurisdictions/delaware",
    axis: "jurisdiction",
    status: "draft",
    version: "0.2.0",
    owner: "analysis",
    coverageNote: "6 Del. C. §2708, forum exclusivity, public-policy non-compete limit, UETA.",
  },
  {
    skillId: "jurisdictions/england-wales",
    axis: "jurisdiction",
    status: "draft",
    version: "0.2.0",
    owner: "analysis",
    coverageNote:
      "Simple contract vs deed, Companies Act 2006 s.44, physical witnessing. Aliases england / uk.",
  },
  {
    skillId: "jurisdictions/ireland",
    axis: "jurisdiction",
    status: "draft",
    version: "0.2.0",
    owner: "analysis",
    coverageNote: "ECA 2000 / eIDAS e-sign limits and Companies Act 2014 s.43 seal. GDPR is cross-referenced, not duplicated.",
  },
  {
    skillId: "jurisdictions/california",
    axis: "jurisdiction",
    status: "draft",
    version: "0.2.0",
    owner: "analysis",
    coverageNote:
      "Cal. Bus. & Prof. Code §16600, commercial vs employment restraints, UETA mutual e-consent.",
  },
];

export function getManifestEntry(skillId: string): SkillManifestEntry | undefined {
  return skillManifest.find((e) => e.skillId === skillId);
}
