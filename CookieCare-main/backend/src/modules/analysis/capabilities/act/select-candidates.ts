import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";
import type { GeminiThinkingLevel } from "../../../../llm/config/model-specs.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  EvidenceRelationshipScope,
  EvidenceScopeConstraint,
  SharedEvidenceItem,
} from "../../models/evidence-package.js";
import type { SegmentedDocument } from "../../models/document-workspace.js";
import { profileThinkingLevel } from "../../utils/profile-thinking.js";
import { groupDocumentSections } from "./locate-evidence.js";
import {
  SELECT_CANDIDATES_SYSTEM_PROMPT,
  buildSelectCandidatesSchema,
  buildSelectCandidatesUserPrompt,
  type SelectCandidatesRequirement,
} from "../../prompts/select-candidates.js";

/** Skip bare headings / titles with no operative body. */
const SECTION_MIN_CHARS = 40;
/** Per-section text cap fed to the selector — enough to contain the operative sentence. */
const SECTION_MAX_CHARS = 1500;
/** Hard ceiling on sections and total prompt text, so a huge document can't blow the context. */
const MAX_SECTIONS = 260;
const TOTAL_CHAR_BUDGET = 150_000;

function normalizedRelationshipText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Infer only explicit party relationships. Unknown text stays `unspecified` so
 * generic compliance retrieval does not discard a valid clause merely because
 * its heading is terse. Explicitly different relationship sections can then be
 * excluded before VERIFY.
 */
export function inferEvidenceRelationshipScope(input: {
  contextHeading?: string;
  title?: string;
  structuralPath?: string;
  text?: string;
}): EvidenceRelationshipScope {
  const heading = normalizedRelationshipText(
    [input.contextHeading, input.title, input.structuralPath].filter(Boolean).join(" ")
  );
  const body = normalizedRelationshipText((input.text ?? "").slice(0, 1_200));

  const explicitScope = (text: string): EvidenceRelationshipScope | undefined => {
    if (/\bcontroller (?:to|and) controller\b/.test(text)) {
      return "controller_to_controller";
    }
    if (/\bcontroller (?:to|and) processor\b/.test(text)) {
      return "controller_to_processor";
    }
    if (/\bprocessor (?:to|and) processor\b/.test(text)) {
      return "processor_to_processor";
    }
    return undefined;
  };

  const headingScope = explicitScope(heading);
  if (headingScope) return headingScope;

  if (
    /\bindependent controllers?\b/.test(body) ||
    /\beach party\b.{0,180}\b(?:is|acts as|remains) (?:an? )?controller\b/.test(body) ||
    /\bfor (?:each party s|its) own business purposes\b/.test(body)
  ) {
    return "controller_to_controller";
  }
  if (
    /\bprocess(?:es|ing)?\b.{0,100}\bon behalf of\b/.test(body) ||
    /\b(?:is|acts as) (?:an? )?controller\b.{0,240}\b(?:is|acts as) (?:an? )?processor\b/.test(
      body
    ) ||
    /\b(?:is|acts as) (?:an? )?processor\b.{0,240}\b(?:is|acts as) (?:an? )?controller\b/.test(
      body
    )
  ) {
    return "controller_to_processor";
  }
  return "unspecified";
}

/** Keep unknown sections, but reject sections explicitly outside the authored scope. */
export function filterCandidatesByEvidenceScope(
  pool: SharedEvidenceItem[],
  scope: EvidenceScopeConstraint | undefined
): SharedEvidenceItem[] {
  const allowed = new Set(scope?.relationshipScopes ?? []);
  if (allowed.size === 0) return pool;
  return pool.filter(
    (item) =>
      !item.relationshipScope ||
      item.relationshipScope === "unspecified" ||
      allowed.has(item.relationshipScope)
  );
}

/**
 * Candidate pool built from the document's OWN logical sections (every
 * numbered clause / addendum block via groupDocumentSections), NOT the
 * clause-type-dictionary extraction. This is the fix for the Gate 1 leak: a
 * passage that matches no clause-type dictionary — an "only on documented
 * instructions" line buried in a jurisdiction addendum — is a section like any
 * other here, so the LLM selector can actually see and pick it. The
 * deterministic type extraction remains only for the flag-off fallback path.
 */
export function buildSectionCandidates(doc: SegmentedDocument): SharedEvidenceItem[] {
  const sections = groupDocumentSections(doc);
  const items: SharedEvidenceItem[] = [];
  let total = 0;
  let i = 0;
  for (const s of sections) {
    const text = s.text.trim();
    if (text.length < SECTION_MIN_CHARS) continue;
    const capped = text.length > SECTION_MAX_CHARS ? text.slice(0, SECTION_MAX_CHARS) : text;
    if (total + capped.length > TOTAL_CHAR_BUDGET) break;
    total += capped.length;
    i += 1;
    const label = s.title?.trim() ? s.title.trim().slice(0, 48) : "section";
    items.push({
      ref: `S${i}`,
      sourceDocId: doc.docId,
      clauseType: label,
      contextHeading: s.contextHeading,
      relationshipScope: inferEvidenceRelationshipScope({
        contextHeading: s.contextHeading,
        title: s.title,
        structuralPath: s.headingPath,
        text,
      }),
      quotedText: capped,
      structuralPath: s.headingPath,
      charRange: [s.startOffset, s.endOffset],
      truncated: capped.length < text.length,
    });
    if (items.length >= MAX_SECTIONS) break;
  }
  return items;
}

export interface SelectCandidatesInput {
  requirements: SelectCandidatesRequirement[];
  pool: SharedEvidenceItem[];
  maxPerRequirement: number;
  state: AnalysisState;
}

/** Char budget for each candidate snippet shown to the selector. Large enough
 * to show a whole logical section, so the operative sentence (which may sit
 * deep in a clause) is visible to selection rather than truncated away. */
const SNIPPET_CHARS = 1500;

const THINKING_RANK: Record<GeminiThinkingLevel, number> = {
  minimal: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Lite mode pins STRUCTURAL_JSON to "low" — fine for a single well-defined
 * lookup, but this call asks for N independent semantic matches (paraphrased
 * business language against a large, undifferentiated clause pool) in one
 * pass. At low effort the model does the few obvious matches properly and
 * shallow-passes the rest to an empty list rather than doing the harder
 * conceptual mapping for each one — confirmed on a real run where 11 of 14
 * requirements came back empty despite the document plainly addressing
 * several of them. This is a rigor cut hiding inside what Lite mode's
 * design intends only as a scope cut ("budget as scope, never as rigor" —
 * see analysis-profile.ts) — so it's floored at "medium" regardless of
 * profile, not lifted for every STRUCTURAL_JSON caller.
 */
function selectionThinkingLevel(profileLevel: GeminiThinkingLevel | undefined): GeminiThinkingLevel {
  const floor: GeminiThinkingLevel = "medium";
  if (!profileLevel) return floor;
  return THINKING_RANK[profileLevel] >= THINKING_RANK[floor] ? profileLevel : floor;
}

interface RawSelection {
  requirementId: string;
  refs: string[];
}

/**
 * ONE batched LLM call per package that replaces keyword/embedding candidate
 * ranking (extract_shared_evidence's regex scorer + retrieve-candidates' RRF)
 * with a semantic selection: given every clause in the pool and every
 * requirement's proof standard, return the clause refs worth verifying per
 * requirement. The model understands "this states the subject matter" vs
 * "this merely defines the words" in a way keyword/vector scoring cannot.
 *
 * Returns a map requirementId -> ordered SharedEvidenceItem[] (best first),
 * restricted to real pool refs. Never throws: on any failure returns null so
 * the caller falls back to the existing lexical/hybrid retriever.
 */
export async function selectCandidates(
  input: SelectCandidatesInput
): Promise<Map<string, SharedEvidenceItem[]> | null> {
  const nonEmpty = input.pool.filter((i) => i.quotedText.trim().length > 0);
  if (nonEmpty.length === 0 || input.requirements.length === 0) return null;

  const byRef = new Map(nonEmpty.map((i) => [i.ref, i]));
  const clauses = nonEmpty.map((i) => ({
    ref: i.ref,
    clauseType: i.clauseType,
    contextHeading: i.contextHeading,
    structuralPath: i.structuralPath,
    snippet: i.quotedText.replace(/\s+/g, " ").trim().slice(0, SNIPPET_CHARS),
  }));

  const prompt = buildSelectCandidatesUserPrompt({
    requirements: input.requirements,
    clauses,
    maxPerRequirement: input.maxPerRequirement,
  });
  const schema = buildSelectCandidatesSchema(
    input.requirements.map((r) => r.requirementId),
    nonEmpty.map((i) => i.ref)
  );

  const tracker = input.state.agent
    ? { tokensUsed: input.state.agent.tokensUsed }
    : undefined;

  let raw: RawSelection[];
  try {
    raw = await executeJsonCompletion<RawSelection[]>(
      prompt,
      SELECT_CANDIDATES_SYSTEM_PROMPT,
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      {
        tracker,
        thinkingLevel: selectionThinkingLevel(
          profileThinkingLevel(input.state, LLMTask.STRUCTURAL_JSON)
        ),
      }
    );
  } catch {
    return null;
  }
  if (input.state.agent && tracker) input.state.agent.tokensUsed = tracker.tokensUsed;
  if (!Array.isArray(raw)) return null;

  const out = new Map<string, SharedEvidenceItem[]>();
  for (const row of raw) {
    if (!row || typeof row.requirementId !== "string" || !Array.isArray(row.refs)) continue;
    const items: SharedEvidenceItem[] = [];
    const seen = new Set<string>();
    for (const ref of row.refs) {
      if (seen.has(ref)) continue;
      const item = byRef.get(ref);
      if (!item) continue; // schema enum should prevent, but never trust it
      seen.add(ref);
      items.push(item);
      if (items.length >= input.maxPerRequirement) break;
    }
    out.set(row.requirementId, items);
  }
  return out.size > 0 ? out : null;
}
