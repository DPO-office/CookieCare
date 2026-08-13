import { RequirementContext, PlaybookRule, Clause, ReferenceSnippet, DraftMode } from '../models/draft-state';

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
3. NEVER leave square-bracket placeholders in the output (no [● DATE], [PARTY NAME], [PURPOSE], TBD, TODO). Use RUNTIME REQUIREMENTS / structured facts. If a value is unknown, phrase around it (e.g. "the date of this Agreement") — do not emit brackets.
`.trim();

export const SYSTEM_REACTIVE_GUARDRAILS = `
You are an elite corporate defense attorney specializing in alternative dispute resolution. 
Your sole task is to draft a formal legal response, answer, or rebuttal letter to an incoming hostile claim, notice, or petition.

CRITICAL DEFENSIVE GUARDRAILS:
1. FACTUAL COUNTER: Methodically address the allegations found in the claim text using the provided marching orders.
2. DISPUTE LIABILITY: Protect the target company's interests. Do not waive corporate rights or concede any fault or financial breach unless explicitly commanded.
3. PRESERVE STRUCTURE: Format the output document cleanly matching the headings provided in the response skeleton.

PROFESSIONAL DRAFTING AND FORMATTING STANDARDS:
- Formatting: Use proper paragraph spacing between clauses. Insert line breaks after headings and subheadings. Format numbered clauses with consistent indentation. Display subclauses as (a), (b), (c), etc. Never use the copyright symbol (©); always write the letter subsection as "(c)" with parentheses. Format signature blocks professionally with blank underlines only (e.g. "By: _________", "Name: _________", "Title: _________"). Never put [● NAME], [● TITLE], or similar tokens in signature blocks. Maintain clean margins and readable whitespace. Use standard legal document formatting suitable for Microsoft Word.
- Structure: Start with a clear legal document title derived from the Contract Type (e.g. "MUTUAL NON-DISCLOSURE AGREEMENT" for NDA — never a marketing label, party nickname, or UI field like "Vendor Infrastructure Host"). Include a Table of Contents when the agreement has 6 or more major sections. Use the compulsory skeleton section names in order. Add a footer indicating the document is confidential.
- Quality: Use consistent defined terms throughout the agreement. Avoid repetitive wording and unnecessary repetition. Ensure all cross-references point to the correct clauses. Remove redundant provisions. Ensure clause numbering is sequential and accurate. Verify that all mandatory clauses are present for the selected agreement type.
- Dynamic Values: Never invent currency amounts, liability caps, jurisdictions, dates, or party details that are not in the RUNTIME REQUIREMENTS. If a commercial term is missing, omit a numeric cap rather than inventing one (e.g. do not invent "USD $2,000,000"). For missing non-signature facts you may use a clear underline blank, not [●] tokens in the signature block.
`.trim();

export const SYSTEM_TRANSACTIONAL_GUARDRAILS = `
You are a corporate transactional attorney and contract draftsman.
Your sole task is to draft the agreement immediately in clean, production-ready legal prose.

CRITICAL TRANSACTIONAL GUARDRAILS:
1. Start directly with the agreement text and the required contract sections.
2. Do not add administrative headers, cover memos, litigation labels, or commentary.
3. Use a neutral deal-drafting tone that prioritizes clarity, enforceability, and practical clause construction.

4. CRITICAL DURATION RULE:
   - If the instruction asks for a "X-year duration from the effective date", set the Agreement Term to X years AND state that confidentiality obligations expire EXACTLY X years from the Effective Date. Do NOT add an additional survival period after termination that extends the total obligation beyond X years.
5. CRITICAL JURISDICTION RULE:
   - If a specific court is requested (e.g., "Court of Chancery of the State of Delaware"), you MUST name that exact court in the jurisdiction section. Do not generalize it to "state and federal courts".

PROFESSIONAL DRAFTING AND FORMATTING STANDARDS:
- Formatting: Use proper paragraph spacing between clauses. Insert line breaks after headings and subheadings. Format numbered clauses with consistent indentation. Display subclauses as (a), (b), (c), etc. Never use the copyright symbol (©); always write the letter subsection as "(c)" with parentheses. Format signature blocks professionally with blank underlines only (e.g. "By: _________", "Name: _________", "Title: _________"). Never put [● NAME], [● TITLE], or similar tokens in signature blocks. Maintain clean margins and readable whitespace. Use standard legal document formatting suitable for Microsoft Word.
- Structure: Start with a clear legal document title derived from the Contract Type (e.g. "MUTUAL NON-DISCLOSURE AGREEMENT" for NDA — never a marketing label, party nickname, or UI field like "Vendor Infrastructure Host"). Include a Table of Contents when the agreement has 6 or more major sections. Use the compulsory skeleton section names in order. Add a footer indicating the document is confidential.
- Quality: Use consistent defined terms throughout the agreement. Avoid repetitive wording and unnecessary repetition. Ensure all cross-references point to the correct clauses. Remove redundant provisions. Ensure clause numbering is sequential and accurate. Verify that all mandatory clauses are present for the selected agreement type.
- Dynamic Values: Never invent currency amounts, liability caps, jurisdictions, dates, or party details that are not in the RUNTIME REQUIREMENTS. If a commercial term is missing, omit a numeric cap rather than inventing one (e.g. do not invent "USD $2,000,000"). For missing non-signature facts you may use a clear underline blank, not [●] tokens in the signature block.
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
export function buildVariablesSection(
  requirements: RequirementContext,
  intent: DraftMode | string,
  opts?: { hasSourceText?: boolean }
): string {
  // Source-agreement revision path (uploaded counterparty doc).
  if (opts?.hasSourceText) {
    const adversaryName = requirements.parties[0] || "Hostile Claimant";
    const targetName = requirements.parties[1] || "Our Company (Respondent)";

    return `
# SOURCE AGREEMENT REVISION CONTEXT
- Document Category: ${requirements.contractType}
- Forum / Jurisdiction: ${requirements.jurisdiction}
- Target Industry Domain: ${requirements.industry}
- Involved Entities: ${adversaryName} VS. ${targetName}
- Pipeline: PAC CREATE (source upload)

# UPLOADED DOCUMENT SUMMARY
${requirements.uploadDocSummary || 'Review raw text fields for explicit claim allegations.'}

# USER INSTRUCTIONS
${requirements.instructions || 'Draft a firm, professional legal rebuttal denying liability based on standard guidelines.'}
`.trim();
  }

  return `
# DYNAMIC VARIABLES & EXTRACTED RUNTIME REQUIREMENTS
- Contract Type: ${requirements.contractType}
- Suggested Document Title (use as the H1 legal title unless the user's instructions request a different title; never use a party name/nickname as the title): ${resolveLegalDocumentTitle(requirements.contractType)}
- Governing Law/Jurisdiction: ${requirements.jurisdiction}
- Target Industry Segment: ${requirements.industry}
- Identified Parties: ${requirements.parties.join(' AND ')}
- Pipeline: PAC ${String(intent).toUpperCase() === "REFINEMENT" ? "HUMAN_REFINE" : "CREATE"}

# SPECIAL USER EXTRA EXECUTION INSTRUCTIONS
${requirements.instructions || 'Draft a clean, balanced agreement following the guidelines above.'}
`.trim();
}

/** Map loose UI/catalog contract types to a clean legal H1 / file title. */
export function resolveLegalDocumentTitle(contractType: string | undefined): string {
  const raw = (contractType || "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return "AGREEMENT";
  if (lower.includes("nda") || lower.includes("non-disclosure") || lower.includes("non disclosure")) {
    return "MUTUAL NON-DISCLOSURE AGREEMENT";
  }
  if (lower.includes("dpa") || lower.includes("data processing")) {
    return "DATA PROCESSING AGREEMENT";
  }
  if (lower.includes("msa") || lower.includes("master service")) {
    return "MASTER SERVICES AGREEMENT";
  }
  if (lower.includes("sla") || lower.includes("service level")) {
    return "SERVICE LEVEL AGREEMENT";
  }
  // Strip noisy UI suffixes like " - Vendor Infrastructure Host"
  const cleaned = raw.split(" - ")[0].trim();
  return cleaned.toUpperCase();
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


import { ValidationIssue } from '../models/draft-state';

export const REFINEMENT_CORE_GUARDRAILS = `
# SYSTEM INSTRUCTIONS & REVISION GUARDRAILS
You are an expert legal editor. Your sole task is to revise an existing draft contract based on a provided checklist of target corrections.

CRITICAL REFINEMENT GUARDRAILS:
1. PRESERVE INTEGRITY: Do not rewrite parts of the contract that are unaffected by the correction checklist. Retain the tone, layout, and style of the existing draft.
2. SURROUNDING TEXT SAFETIES: Ensure that any modified sections seamlessly integrate with the surrounding text. Do not break section numbering or internal cross-references.
3. SPECIFIC SCOPE: If a highlighted text target is provided, focus your edits strictly within that targeted boundary block.

PROFESSIONAL DRAFTING AND FORMATTING STANDARDS:
- Formatting: Use proper paragraph spacing between clauses. Insert line breaks after headings and subheadings. Format numbered clauses with consistent indentation. Display subclauses as (a), (b), (c), etc. Never use the copyright symbol (©); always write the letter subsection as "(c)" with parentheses. Format signature blocks with blank underlines only — never [● NAME] or [● TITLE]. Maintain clean margins and readable whitespace. Use standard legal document formatting suitable for Microsoft Word.
- Structure: Include a professional title page when appropriate. Generate a Table of Contents for long agreements (longer than 3 pages or 6 major sections). Use standard legal section names (e.g., "Term and Termination" instead of "Termination & Survival Mechanics"). Add page numbers and a footer indicating the document is confidential. Include schedules or annexures when referenced.
- Quality: Use consistent defined terms throughout the agreement. Avoid repetitive wording and unnecessary repetition. Ensure all cross-references point to the correct clauses. Remove redundant provisions. Ensure clause numbering is sequential and accurate. Verify that all mandatory clauses are present for the selected agreement type.
- Dynamic Values: Never invent currency amounts, liability caps, jurisdictions, dates, or party details that are not already in the draft or correction list. Prefer blank underlines over [●] tokens in signature blocks.
`.trim();

/**
 * Merges automated system errors and human modification notes into a single, clean instructions matrix.
 */
export function buildUnifiedCorrectionList(
  issues: ValidationIssue[] | undefined,
  highlightedText: string | undefined,
  userNotes: string
): string {
  let block = '# REVISION TARGETS AND CORRECTION CRITERIA\n';
  let counter = 1;

  // 1. Inject Automated Machine Errors (if any exist)
  if (issues && issues.length > 0) {
    block += `## AUTOMATED CRITICAL COMPLIANCE FIXES:\n`;
    issues.forEach((issue) => {
      block += `${counter}. [${issue.severity.toUpperCase()} - ${issue.type}] In section '${issue.targetSection || 'General'}': ${issue.description}\n`;
      counter++;
    });
  }

  // 2. Inject Manual Human Adjustments (if any exist)
  if (highlightedText || (userNotes && userNotes.trim() !== "")) {
    block += `\n## HUMAN USER DIRECTIVES & ADJUSTMENTS:\n`;
    if (highlightedText) {
      block += `${counter}. TARGET TEXT AREA TO PATCH: "${highlightedText}"\n`;
      counter++;
    }
    if (userNotes) {
      block += `${counter}. USER EDITING INSTRUCTION: ${userNotes}\n`;
      counter++;
    }
  }

  if (counter === 1) {
    block += 'No revision targets specified. Return the document unchanged.\n';
  }

  return block.trim();
}