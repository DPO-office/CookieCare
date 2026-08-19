/**
 * Domain artifact for international-transfer inventory packages.
 * The scheduler does not branch on this type; the inventory handler uses
 * `outputArtifactType` / `config.recordSchema` to pick the schema.
 */

export type TransferMechanism =
  | "eu_scc"
  | "uk_addendum"
  | "bcr"
  | "adequacy"
  | "article49"
  | "local_transfer_mechanism"
  | "other"
  | "unspecified";

export type TransferRecipientRole =
  | "controller"
  | "processor"
  | "subprocessor"
  | "third_party"
  | "unknown";

export interface TransferRecord {
  id: string;
  evidenceIds: string[];
  sectionIds?: string[];
  sourceJurisdiction?: string;
  destinationJurisdiction?: string;
  recipientRole?: TransferRecipientRole;
  mechanism: TransferMechanism;
  legalBasis?: string[];
  supplementaryMeasures?: string[];
  tiaReference?: string[];
  references?: string[];
  applicability?: string;
  quotedText?: string;
  confidence?: number;
}

export interface TransferInventory {
  transfers: TransferRecord[];
  referencedTransferDocuments: string[];
  unresolvedReferences: string[];
  jurisdictions: string[];
  mechanisms: TransferMechanism[];
}

export const DEFAULT_TRANSFER_MECHANISM_ALIASES: Record<string, TransferMechanism> = {
  "standard contractual clauses": "eu_scc",
  "standard contractual clause": "eu_scc",
  scc: "eu_scc",
  sccs: "eu_scc",
  "eu scc": "eu_scc",
  "eu sccs": "eu_scc",
  "2021/914": "eu_scc",
  "decision (eu) 2021/914": "eu_scc",
  "uk addendum": "uk_addendum",
  "uk scc": "uk_addendum",
  "uk sccs": "uk_addendum",
  "approved eu sccs": "uk_addendum",
  "international data transfer agreement": "uk_addendum",
  idta: "uk_addendum",
  "binding corporate rules": "bcr",
  bcr: "bcr",
  "bcrs": "bcr",
  adequacy: "adequacy",
  "adequacy decision": "adequacy",
  "adequate country": "adequacy",
  "article 49": "article49",
  "art 49": "article49",
  "derogation": "article49",
  "asean mcc": "local_transfer_mechanism",
  "asean model contractual clauses": "local_transfer_mechanism",
  "brazil scc": "local_transfer_mechanism",
  "argentina scc": "local_transfer_mechanism",
  "japan appi": "local_transfer_mechanism",
};

export function normalizeTransferMechanism(
  raw: string | undefined,
  extraAliases?: Record<string, string>
): TransferMechanism {
  if (!raw?.trim()) return "unspecified";
  const hay = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const merged: Record<string, TransferMechanism> = { ...DEFAULT_TRANSFER_MECHANISM_ALIASES };
  for (const [alias, value] of Object.entries(extraAliases ?? {})) {
    if (isTransferMechanism(value)) merged[alias.toLowerCase()] = value;
  }
  if (merged[hay]) return merged[hay];
  const hit = Object.entries(merged).find(
    ([alias]) => hay.includes(alias) || alias.includes(hay)
  );
  return hit?.[1] ?? (isTransferMechanism(hay) ? hay : "other");
}

function isTransferMechanism(value: string): value is TransferMechanism {
  return (
    value === "eu_scc" ||
    value === "uk_addendum" ||
    value === "bcr" ||
    value === "adequacy" ||
    value === "article49" ||
    value === "local_transfer_mechanism" ||
    value === "other" ||
    value === "unspecified"
  );
}
