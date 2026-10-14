import { BlockSchema, CoverageSchema, ProvisionSchema, type Provision } from "./source.js";
import { RequirementSchema } from "./requirement.js";

export interface SourceValidationIssue { code: string; recordId: string; message: string }

function normalizeReconstruction(text: string, choices: Provision["normalization"]): string {
  let normalized = text;
  if (choices.includes("soft_hyphen")) normalized = normalized.replace(/\u00ad/g, "");
  if (choices.includes("line_end_hyphen")) normalized = normalized.replace(/(\p{L})-\r?\n(?=\p{L})/gu, "$1");
  if (choices.includes("line_breaks")) normalized = normalized.replace(/\r?\n/g, " ");
  if (choices.includes("whitespace")) normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

/** Cross-record contract checks; database enforcement and authorization arrive in Phase 1. */
export function validateSourceLinks(input: {
  blocks: unknown[]; provisions: unknown[]; requirements: unknown[]; coverage: unknown;
}): SourceValidationIssue[] {
  const blocks = input.blocks.map(block => BlockSchema.parse(block));
  const provisions = input.provisions.map(provision => ProvisionSchema.parse(provision));
  const requirements = input.requirements.map(requirement => RequirementSchema.parse(requirement));
  const coverage = CoverageSchema.parse(input.coverage);
  const issues: SourceValidationIssue[] = [];
  const add = (code: string, recordId: string, message: string) => issues.push({ code, recordId, message });
  const blocksById = new Map(blocks.map(b => [b.id, b]));
  const provisionsById = new Map(provisions.map(p => [p.id, p]));
  if (blocksById.size !== blocks.length) add("duplicate_block", coverage.sourceVersionId, "Block identities must be unique within an extraction");
  if (provisionsById.size !== provisions.length) add("duplicate_provision", coverage.sourceVersionId, "One reconstruction artifact must contain one revision per provision");
  const ruleIds = requirements.map(r => r.ruleId);
  if (new Set(ruleIds).size !== ruleIds.length) add("duplicate_rule", coverage.sourceVersionId, "One draft artifact must contain one revision per stable rule");
  for (const block of blocks) {
    if (block.sourceVersionId !== coverage.sourceVersionId) add("wrong_source_version", block.id, "Raw block is outside the coverage source version");
    if (!coverage.pages.some(p => p.page === block.page && ["extracted", "needs_review"].includes(p.status))) {
      add("unaccounted_page", block.id, "Block page is absent or inconsistent in the independent inventory");
    }
  }
  if (coverage.extractionStatus === "complete") {
    for (const page of coverage.pages) {
      if (page.status === "extracted" && !blocks.some(b => b.page === page.page)) {
        add("missing_extraction_blocks", coverage.sourceVersionId, `Extracted page ${page.page} has no retained blocks`);
      }
    }
  }
  for (const provision of provisions) {
    if (provision.sourceVersionId !== coverage.sourceVersionId) add("wrong_source_version", provision.id, "Provision is outside the coverage source version");
    if (provision.parentId && !provisionsById.has(provision.parentId)) add("missing_parent", provision.id, "Parent opening is unavailable");
    const seen = new Set<string>([provision.id]);
    let current: Provision | undefined = provision;
    while (current?.parentId) {
      if (seen.has(current.parentId)) { add("parent_cycle", provision.id, "Provision hierarchy contains a cycle"); break; }
      seen.add(current.parentId);
      current = provisionsById.get(current.parentId);
    }
    const retainedFragments: string[] = [];
    let previous: { order: number; end: number } | undefined;
    for (const fragment of provision.fragments) {
      const block = blocksById.get(fragment.blockId);
      if (!block || block.sourceVersionId !== provision.sourceVersionId || fragment.end > block.text.length) {
        add("invalid_fragment", provision.id, `Fragment does not address retained source text: ${fragment.blockId}`);
        continue;
      }
      if (previous && (block.readingOrder < previous.order || (block.readingOrder === previous.order && fragment.start < previous.end))) {
        add("fragment_order", provision.id, "Source fragments are reordered or overlap");
      }
      previous = { order: block.readingOrder, end: fragment.end };
      retainedFragments.push(block.text.slice(fragment.start, fragment.end));
    }
    if (retainedFragments.length === provision.fragments.length &&
      normalizeReconstruction(retainedFragments.join(" "), provision.normalization) !== provision.text) {
      add("source_text_mismatch", provision.id, "Provision wording differs from its retained fragments and declared normalization");
    }
  }
  for (const requirement of requirements) {
    if (!requirement.sources.some(s => s.role === "target")) add("missing_target", requirement.id, "Requirement has no target provision");
    for (const source of requirement.sources) {
      const provision = provisionsById.get(source.provision.id);
      if (!provision || provision.revision !== source.provision.revision ||
        provision.text.slice(source.start, source.end) !== source.exactQuote || source.end > provision.text.length) {
        add("unsupported_quote", requirement.id, "Source revision, quote or offsets do not match retained provision text");
      }
    }
  }
  const dispositions = new Map(coverage.blocks.map(b => [b.blockId, b]));
  for (const block of blocks) {
    const disposition = dispositions.get(block.id);
    if (!disposition) { add("unaccounted_block", block.id, "Every raw block needs a disposition"); continue; }
    const owners = provisions.filter(p => p.fragments.some(f => f.blockId === block.id));
    if (disposition.status === "assigned") {
      const expected = new Set(owners.map(p => p.id));
      if (new Set(disposition.provisionIds).size !== disposition.provisionIds.length || disposition.provisionIds.length !== expected.size ||
        disposition.provisionIds.some(id => !expected.has(id))) add("assignment_mismatch", block.id, "Disposition and provision fragments disagree");
      if (coverage.extractionStatus === "complete") {
        const spans = owners.flatMap(p => p.fragments.filter(f => f.blockId === block.id)).sort((a, b) => a.start - b.start);
        let end = 0;
        let omitted = "";
        for (const span of spans) {
          if (span.start > end) omitted += block.text.slice(end, span.start);
          end = Math.max(end, span.end);
        }
        omitted += block.text.slice(end);
        if (omitted.trim()) add("unassigned_text", block.id, "Complete coverage omits substantive characters from an assigned raw block");
      }
    } else if (owners.length) add("assignment_mismatch", block.id, "Classified or unresolved block is also assigned to a provision");
  }
  for (const disposition of coverage.blocks) {
    if (!blocksById.has(disposition.blockId)) add("unknown_block", disposition.blockId, "Disposition references an absent raw block");
  }
  for (const id of coverage.reviewedProvisionIds) {
    if (!provisionsById.has(id)) add("unknown_review_scope", id, "Reviewed scope references an absent provision");
  }
  return issues;
}
