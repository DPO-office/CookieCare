/**
 * Versioned clause taxonomy — authored enumeration; never invented at runtime.
 */
export const CLAUSE_TAXONOMY_VERSION = "1.0.0";

export const CLAUSE_TAXONOMY = [
  "indemnity",
  "limitation_of_liability",
  "termination",
  "governing_law",
  "confidentiality",
  "assignment",
  "force_majeure",
  "definitions",
  "payment",
  "intellectual_property",
  "data_protection",
  "warranties",
  "dispute_resolution",
  "notices",
  "miscellaneous",
  "other",
] as const;

export type ClauseTaxonomyId = (typeof CLAUSE_TAXONOMY)[number];

export function isClauseTaxonomyId(value: string): value is ClauseTaxonomyId {
  return (CLAUSE_TAXONOMY as readonly string[]).includes(value);
}
