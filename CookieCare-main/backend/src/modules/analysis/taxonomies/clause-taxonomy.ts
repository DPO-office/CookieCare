/**
 * Versioned clause taxonomy — authored enumeration; never invented at runtime.
 */
export const CLAUSE_TAXONOMY_VERSION = "1.2.0";

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
  "non_compete",
  "execution_formalities",
  "electronic_signature",
  "data_protection",
  "data_subject_request_handling",
  "processor_assistance_obligation",
  "security_dpia_assistance",
  "deletion_on_termination",
  "subprocessor_flow_down",
  "international_transfer_mechanism",
  "automated_decision_disclosure",
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
