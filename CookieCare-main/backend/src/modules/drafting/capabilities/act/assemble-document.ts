import type { DraftState, DraftSection } from "../../models/draft-state.js";
import type { ExhibitSpec } from "../../models/draft-exhibits.js";
import { buildDealIdentity } from "./deal-identity.js";
import { runAssemblyCheck } from "./assembly-check.js";


function stripMarkdownHeading(body: string): { heading: string | null; rest: string } {
  const lines = body.replace(/^\uFEFF/, "").split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^#{1,3}\s+/.test(lines[i])) {
    const heading = lines[i].replace(/^#{1,3}\s+/, "").replace(/^\d+\.\s*/, "").trim();
    return { heading, rest: lines.slice(i + 1).join("\n").trim() };
  }
  return { heading: null, rest: body.trim() };
}

function stripLeadingPreamble(text: string): string {
  // Drop "This Agreement is entered into..." / WHEREAS blocks from section bodies
  // so we can emit a single canonical preamble.
  let t = text;
  t = t.replace(
    /^This (?:Data Processing )?(?:Agreement|Addendum) is entered into[^\n]*(?:\n(?!#)[^\n]*)*/i,
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
  const docType = (state.plan?.documentType || state.draftingContext?.documentType || "agreement")
    .toLowerCase();
  if (docType.includes("dpa") || docType.includes("data processing")) {
    return "DATA PROCESSING AGREEMENT";
  }
  if (docType.includes("nda")) return "MUTUAL NON-DISCLOSURE AGREEMENT";
  if (docType.includes("msa")) return "MASTER SERVICES AGREEMENT";
  return "AGREEMENT";
}

function formatPartyPreambleDetails(
  name: string,
  role: string,
  facts: Record<string, unknown>,
  side: "A" | "B"
): string {
  const isFiduciary = role.toLowerCase().includes("fiduciary");
  const isProcessor = role.toLowerCase().includes("processor");

  const cin =
    side === "A"
      ? (isFiduciary ? facts.dataFiduciaryCin : facts.dataProcessorCin) || facts.cinA || facts.cin
      : (isProcessor ? facts.dataProcessorCin : facts.dataFiduciaryCin) || facts.cinB;

  const address =
    side === "A"
      ? (isFiduciary ? facts.dataFiduciaryAddress : facts.dataProcessorAddress) || facts.addressA || facts.registeredAddress
      : (isProcessor ? facts.dataProcessorAddress : facts.dataFiduciaryAddress) || facts.addressB;

  const details: string[] = [name];
  if (address) {
    details.push(`having its registered office at ${address}`);
  }
  if (cin) {
    details.push(`(Registration/CIN: ${cin})`);
  }
  details.push(`(the "${role}")`);
  return details.join(", ");
}

function buildPreamble(state: DraftState): string {
  const identity = buildDealIdentity(
    state.structuredFacts ?? state.plan?.structuredFacts,
    state.plan?.documentType
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

  const partyADetails = formatPartyPreambleDetails(identity.partyA, identity.roleA, facts, "A");
  const partyBDetails = formatPartyPreambleDetails(identity.partyB, identity.roleB, facts, "B");

  if (
    partyADetails.includes("registered office") ||
    partyBDetails.includes("registered office") ||
    partyADetails.includes("Registration/CIN") ||
    partyBDetails.includes("Registration/CIN")
  ) {
    return `This Agreement is entered into as of ${date} (the "Effective Date"), by and between:\n\n1. ${partyADetails}; and\n\n2. ${partyBDetails}.`;
  }

  return `This Agreement is entered into as of ${date} (the "Effective Date") between ${identity.partyA} (the "${identity.roleA}") and ${identity.partyB} (the "${identity.roleB}").`;
}

function buildSignatureBlock(state: DraftState): string {
  const identity = buildDealIdentity(
    state.structuredFacts ?? state.plan?.structuredFacts,
    state.plan?.documentType
  );
  const a = identity?.partyA || "Party A";
  const b = identity?.partyB || "Party B";
  const roleA = identity?.roleA ? ` (${identity.roleA})` : "";
  const roleB = identity?.roleB ? ` (${identity.roleB})` : "";

  return [
    "## Signature Block",
    "",
    `IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.`,
    "",
    `**${a}${roleA}**`,
    "",
    "By: _______________________________",
    "Name: _____________________________",
    "Title: ____________________________",
    "Date: _____________________________",
    "",
    `**${b}${roleB}**`,
    "",
    "By: _______________________________",
    "Name: _____________________________",
    "Title: ____________________________",
    "Date: _____________________________",
  ].join("\n");
}

/**
 * Assemble one coherent legal instrument from drafted sections + exhibits.
 */
export async function assembleDocument(state: DraftState): Promise<DraftState> {
  const sections = state.draft?.sections ?? [];
  const orderedUnits =
    state.plan?.workUnits.filter((u) => u.kind === "section") ?? [];

  const ordered: DraftSection[] =
    orderedUnits
      .map((u) => sections.find((s) => s.workUnitId === u.id || s.id === u.id))
      .filter((s): s is DraftSection => Boolean(s)) ?? sections;

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
