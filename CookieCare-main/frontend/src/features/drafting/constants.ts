// NDA_DOC_CONTENT and ARBITRATION_DOC_CONTENT have been removed from the frontend.
// Document templates are assembled exclusively on the backend (drafting-handler / DraftWorkflowOrchestrator).

// DEFAULT_ADVANCED_FIELDS / DEFAULT_ADVANCED_FIELD_VALUES were removed: the reactive
// "Extracted blueprints checklist" (Party A/B, Jurisdiction) no longer exists. The
// backend derives those details from the uploaded document and the user's instructions
// in step 1 (requirement extraction).

export interface DraftPrompt {
  id: string;
  title: string;
  prompt: string;
  builtin?: boolean;
}

export const DRAFT_STARTER_PROMPTS: DraftPrompt[] = [
  {
    id: "draft-nda",
    title: "Mutual NDA",
    prompt:
      "Draft a mutual non-disclosure agreement for two companies exploring a commercial partnership. Cover definition of confidential information, permitted disclosures, term, return or destruction of materials, and standard exclusions. Use balanced, commercially reasonable language.",
    builtin: true,
  },
  {
    id: "draft-dpa",
    title: "Vendor DPA",
    prompt:
      "Draft a GDPR Article 28 data processing agreement. We are the controller and the counterparty is the processor. Include processing instructions, security measures, sub-processor approval, international transfers, audit rights, breach notice, and deletion or return of personal data on termination.",
    builtin: true,
  },
  {
    id: "draft-msa",
    title: "SaaS master agreement",
    prompt:
      "Draft a B2B SaaS master services agreement covering subscription term, service levels, acceptable use, fees, limitation of liability, indemnities, IP ownership of the platform versus customer data, and termination for convenience and for cause.",
    builtin: true,
  },
  {
    id: "draft-consultant",
    title: "Consulting agreement",
    prompt:
      "Draft a professional services / consulting agreement for a fixed-scope engagement. Include statements of work, deliverables, payment milestones, IP assignment of work product, confidentiality, non-solicit, and a clean termination and wind-down clause.",
    builtin: true,
  },
  {
    id: "draft-sla",
    title: "Service level addendum",
    prompt:
      "Draft a service level addendum for a hosted software product. Define uptime target, measurement method, maintenance windows, credits, exclusions, and support response times. Keep the credits as the exclusive remedy for SLA failure.",
    builtin: true,
  },
];
