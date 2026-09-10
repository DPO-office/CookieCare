/** Re-export — implementation lives in capabilities/reporting/. */
export {
  renderOutput,
  consolidateFindingsForRender,
  buildBriefSummaryDocument,
  buildRightsMatrixMemoDocument,
  getEligibleRemedialFindings,
  sanitizeRenderedOutput,
  findRuleByRendererHook,
} from "../reporting/render-output.js";
