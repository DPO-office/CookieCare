import type { DraftState, DraftSection } from "../../models/draft-state.js";
import type { ExhibitSpec } from "../../models/draft-exhibits.js";
import { buildDealIdentity } from "./deal-identity.js";
import { runAssemblyCheck } from "./assembly-check.js";
import {
  parseSignatoriesFromText,
  type SignerRecord,
} from "../plan/core-deal-facts.js";


function stripMarkdownHeading(body: string): { heading: string | null; rest: string } {
  const lines = body.replace(/^\uFEFF/, "").split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return { heading: null, rest: "" };

  const firstLine = lines[i].trim();

  // Dangling bold/numeric markers like **4 or **4. alone before heading
  if (/^\*\*\d+\.?\s*$/.test(firstLine)) {
    const nextRest = lines.slice(i + 1).join("\n").trim();
    return stripMarkdownHeading(nextRest);
  }

  // Markdown heading (e.g. ## 4. Exclusions or ## Exclusions)
  if (/^#{1,3}\s+/.test(firstLine)) {
    const heading = firstLine
      .replace(/^#{1,3}\s+/, "")
      .replace(/^\d+\.\s*/, "")
      .replace(/\*\*$/, "")
      .trim();
    return { heading, rest: lines.slice(i + 1).join("\n").trim() };
  }

  // Bold heading (e.g. **4. Exclusions** or **Exclusions** or **Section 4: Exclusions**)
  if (/^\*\*(?:(?:\d+\.|\bSection\s+\d+:?)\s*)?([^*]+)\*\*$/.test(firstLine)) {
    const m = /^\*\*(?:(?:\d+\.|\bSection\s+\d+:?)\s*)?([^*]+)\*\*$/.exec(firstLine);
    const heading = m ? m[1].replace(/^\d+\.\s*/, "").trim() : null;
    return { heading, rest: lines.slice(i + 1).join("\n").trim() };
  }

  return { heading: null, rest: lines.slice(i).join("\n").trim() };
}

function stripLeadingPreamble(text: string): string {
  // Drop "This Agreement is entered into..." / WHEREAS blocks from section bodies
  // so we can emit a single canonical preamble.
  let t = text;
  t = t.replace(
    /^(?:\*\*THE PARTIES\.\*\*\s*)?This (?:[\w\s-]+)?(?:Agreement|Addendum|NDA)[,\s\w]+entered into[^\n]*(?:\n(?!#)[^\n]*)*/i,
    ""
  );
  t = t.replace(/^(?:WHEREAS[^\n]*\n?)+/i, "");
  return t.trim();
}

function dedupeWhereas(text: string): string {
  const blocks = text.match(/WHEREAS[\s\S]*?(?=(?:WHEREAS|NOW, THEREFORE|##|\n\n[A-Z]))/gi);
  if (!blocks || blocks.length <= 1) return text;
  // Keep first WHEREAS cluster only.
  let seen = false;
  return text.replace(/WHEREAS[\s\S]*?(?=(?:WHEREAS|NOW, THEREFORE|##|\n\n[A-Z])|$)/gi, (m) => {
    if (seen) return "";
    seen = true;
    return m;
  });
}

function buildTitle(state: DraftState): string {
  const facts = (state.structuredFacts ?? state.plan?.structuredFacts ?? {}) as Record<string, unknown>;
  const docType = (
    (typeof facts.documentType === "string" ? facts.documentType : "") ||
    state.plan?.documentType ||
    state.draftingContext?.documentType ||
    state.requirements?.contractType ||
    "agreement"
  ).toLowerCase();
  const ndaType = typeof facts.ndaType === "string" ? facts.ndaType.toLowerCase() : "";
  const contractType = typeof state.requirements?.contractType === "string" ? state.requirements.contractType.toLowerCase() : "";
  const identity = buildDealIdentity(
    state.structuredFacts ?? state.plan?.structuredFacts,
    state.plan?.documentType,
    state.request?.rawInstructions
  );

  if (docType.includes("nda") || ndaType || (contractType.includes("nda") && !docType.includes("dpa"))) {
    if (ndaType.includes("contractor") || contractType.includes("contractor")) {
      return "INDEPENDENT CONTRACTOR NON-DISCLOSURE AGREEMENT";
    }
    if (ndaType.includes("employee") || ndaType.includes("piia") || contractType.includes("employee")) {
      return "EMPLOYEE NON-DISCLOSURE AGREEMENT";
    }
    if (ndaType.includes("one-way") || ndaType.includes("unilateral")) {
      return "NON-DISCLOSURE AGREEMENT";
    }
    if (identity?.isMutual || ndaType.includes("mutual")) {
      return "MUTUAL NON-DISCLOSURE AGREEMENT";
    }
    return "NON-DISCLOSURE AGREEMENT";
  }

  if (docType.includes("dpa") || docType.includes("data processing") || contractType.includes("dpa")) {
    const isDpdpa = Boolean(
      facts.privacyRegime === "DPDPA" ||
      (typeof facts.governingLaw === "string" && facts.governingLaw.toLowerCase().includes("india"))
    );
    return isDpdpa ? "DATA PROTECTION AGREEMENT (DPDPA)" : "DATA PROCESSING AGREEMENT";
  }

  if (docType.includes("msa") || contractType.includes("msa")) return "MASTER SERVICES AGREEMENT";
  if (docType.includes("saas") || contractType.includes("saas")) return "SAAS SUBSCRIPTION AGREEMENT";
  if (docType.includes("sla") || contractType.includes("sla")) return "SERVICE LEVEL ADDENDUM";
  if (docType.includes("consultant") || docType.includes("consulting") || contractType.includes("consulting")) {
    return "CONSULTING SERVICES AGREEMENT";
  }
  return "AGREEMENT";
}

function formatPartyPreambleDetails(
  name: string,
  role: string,
  facts: Record<string, unknown>,
  side: "A" | "B",
  isMutual: boolean = false
): string {
  const isFiduciary = role.toLowerCase().includes("fiduciary");
  const isProcessor = role.toLowerCase().includes("processor");

  const cin =
    side === "A"
      ? (isFiduciary ? facts.dataFiduciaryCin : facts.dataProcessorCin) ||
        facts.cinA ||
        facts.cin ||
        facts.partyACin ||
        facts.registrationNumberA
      : (isProcessor ? facts.dataProcessorCin : facts.dataFiduciaryCin) ||
        facts.cinB ||
        facts.partyBCin ||
        facts.registrationNumberB;

  const address =
    side === "A"
      ? (isFiduciary ? facts.dataFiduciaryAddress : facts.dataProcessorAddress) ||
        facts.partyAAddress ||
        facts.addressA ||
        facts.clientAddress ||
        facts.firstCompanyAddress ||
        facts.disclosingPartyAddress ||
        facts.party1Address ||
        facts.registeredAddress ||
        facts.address
      : (isProcessor ? facts.dataProcessorAddress : facts.dataFiduciaryAddress) ||
        facts.partyBAddress ||
        facts.addressB ||
        facts.contractorAddress ||
        facts.secondCompanyAddress ||
        facts.receivingPartyAddress ||
        facts.party2Address;

  const details: string[] = [name];
  if (address) {
    details.push(`having its registered office at ${address}`);
  }
  if (cin) {
    details.push(`(Registration/CIN: ${cin})`);
  }
  if (
    !isMutual &&
    role &&
    role !== "Party A" &&
    role !== "Party B" &&
    role.toLowerCase() !== name.toLowerCase()
  ) {
    details.push(`(the "${role}")`);
  }
  return details.join(", ");
}

function buildPreamble(state: DraftState): string {
  const identity = buildDealIdentity(
    state.structuredFacts ?? state.plan?.structuredFacts,
    state.plan?.documentType,
    state.request?.rawInstructions
  );
  const facts = (state.structuredFacts ?? state.plan?.structuredFacts ?? {}) as Record<string, unknown>;
  const date =
    identity?.effectiveDate ||
    (typeof state.structuredFacts?.effectiveDate === "string"
      ? state.structuredFacts.effectiveDate
      : "the date of last signature");
  if (!identity) {
    return `This Agreement is entered into as of ${date} (the "Effective Date") between the parties identified herein.`;
  }

  const isMutual = Boolean(identity.isMutual);
  const partyADetails = formatPartyPreambleDetails(identity.partyA, identity.roleA, facts, "A", isMutual);
  const partyBDetails = formatPartyPreambleDetails(identity.partyB, identity.roleB, facts, "B", isMutual);

  const hasOfficeOrCin =
    partyADetails.includes("registered office") ||
    partyBDetails.includes("registered office") ||
    partyADetails.includes("Registration/CIN") ||
    partyBDetails.includes("Registration/CIN");

  if (isMutual) {
    if (hasOfficeOrCin) {
      return `This Mutual Non-Disclosure Agreement is entered into as of ${date} (the "Effective Date"), by and between:\n\n1. ${partyADetails}; and\n\n2. ${partyBDetails},\n\n(each a "Party" and collectively the "Parties").`;
    }
    return `This Mutual Non-Disclosure Agreement is entered into as of ${date} (the "Effective Date") by and between ${identity.partyA} and ${identity.partyB} (each a "Party" and collectively the "Parties").`;
  }

  if (hasOfficeOrCin) {
    return `This Agreement is entered into as of ${date} (the "Effective Date"), by and between:\n\n1. ${partyADetails}; and\n\n2. ${partyBDetails}.`;
  }

  return `This Agreement is entered into as of ${date} (the "Effective Date") between ${identity.partyA} (the "${identity.roleA}") and ${identity.partyB} (the "${identity.roleB}").`;
}

function buildSignatureBlock(state: DraftState): string {
  const identity = buildDealIdentity(
    state.structuredFacts ?? state.plan?.structuredFacts,
    state.plan?.documentType,
    state.request?.rawInstructions
  );
  const a = identity?.partyA || "Party A";
  const b = identity?.partyB || "Party B";
  const isMutual = Boolean(identity?.isMutual);

  const isGenericOrForbiddenRole = (r: string) =>
    !r ||
    r === "Party A" ||
    r === "Party B" ||
    (isMutual &&
      (r.toLowerCase().includes("client") ||
        r.toLowerCase().includes("contractor") ||
        r.toLowerCase().includes("employee")));

  const roleA = identity?.roleA && !isGenericOrForbiddenRole(identity.roleA) ? ` (${identity.roleA})` : "";
  const roleB = identity?.roleB && !isGenericOrForbiddenRole(identity.roleB) ? ` (${identity.roleB})` : "";

  const facts = (state.structuredFacts ?? state.plan?.structuredFacts ?? {}) as Record<string, unknown>;
  let signerA: SignerRecord = {};
  let signerB: SignerRecord = {};

  if (facts.signatories || facts.signers || facts.authorizedsignatories) {
    const rawSigners = String(facts.signatories || facts.signers || facts.authorizedsignatories);
    const parsed = parseSignatoriesFromText(rawSigners);
    if (parsed.partyA) signerA = { ...parsed.partyA };
    if (parsed.partyB) signerB = { ...parsed.partyB };
  }

  // Individual fields override/supplement
  if (facts.partyASignerName) signerA.name = String(facts.partyASignerName);
  if (facts.partyASignerTitle) signerA.title = String(facts.partyASignerTitle);
  if (facts.partyAPlace) signerA.place = String(facts.partyAPlace);
  if (facts.partyADate) signerA.date = String(facts.partyADate);

  if (facts.partyBSignerName) signerB.name = String(facts.partyBSignerName);
  if (facts.partyBSignerTitle) signerB.title = String(facts.partyBSignerTitle);
  if (facts.partyBPlace) signerB.place = String(facts.partyBPlace);
  if (facts.partyBDate) signerB.date = String(facts.partyBDate);

  if (facts.dataFiduciarySignerName && !signerA.name) signerA.name = String(facts.dataFiduciarySignerName);
  if (facts.dataProcessorSignerName && !signerB.name) signerB.name = String(facts.dataProcessorSignerName);

  const renderSignerLines = (signer: SignerRecord) => {
    const lines = [
      "By: _______________________________",
      `Name: ${signer.name || "____________________________"}`,
      `Title: ${signer.title || "____________________________"}`,
    ];
    if (signer.place) {
      lines.push(`Place: ${signer.place}`);
    }
    lines.push(`Date: ${signer.date || "____________________________"}`);
    return lines;
  };

  return [
    "## Signature Block",
    "",
    `IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.`,
    "",
    `**${a}${roleA}**`,
    "",
    ...renderSignerLines(signerA),
    "",
    `**${b}${roleB}**`,
    "",
    ...renderSignerLines(signerB),
  ].join("\n");
}

/**
 * Assemble one coherent legal instrument from drafted sections + exhibits.
 */
export async function assembleDocument(state: DraftState): Promise<DraftState> {
  const sections = state.draft?.sections ?? [];
  const orderedUnits =
    state.plan?.workUnits.filter((u) => u.kind === "section") ?? [];

  const mapped = orderedUnits
    .map((u) => sections.find((s) => s.workUnitId === u.id || s.id === u.id))
    .filter((s): s is DraftSection => Boolean(s));

  const ordered: DraftSection[] = mapped.length > 0 ? mapped : sections;

  const idToNumber = new Map<string, string>();
  const numberedMeta: Array<{ number: string; title: string; workUnitId: string }> = [];
  const seenHeadings = new Set<string>();

  const resolvedSections: DraftSection[] = [];
  ordered.forEach((s, i) => {
    const num = String(i + 1);
    idToNumber.set(s.workUnitId ?? s.id, num);
    const { heading: bodyHeading, rest } = stripMarkdownHeading(s.body);
    const title =
      s.heading ||
      bodyHeading ||
      orderedUnits.find((u) => u.id === s.workUnitId)?.heading ||
      `Section ${num}`;
    const headingKey = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seenHeadings.has(headingKey)) {
      // Duplicate heading — skip body entirely.
      return;
    }
    seenHeadings.add(headingKey);
    numberedMeta.push({ number: num, title, workUnitId: s.workUnitId ?? s.id });

    let body = stripLeadingPreamble(rest || s.body);
    body = dedupeWhereas(body);
    body = body.replace(/\n+\*\*\d+\.?\s*$/g, "").trim();
    const numberedHeading = `## ${num}. ${title}`;
    resolvedSections.push({
      ...s,
      heading: title,
      body: `${numberedHeading}\n\n${body}`.trim(),
    });
  });

  const resolveAnchors = (text: string): string =>
    text
      .replace(/\[\[SEC:([^\]]+)\]\]/g, (_m, id: string) => {
        const n = idToNumber.get(id);
        return n ? `Section ${n}` : `the referenced section`;
      })
      .replace(
        /\bthe Definitions section\b/gi,
        () => {
          const n = idToNumber.get("sec-definitions");
          return n ? `Section ${n} (Definitions)` : "the Definitions section";
        }
      );

  const finalSections = resolvedSections.map((s) => ({
    ...s,
    body: resolveAnchors(s.body),
  }));

  const exhibitSpecs =
    state.draftingContext?.exhibitSpecs ??
    (state.exhibits ?? []).map((e, i) => ({
      id: e.workUnitId,
      letter: String.fromCharCode(65 + i),
      title: e.title,
      kind: "schedule" as const,
      requiresFullText: false,
      parentSectionId: "sec-misc",
    }));

  const exhibitBlocks = exhibitSpecs.map((spec) => {
    const drafted = (state.exhibits ?? []).find((e) => e.workUnitId === spec.id);
    const letter = spec.letter || "A";
    const title = spec.title || drafted?.title || spec.id;
    const body = resolveAnchors(drafted?.body ?? "");
    // Avoid double title if body already starts with #
    const { rest } = stripMarkdownHeading(body);
    return `## Schedule ${letter} — ${title}\n\n${rest || body}`.trim();
  });

  const title = buildTitle(state);
  const preamble = buildPreamble(state);
  const signature = buildSignatureBlock(state);

  const formattedDocument = [
    `# ${title}`,
    "",
    preamble,
    "",
    ...finalSections.map((s) => s.body),
    ...exhibitBlocks,
    "",
    signature,
  ]
    .filter((p, i, arr) => !(p === "" && arr[i - 1] === ""))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let next: DraftState = {
    ...state,
    draft: {
      rawOutput: formattedDocument,
      formattedDocument,
      sections: finalSections,
      version: (state.draft?.version ?? 0) + 1,
      parentVersionId: state.draft?.parentVersionId,
    },
  };

  const check = runAssemblyCheck(next);
  if (!check.ok) {
    console.warn(
      `[assembleDocument] assembly-check issues: ${check.issues.join(" | ")}`
    );
    next = {
      ...next,
      metadata: {
        ...next.metadata,
        assemblyCheck: check,
      },
    };
  } else {
    console.log("[assembleDocument] assembly-check passed");
  }

  return next;
}
