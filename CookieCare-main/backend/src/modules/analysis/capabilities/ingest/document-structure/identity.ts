import type { BuildDocumentGraphInput, DocumentIdentity, ParsedDocument } from "./types.js";

const ENTITY_PATTERNS: Array<[string, RegExp]> = [
  ["Salesforce", /\bsalesforce(?:\.com)?\b/i],
  ["Entrust", /\bentrust\b/i],
  ["HCL", /\bHCL(?:Tech|Software| Technologies)?\b/i],
  ["Bitrix24", /\bbitrix24\b/i],
  ["Alaio", /\balaio\b/i],
  ["Microsoft", /\bmicrosoft\b/i],
  ["Google", /\bgoogle\b/i],
  ["Amazon", /\bamazon(?: web services| aws)?\b/i],
];

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildDocumentIdentity(
  input: BuildDocumentGraphInput,
  parsed: ParsedDocument,
  contentSha256: string
): DocumentIdentity {
  const detectedTitle = parsed.blocks.find((block) => block.label === "title")?.text ??
    parsed.blocks.find((block) => block.level !== undefined || block.label === "section_header")?.text ??
    parsed.blocks.find((block) => block.text.trim().length > 0)?.text.slice(0, 180);
  const sample = `${detectedTitle ?? ""}\n${parsed.canonicalText.slice(0, 12_000)}`;
  const detectedEntities = ENTITY_PATTERNS.filter(([, pattern]) => pattern.test(sample)).map(([name]) => name);
  const expected = input.expectedIdentity?.trim();
  const reasons: string[] = [];
  let status: DocumentIdentity["status"] = "unverified";
  if (expected) {
    const expectedNormalized = normalized(expected);
    const detectedValues = [detectedTitle ?? "", ...detectedEntities].map(normalized).filter(Boolean);
    const matches = detectedValues.some((value) => value.includes(expectedNormalized) || expectedNormalized.includes(value));
    if (matches) status = "verified";
    else if (detectedEntities.length) {
      status = "mismatch";
      reasons.push(`Expected identity '${expected}' does not match detected entities: ${detectedEntities.join(", ")}.`);
    } else {
      reasons.push(`Expected identity '${expected}' could not be verified from the supplied content.`);
    }
  } else {
    reasons.push("No expected document identity was supplied for comparison.");
  }
  return {
    suppliedFileName: input.fileName,
    suppliedMimeType: input.mimeType,
    contentSha256,
    pageCount: parsed.pageCount,
    detectedTitle,
    detectedEntities,
    expectedIdentity: expected,
    status,
    reasons,
  };
}
