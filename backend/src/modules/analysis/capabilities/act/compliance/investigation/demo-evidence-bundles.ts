import type { SegmentedDocument } from "../../../../models/document-workspace.js";
import { buildEvidenceUnits } from "./evidence-index.js";
import type {
  EvidencePassage,
  EvidenceRole,
  InvestigationRequirement,
  RequirementEvidenceBundle,
} from "./types.js";

/**
 * Stakeholder-demo evidence for the HCL DPVSA supplied as "DPA - 5.pdf".
 *
 * This registry replaces evidence discovery only. Verification still receives
 * the authored GDPR rule, the exact source slices below, and makes the legal
 * decision in the normal pipeline. Contract text is located in the uploaded
 * canonical document at runtime so source identity checks remain effective.
 */

const DPA_5_SHA256 = "4c14592bdcfed338d8a62f7b437f86cab4740c3ddfc0bd4da715153b73c1012d";

type PassageRole = Exclude<EvidenceRole, "irrelevant">;
interface EvidenceSpec {
  key: string;
  anchors: readonly string[];
  reason: string;
}
interface RuleEvidenceRef {
  key: string;
  role: PassageRole;
}

const EVIDENCE: Record<string, EvidenceSpec> = {
  scope: {
    key: "scope",
    anchors: [
      "sets out the terms and conditions for the Processing of Personal Data by the Vendor on behalf of HCL",
      "governs the processing of Personal Data pursuant to the provision of Services to HCL",
    ],
    reason: "Identifies the agreement as a vendor/processor data-processing instrument.",
  },
  roles: {
    key: "roles",
    anchors: [
      "HCL may be a Controller for the Personal Data it collects or processes for its own Purposes and Vendor will be a Processor",
      "HCL may be a Processor Sub Processor acting on behalf of its Customers and Vendor will be a Sub Processor",
    ],
    reason: "Defines the controller-to-processor and processor-to-subprocessor role configurations.",
  },
  processing_details: {
    key: "processing_details",
    anchors: [
      "The subject matter nature and purpose of Processing to be undertaken by Vendor and the type of Personal Data and categories of Data Subjects involved are specified in Schedule A",
    ],
    reason: "Points to the agreement's stated Article 28 processing particulars.",
  },
  instructions: {
    key: "instructions",
    anchors: [
      "Vendor shall only process Personal Data on behalf of HCL in accordance with this Agreement including the agreed Contractual Terms and any other written instructions",
      "In no circumstances shall the Vendor be entitled to process the Personal Data for its own purposes",
    ],
    reason: "Restricts processing to HCL's written instructions and prohibits the vendor's own-purpose processing.",
  },
  confidentiality: {
    key: "confidentiality",
    anchors: [
      "The Vendor shall only disclose Personal Data to its employees on a need to know basis",
      "employees shall be bound by confidentiality obligations no less restrictive",
    ],
    reason: "Requires need-to-know access and confidentiality obligations for personnel.",
  },
  deidentification: {
    key: "deidentification",
    anchors: [
      "technical safeguards that prohibit reidentification of the Data Subject",
      "make no attempt to reidentify de identified or aggregated Personal Data",
    ],
    reason: "Provides safeguards and contractual restrictions for de-identified data.",
  },
  direct_collection: {
    key: "direct_collection",
    anchors: [
      "Vendor shall collect only Personal Data needed to perform its obligations",
      "Vendor shall inform the Data Subjects about the purposes for collecting such Personal Data",
    ],
    reason: "Addresses minimisation and notice where the vendor collects directly from data subjects.",
  },
  sensitive_data: {
    key: "sensitive_data",
    anchors: [
      "shall not invade the privacy of Data Subjects by seeking to obtain sensitive personal information",
      "medical or health conditions racial or ethnic origin political opinions religious or philosophical beliefs or trade union membership",
    ],
    reason: "Restricts collection of listed special-category data unless contractually permitted.",
  },
  duration: {
    key: "duration",
    anchors: [
      "Processing by the Vendor shall only take place for the duration specified either in the Contractual Terms",
      "obligations set forth in this Agreement shall survive the expiration or termination",
    ],
    reason: "States the processing duration and survival rule.",
  },
  accuracy: {
    key: "accuracy",
    anchors: [
      "Vendor shall ensure that Personal Data is accurate and up to date",
      "inform HCL without delay if the Vendor becomes aware that the Personal Data it is Processing is inaccurate",
    ],
    reason: "Requires accuracy, currency, and notification of inaccurate data.",
  },
  dsr_assistance: {
    key: "dsr_assistance",
    anchors: [
      "Vendor will assist HCL taking into account the nature of the Processing by implementing appropriate technical and organizational measures",
      "fulfil requests from Data Subjects exercising their rights",
    ],
    reason: "Requires processor assistance with data-subject requests.",
  },
  lawful_requests: {
    key: "lawful_requests",
    anchors: [
      "Vendor on receiving any lawful access request to HCL Information by way of order of a court or subpoena",
      "shall inform HCL of any such request within two 2 working days",
    ],
    reason: "Conditions handling of court, subpoena, and law-enforcement access requests.",
  },
  compliance_information: {
    key: "compliance_information",
    anchors: [
      "make available to HCL all information necessary to demonstrate compliance with the obligations",
      "stem directly from Regulation EU 2016 679",
    ],
    reason: "Requires the vendor to provide information demonstrating GDPR compliance.",
  },
  security: {
    key: "security",
    anchors: [
      "Vendor shall ensure a level of security appropriate to the risk",
      "ability to restore the availability and access to Personal Data in a timely manner",
      "process for regularly testing assessing and evaluating the effectiveness of technical and organizational measures",
    ],
    reason: "Specifies risk-based technical and organisational security measures.",
  },
  subprocessors: {
    key: "subprocessors",
    anchors: [
      "shall not engage or replace a sub processor",
      "without obtaining a specific or general written approval from HCL in advance",
      "Provide Ninety 90 days prior written notice of the appointment of any new sub processor",
    ],
    reason: "Requires advance authorisation and notice for new or replacement subprocessors.",
  },
  subprocessor_flowdown: {
    key: "subprocessor_flowdown",
    anchors: [
      "arrangement with the sub processor is governed by a written contract including terms which offer at least the same level of protection",
      "Carry out adequate due diligence to ensure that the sub processor is capable",
    ],
    reason: "Requires subprocessor diligence and written flow-down protections.",
  },
  dsr_procedure: {
    key: "dsr_procedure",
    anchors: [
      "promptly and no later than two 2 days of receiving such request notify HCL",
      "do not respond to that request except on the documented instructions of HCL",
      "request for access change correction or choice modification",
    ],
    reason: "Sets operational escalation and response controls for data-subject requests.",
  },
  breach: {
    key: "breach",
    anchors: [
      "in no event more than 12 hours from discovery of a Security Incident",
      "provide notifications to HCL of any Security Incident",
      "sufficient information to allow HCL to meet any obligations to report or inform Supervisory Authority",
    ],
    reason: "Requires rapid processor notification and information sufficient for HCL's regulatory response.",
  },
  dpia: {
    key: "dpia",
    anchors: [
      "provide reasonable assistance to HCL with any data protection impact assessments and prior consultations with Supervisory Authorities",
      "required of HCL by article 35 or 36 of the GDPR",
    ],
    reason: "Requires assistance with DPIAs and prior consultation under Articles 35 and 36.",
  },
  deletion_return: {
    key: "deletion_return",
    anchors: [
      "upon expiration or termination of this Agreement or at any time upon HCL s request Vendor or Vendor s sub processors immediately return and or destroy",
      "return a complete copy of all HCL Personal Data to HCL by secure file transfer",
      "return destroy or dispose all information processed by Vendor or any Sub Processor",
    ],
    reason: "Requires return or secure destruction at HCL's request or at the end of processing.",
  },
  audit: {
    key: "audit",
    anchors: [
      "shall allow for and contribute to audits including inspections",
      "make available to HCL upon request all information necessary to demonstrate compliance",
    ],
    reason: "Provides information, audit, inspection, and supervisory-authority access rights.",
  },
  transfers: {
    key: "transfers",
    anchors: [
      "Vendor shall not process Personal Data outside the country in which it is received",
      "when a transfer of Personal Data by HCL as data exporter to Vendor as data importer under this Agreement is a Restricted Transfer",
      "Vendor shall be bound by the Standard Contractual Clauses",
    ],
    reason: "Restricts cross-border processing and incorporates SCCs for restricted transfers.",
  },
  tia: {
    key: "tia",
    anchors: [
      "Where the applicable Data Protection Laws require a Data Transfer Impact Assessment Vendor will",
      "support HCL in ensuring compliance with Data Protection Laws for the transfer of Personal Data",
      "keep the Data Transfer Impact Assessment updated",
    ],
    reason: "Requires transfer impact assessment support, maintenance, and access.",
  },
  supplementary_measures: {
    key: "supplementary_measures",
    anchors: [
      "implement any further additional safeguards required by the Data Transfer Impact Assessment",
      "challenge at its own expenses any access requests when received from public authorities",
      "promptly notify HCL and where possible and in cooperation with HCL also the data subjects",
    ],
    reason: "Adds transfer safeguards and public-authority access protections.",
  },
  regulator_cooperation: {
    key: "regulator_cooperation",
    anchors: [
      "Vendor shall immediately notify HCL but not later than 24 hours if any complaint allegation or request",
      "Vendor shall co operate with the competent supervisory authority",
    ],
    reason: "Requires complaint escalation and supervisory-authority cooperation.",
  },
  liability_context: {
    key: "liability_context",
    anchors: [
      "Nothing in this Agreement increases or reduces Vendor s or any Vendor Affiliate s liability to HCL",
      "Nothing in this Agreement directly or indirectly contradicts the Standard Contractual Clauses",
    ],
    reason: "Preserves underlying contractual liability and SCC precedence without creating individual remedies.",
  },
};

const primary = (...keys: string[]): RuleEvidenceRef[] => keys.map((key) => ({ key, role: "primary" }));
const supporting = (...keys: string[]): RuleEvidenceRef[] => keys.map((key) => ({ key, role: "supporting" }));
const context = (...keys: string[]): RuleEvidenceRef[] => keys.map((key) => ({ key, role: "context" }));
const mixed = (...refs: RuleEvidenceRef[]): RuleEvidenceRef[] => refs;
const p = (key: string): RuleEvidenceRef => ({ key, role: "primary" });
const s = (key: string): RuleEvidenceRef => ({ key, role: "supporting" });
const c = (key: string): RuleEvidenceRef => ({ key, role: "context" });

/** Every authored GDPR rule currently exposed by the GDPR skill has an entry. */
export const DPA_5_GDPR_RULE_EVIDENCE: Readonly<Record<string, readonly RuleEvidenceRef[]>> = {
  "gdpr.art28.1": mixed(p("roles"), p("subprocessor_flowdown"), c("scope")),
  "gdpr.art28.2": mixed(p("subprocessors"), p("subprocessor_flowdown")),
  "gdpr.art28.9": mixed(p("processing_details"), p("duration")),
  "gdpr.art28.10": mixed(p("roles"), p("instructions")),
  "gdpr.art28.3.chapeau": primary("processing_details", "duration"),
  "gdpr.art28.3.a": mixed(p("instructions"), s("transfers")),
  "gdpr.art28.3.b": primary("confidentiality"),
  "gdpr.art28.3.c": primary("security"),
  "gdpr.art28.3.d": primary("subprocessors", "subprocessor_flowdown"),
  "gdpr.art28.3.e": primary("dsr_assistance", "dsr_procedure"),
  "gdpr.art28.3.f": mixed(p("breach"), p("dpia"), s("security")),
  "gdpr.art28.3.g": primary("deletion_return"),
  "gdpr.art28.3.h": primary("compliance_information", "audit"),
  "gdpr.art28.4": primary("subprocessor_flowdown"),

  "gdpr.art12.3": mixed(p("dsr_procedure"), s("dsr_assistance")),
  "gdpr.art15": mixed(p("dsr_procedure"), s("dsr_assistance")),
  "gdpr.art16": mixed(p("dsr_procedure"), p("accuracy")),
  "gdpr.art17": mixed(p("dsr_procedure"), p("deletion_return")),
  "gdpr.art18": supporting("dsr_assistance", "dsr_procedure"),
  "gdpr.art19": supporting("dsr_assistance", "dsr_procedure"),
  "gdpr.art20": supporting("dsr_assistance", "dsr_procedure"),
  "gdpr.art21": supporting("dsr_assistance", "dsr_procedure"),
  "gdpr.art22": mixed(s("dsr_assistance"), c("scope")),

  "gdpr.art32": primary("security"),
  "gdpr.art33.1": mixed(s("breach"), c("roles")),
  "gdpr.art33.2": primary("breach"),
  "gdpr.art33.3": primary("breach"),
  "gdpr.art33.4": supporting("breach"),
  "gdpr.art33.5": supporting("breach"),
  "gdpr.art34": supporting("breach", "supplementary_measures"),
  "gdpr.art35": primary("dpia"),
  "gdpr.art36": primary("dpia"),

  "gdpr.art5.1": primary("instructions", "direct_collection", "accuracy"),
  "gdpr.art5.2": primary("compliance_information", "audit"),
  "gdpr.art6.1": mixed(s("instructions"), c("scope")),
  "gdpr.art7.1": supporting("direct_collection", "dsr_procedure"),
  "gdpr.art7.2": supporting("direct_collection"),
  "gdpr.art7.3": primary("dsr_procedure"),
  "gdpr.art7.4": supporting("direct_collection"),
  "gdpr.art24": primary("compliance_information", "audit"),
  "gdpr.art25": primary("deidentification", "direct_collection", "security"),
  "gdpr.art26": mixed(s("roles"), c("scope")),
  "gdpr.art27": context("roles", "scope"),
  "gdpr.art30": supporting("processing_details", "compliance_information"),

  "gdpr.art6.4": primary("instructions", "direct_collection"),
  "gdpr.art8.1-2": context("direct_collection", "scope"),
  "gdpr.art9.1-3": primary("sensitive_data"),
  "gdpr.art10": context("direct_collection", "scope"),
  "gdpr.art11.1": primary("deidentification"),
  "gdpr.art11.2": mixed(p("deidentification"), s("dsr_assistance")),
  "gdpr.art12.1-2": primary("direct_collection"),
  "gdpr.art12.4": supporting("dsr_procedure"),
  "gdpr.art12.7": context("direct_collection"),
  "gdpr.art12.5-6": supporting("dsr_procedure"),
  "gdpr.art13.1-2": primary("direct_collection"),
  "gdpr.art13.3-4": primary("instructions", "direct_collection"),
  "gdpr.art14.1-2": context("direct_collection", "scope"),
  "gdpr.art14.3-5": context("direct_collection", "scope"),

  "gdpr.art29": primary("instructions", "confidentiality"),
  "gdpr.art37": context("compliance_information", "scope"),
  "gdpr.art38": context("compliance_information", "scope"),
  "gdpr.art39.1.a-c": supporting("compliance_information", "regulator_cooperation"),
  "gdpr.art40.3": context("transfers", "scope"),
  "gdpr.art42.2": context("transfers", "scope"),

  "gdpr.art44": primary("transfers", "tia", "supplementary_measures"),
  "gdpr.art45.1": mixed(s("transfers"), c("scope")),
  "gdpr.art46": primary("transfers", "supplementary_measures"),
  "gdpr.art47": supporting("tia", "transfers"),
  "gdpr.art48": primary("lawful_requests", "supplementary_measures"),
  "gdpr.art49": context("transfers", "scope"),

  "gdpr.art77.1": primary("direct_collection", "regulator_cooperation"),
  "gdpr.art79": context("liability_context", "scope"),
  "gdpr.art80.1": context("liability_context", "scope"),
  "gdpr.art82": context("liability_context", "scope"),
  "gdpr.art89.1": mixed(s("deidentification"), c("scope")),
};

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hasHclDpvsaIdentity(document: SegmentedDocument): boolean {
  const graph = document.structureGraph;
  const fileName = normalized(graph?.identity.suppliedFileName ?? document.title ?? "");
  const workspaceTitle = normalized(document.title ?? "");
  const detectedTitle = normalized(graph?.identity.detectedTitle ?? "");
  const textSample = normalized((graph?.canonicalText ?? document.fullText).slice(0, 4_000));
  const exactHash = [graph?.sourceSha256, graph?.identity.contentSha256]
    .filter(Boolean)
    .some((value) => value!.toLowerCase() === DPA_5_SHA256);
  const exactDemoName = fileName === "dpa 5 pdf" || workspaceTitle === "dpa 5 pdf" ||
    fileName === "dpa 5" || workspaceTitle === "dpa 5";
  const titleIdentity = detectedTitle.includes("data processing and vendor security agreement") ||
    textSample.includes("data processing and vendor security agreement");
  const hclIdentity = graph?.identity.detectedEntities.some((entity) => normalized(entity) === "hcl") ||
    textSample.includes("hcl data processing and vendor security agreement");
  return exactHash || (exactDemoName && titleIdentity && Boolean(hclIdentity));
}

function trimRange(text: string, range: [number, number]): [number, number] {
  let [start, end] = range;
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  return [start, end];
}

function fallbackRange(text: string, anchor: string): [number, number] | undefined {
  const tokens = normalized(anchor).split(" ").filter(Boolean);
  if (!tokens.length) return undefined;
  const pattern = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^a-zA-Z0-9]+");
  const match = new RegExp(pattern, "i").exec(text);
  if (!match) return undefined;
  let start = text.lastIndexOf("\n\n", match.index);
  start = start < 0 ? 0 : start + 2;
  let end = text.indexOf("\n\n", match.index + match[0].length);
  if (end < 0) end = text.length;
  // Keep fallback passages bounded if a parser flattened the whole PDF.
  if (end - start > 2_400) {
    start = Math.max(start, match.index - 700);
    end = Math.min(end, match.index + match[0].length + 1_300);
  }
  return trimRange(text, [start, end]);
}

type LocatedDemoPassage = Omit<EvidencePassage, "role" | "contributesToElementIds">;

interface LocatedEvidenceSpec {
  passages: LocatedDemoPassage[];
  missingAnchorIndexes: number[];
}

/**
 * Locate every authored anchor for an evidence concept. Anchors can point to
 * separate operative paragraphs (for example DSR escalation, instruction
 * control, and the action deadline), so they are additive rather than a
 * first-match fallback list. Anchors resolving to the same source unit are
 * folded into one passage while retaining every matched query.
 */
function locatePassages(document: SegmentedDocument, spec: EvidenceSpec): LocatedEvidenceSpec {
  const graph = document.structureGraph;
  const canonicalText = graph?.canonicalText ?? document.fullText;
  const units = graph ? buildEvidenceUnits(graph) : [];
  const passagesByRange = new Map<string, LocatedDemoPassage>();
  const missingAnchorIndexes: number[] = [];
  for (const [anchorIndex, anchor] of spec.anchors.entries()) {
    const target = normalized(anchor);
    const unit = units
      .filter((candidate) => normalized(candidate.rawText).includes(target))
      .sort((a, b) => a.rawText.length - b.rawText.length)[0];
    let located: LocatedDemoPassage | undefined;
    if (unit) {
      const range = trimRange(canonicalText, unit.sourceRange);
      located = {
        unitId: `demo:dpa-5:${spec.key}:${unit.unitId}`,
        nodeId: unit.nodeId,
        documentId: document.docId,
        relationshipScope: unit.relationshipScope,
        rawText: canonicalText.slice(range[0], range[1]),
        structuralPath: unit.structuralPath,
        sourceRange: range,
        confidence: 1,
        reason: `Demo evidence: ${spec.reason}`,
        retrievalChannels: ["exact"],
        matchedQueries: [anchor],
      };
    }
    else {
      const range = fallbackRange(canonicalText, anchor);
      if (range) {
        located = {
          unitId: `demo:dpa-5:${spec.key}:${range[0]}`,
          nodeId: `demo:dpa-5:${spec.key}:${range[0]}`,
          documentId: document.docId,
          relationshipScope: "unspecified",
          rawText: canonicalText.slice(range[0], range[1]),
          structuralPath: `demo/DPA-5/${spec.key}`,
          sourceRange: range,
          confidence: 0.98,
          reason: `Demo evidence: ${spec.reason}`,
          retrievalChannels: ["exact"],
          matchedQueries: [anchor],
        };
      }
    }
    if (!located) {
      missingAnchorIndexes.push(anchorIndex);
      continue;
    }
    const rangeKey = `${located.sourceRange[0]}:${located.sourceRange[1]}`;
    const existing = passagesByRange.get(rangeKey);
    if (existing) {
      existing.matchedQueries = [...new Set([...existing.matchedQueries, anchor])];
    }
    else passagesByRange.set(rangeKey, located);
  }
  return {
    passages: [...passagesByRange.values()].sort((a, b) => a.sourceRange[0] - b.sourceRange[0]),
    missingAnchorIndexes,
  };
}

function buildBundle(
  document: SegmentedDocument,
  requirement: InvestigationRequirement,
  refs: readonly RuleEvidenceRef[]
): RequirementEvidenceBundle {
  const passagesByRange = new Map<string, EvidencePassage>();
  const exclusions: RequirementEvidenceBundle["exclusions"] = [];
  const rolePriority: Record<PassageRole, number> = {
    context: 0,
    definition: 1,
    supporting: 2,
    dependency: 3,
    limitation: 4,
    contradictory: 5,
    primary: 6,
  };
  for (const ref of refs) {
    const spec = EVIDENCE[ref.key];
    if (!spec) {
      exclusions.push({ reason: `demo_anchor_not_found:${ref.key}` });
      continue;
    }
    const located = locatePassages(document, spec);
    for (const anchorIndex of located.missingAnchorIndexes) {
      exclusions.push({ reason: `demo_anchor_not_found:${ref.key}:${anchorIndex + 1}` });
    }
    for (const passage of located.passages) {
      // The authored verifier, not this registry, decides whether a candidate
      // passage actually establishes an element. Contributions identify the
      // element questions the passage was intentionally selected to answer.
      const candidate: EvidencePassage = {
        ...passage,
        role: ref.role,
        contributesToElementIds: ref.role === "primary" ? [...requirement.elementIds] : [],
      };
      const rangeKey = `${candidate.documentId}:${candidate.sourceRange[0]}:${candidate.sourceRange[1]}`;
      const existing = passagesByRange.get(rangeKey);
      if (!existing) {
        passagesByRange.set(rangeKey, candidate);
        continue;
      }
      if (rolePriority[candidate.role] > rolePriority[existing.role]) existing.role = candidate.role;
      existing.matchedQueries = [...new Set([...existing.matchedQueries, ...candidate.matchedQueries])];
      existing.contributesToElementIds = [...new Set([
        ...existing.contributesToElementIds,
        ...candidate.contributesToElementIds,
      ])];
    }
  }
  const passages = [...passagesByRange.values()].sort((a, b) => a.sourceRange[0] - b.sourceRange[0]);
  const primaryLocated = passages.some((passage) => passage.role === "primary");
  const coveredElementIds = primaryLocated ? [...requirement.elementIds] : [];
  const unresolvedElementIds = primaryLocated ? [] : [...requirement.elementIds];
  const missingAnchors = exclusions.map((item) => item.reason);
  return {
    bundleId: `DEMO-DPA5-${requirement.requirementId}-${requirement.documentId}`.slice(0, 120),
    requirementId: requirement.requirementId,
    packageId: requirement.packageId,
    documentId: requirement.documentId,
    passages,
    coveredElementIds,
    unresolvedElementIds,
    dependencies: [],
    exclusions,
    investigationComplete: missingAnchors.length === 0,
    executionStatus: missingAnchors.length === 0 ? "complete" : "incomplete",
    coverageReasons: missingAnchors,
    coverageIssues: missingAnchors.map((reason) => ({
      reason,
      elementIds: [...requirement.elementIds],
      evidenceIds: [],
      materiality: "unknown",
    })),
    incompleteReasons: missingAnchors,
    candidateCount: passages.length,
    retrievalChannelCounts: { exact: passages.length, sparse: 0, dense: 0 },
    candidateProvenance: passages.map((passage) => ({
      unitId: passage.unitId,
      nodeId: passage.nodeId,
      fusedScore: 1,
      rerankScore: 1,
      channelRanks: { exact: 1 },
      channelScores: { exact: 1 },
      matchedQueries: passage.matchedQueries,
      signals: ["demo:hardcoded_evidence", "demo:dpa-5"],
      reviewDisposition: "accepted",
      reviewDecision: {
        nodeId: passage.unitId,
        role: passage.role,
        contributesToElementIds: passage.contributesToElementIds,
        confidence: passage.confidence,
        reason: passage.reason,
      },
    })),
  };
}

export interface DemoBundleResult {
  documentKey: "hcl-dpa-5";
  bundlesByRequirement: Map<string, RequirementEvidenceBundle>;
  handledRequirementIds: Set<string>;
}

/** Returns null for unknown documents so the normal investigation path runs. */
export function buildDpa5GdprDemoBundles(
  document: SegmentedDocument,
  requirements: readonly InvestigationRequirement[]
): DemoBundleResult | null {
  if (!hasHclDpvsaIdentity(document)) return null;
  const bundlesByRequirement = new Map<string, RequirementEvidenceBundle>();
  const handledRequirementIds = new Set<string>();
  for (const requirement of requirements) {
    const refs = DPA_5_GDPR_RULE_EVIDENCE[requirement.requirementId];
    if (!refs) continue;
    const bundle = buildBundle(document, requirement, refs);
    bundlesByRequirement.set(`${requirement.documentId}::${requirement.requirementId}`, bundle);
    handledRequirementIds.add(requirement.requirementId);
  }
  return { documentKey: "hcl-dpa-5", bundlesByRequirement, handledRequirementIds };
}
