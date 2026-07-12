/**
 * VendorReview API layer.
 *
 * Currently uses mock data while the backend endpoint is not yet implemented.
 * Replace the mock implementations with real fetch/axios calls when ready.
 */

import { MOCK_FINDINGS, MOCK_COMPLIANCE, MOCK_RECOMMENDATIONS, VENDOR_INFO } from "../constants";
import type { VendorFinding, ComplianceItem, RecommendationSection } from "../types";

export interface VendorAssessmentResult {
  vendorInfo: typeof VENDOR_INFO;
  findings: VendorFinding[];
  compliance: ComplianceItem[];
  recommendations: RecommendationSection[];
  scores: {
    vendorRisk: number;
    privacy: number;
    security: number;
  };
}

/**
 * Submit vendor documents for AI analysis.
 * Returns the full assessment result.
 *
 * @param _files - The uploaded vendor documents (unused until backend is live).
 */
export async function submitVendorDocuments(
  _files: File[],
): Promise<VendorAssessmentResult> {
  // TODO: Replace with real API call, e.g.:
  // const form = new FormData();
  // files.forEach((f) => form.append("files", f));
  // const res = await fetch("/api/vendor-review/analyze", { method: "POST", body: form });
  // if (!res.ok) throw new Error("Vendor analysis failed");
  // return res.json();

  return {
    vendorInfo: VENDOR_INFO,
    findings: MOCK_FINDINGS,
    compliance: MOCK_COMPLIANCE,
    recommendations: MOCK_RECOMMENDATIONS,
    scores: { vendorRisk: 62, privacy: 71, security: 78 },
  };
}
