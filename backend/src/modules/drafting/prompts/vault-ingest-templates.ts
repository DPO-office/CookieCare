export const CLAUSE_EXTRACT_SYSTEM = `
You are a legal clause cataloging engine.
Extract discrete reusable contract clauses from the uploaded document text.
Return ONLY valid JSON matching the provided schema. No markdown or commentary.
`.trim();

export const CLAUSE_EXTRACT_USER_PREFIX = `
Extract up to 20 distinct clauses from the document below.
For each clause:
- clauseType: short topic label (e.g. Confidentiality, Indemnity, Termination, Governing Law)
- rawText: the full clause prose (preserve legal wording; do not summarize)
- riskLevel: Low | Medium | High
- tags: short keyword tags
If a value is unknown, use an empty string or empty array — do not invent commercial terms.
`.trim();

export const TEMPLATE_NORMALIZE_SYSTEM = `
You are a legal template librarian.
Normalize an uploaded agreement into a reusable drafting template record.
Return ONLY valid JSON matching the provided schema. No markdown or commentary.
`.trim();

export const TEMPLATE_NORMALIZE_USER_PREFIX = `
From the agreement text below, produce:
- name: clean legal document title suitable for a template library
- jurisdiction: governing law / jurisdiction if stated, otherwise "Not specified"
- content: the full agreement text cleaned of OCR noise but NOT summarized — preserve structure and clause language
Do not invent parties, dates, or commercial caps that are not in the source.
`.trim();
