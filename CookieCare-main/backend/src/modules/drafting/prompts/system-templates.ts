import { RequirementContext, PlaybookRule, Clause, ReferenceSnippet } from '../models/draft-state';

/**
 * Static system guardrails that don't change based on runtime data.
 * Placed at the very top to optimize for LLM prompt caching.
 */
export const SYSTEM_CORE_GUARDRAILS = `
# SYSTEM INSTRUCTIONS & OPERATIONAL GUARDRAILS
You are a precise legal drafting engine. Your task is to generate the final contract text.
You must merge the provided BASELINE TEMPLATE TEXT into the compulsory DOCUMENT SKELETON headers, while strictly enforcing the MANDATORY PLAYBOOK RULES.

CRITICAL GUARDRAILS:
1. Do not invent your own document layout. Use the headers provided in the SKELETON.
2. Adopt the phrasing, tone, and standard boilerplate from the BASELINE TEMPLATE TEXT where applicable, but override it if it conflicts with a Playbook Rule.
3. Replace all bracketed placeholders (e.g., [● DATE], [● PARTY A NAME]) using the data found in the RUNTIME REQUIREMENTS.
`.trim();

/**
 * Builds the formatted markdown block for retrieved playbook rules.
 */
export function buildPlaybookSection(rules: PlaybookRule[]): string {
  let block = '# MANDATORY CORPORATE PLAYBOOK RULES\n';
  if (rules.length === 0) {
    return block + 'No specific company compliance restrictions found.\n';
  }
  
  rules.forEach((rule) => {
    block += `- Topic: ${rule.topic}\n  * Standard Position: ${rule.standardPosition}\n  * Fallbacks: ${rule.fallbackPositions.join(' | ')}\n  * Walk-away: ${rule.walkAwayCondition}\n\n`;
  });
  return block.trim();
}

/**
 * Builds the formatted markdown block for retrieved clause options.
 */
export function buildClauseSection(clauses: Clause[]): string {
  let block = '# RETRIEVED APPROVED REFERENCE CLAUSES\n';
  if (clauses.length === 0) {
    return block + 'No custom clause library matches found.\n';
  }

  clauses.forEach((clause) => {
    block += `[Clause ID: ${clause.id} | Type: ${clause.clauseType}]\n"${clause.text}"\n\n`;
  });
  return block.trim();
}

/**
 * Builds the formatted layout checklist block from the hardcoded spine array.
 */
export function buildSkeletonSection(skeleton: string[]): string {
  let block = '# COMPULSORY DOCUMENT SKELETON STRUCTURAL SPINE\n';
  skeleton.forEach((heading, idx) => {
    block += `${idx + 1}. ${heading}\n`;
  });
  return block.trim();
}

/**
 * Builds the dynamic runtime variables and special instructions suffix.
 */
export function buildVariablesSection(requirements: RequirementContext, mode: string): string {
  return `
# DYNAMIC VARIABLES & EXTRACTED RUNTIME REQUIREMENTS
- Contract Type: ${requirements.contractType}
- Governing Law/Jurisdiction: ${requirements.jurisdiction}
- Target Industry Segment: ${requirements.industry}
- Identified Parties: ${requirements.parties.join(' AND ')}
- Operational Mode: ${mode}

# SPECIAL USER EXTRA EXECUTION INSTRUCTIONS
${requirements.instructions || 'Draft a clean, balanced agreement following the guidelines above.'}
`.trim();
}

// TODO : For historical generated drafts - really unsure about this, how it gonna work
export function buildHistoricalSection(references: ReferenceSnippet[]): string {
  let block = '# HISTORICAL DEALS & PASSED VAULT DOCUMENTS (FOR STYLISTIC ALIGNMENT)\n';
  if (!references || references.length === 0) {
    return block + 'No historical deal precedents provided for this assembly execution cycle.\n';
  }

  references.forEach((ref) => {
    block += `[Precedent Source: ${ref.documentName} | Relevancy Match Score: ${ref.score}]\n"${ref.extractedText}"\n\n`;
  });
  return block.trim();
}