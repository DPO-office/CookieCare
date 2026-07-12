// NDA_DOC_CONTENT and ARBITRATION_DOC_CONTENT have been removed from the frontend.
// Document templates are assembled exclusively on the backend (drafting-handler / DraftWorkflowOrchestrator).

export const DEFAULT_ADVANCED_FIELDS = [
  { id: "party_a", name: "Party A Title", defaultValue: "Lexify Corporate", description: "Disclosing Primary Entity" },
  { id: "party_b", name: "Party B Title", defaultValue: "Vendor Tech Inc.", description: "Receiving technology Vendor" },
  { id: "jurisdiction", name: "Jurisdiction", defaultValue: "Delaware chancery", description: "Standard Governing Law" },
];

export const DEFAULT_ADVANCED_FIELD_VALUES: Record<string, string> = {
  party_a: "Lexify Corporate",
  party_b: "Vendor Tech Inc.",
  jurisdiction: "Delaware chancery",
};
