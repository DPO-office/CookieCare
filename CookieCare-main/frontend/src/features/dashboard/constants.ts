export const JOB_TYPE_LABELS: Record<string, string> = {
  file_processing: "File ingest",
  document_analysis: "Analyze",
  template_drafting: "Draft",
  privacy_scanning: "Cookie scan",
  vulnerability_scanning: "Vulnerability scan",
  dpa_review: "DPA review",
  vendor_review: "Vendor review",
  ai_ethics_review: "AI ethics",
  PLAYBOOK_INGEST: "Playbook ingest",
  CLAUSE_INGEST: "Clause ingest",
  TEMPLATE_INGEST: "Template ingest",
  contract_comparison: "Compare",
};

/**
 * Maps a backend job type to the URL path of the feature that handles it.
 * These are now proper URL paths, not legacy tab IDs.
 */
export const JOB_TYPE_TABS: Record<string, string> = {
  file_processing:       "/vault",
  document_analysis:     "/analyze",
  template_drafting:     "/drafting",
  privacy_scanning:      "/cookie-scanner",
  vulnerability_scanning:"/vulnerability-scanner",
  dpa_review:            "/dpa-reviewer",
  vendor_review:         "/vendor-review",
  ai_ethics_review:      "/ai-ethics",
  PLAYBOOK_INGEST:       "/vault",
  CLAUSE_INGEST:         "/vault",
  TEMPLATE_INGEST:       "/vault",
  contract_comparison:   "/compare",
};
