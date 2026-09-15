import type { ComplianceAggregation } from "../../../../skills/runtime/catalog/types.js";
import type { ElementDecision } from "../contracts/index.js";
export interface AggregateResult {
  state: "satisfied" | "missing" | "unknown" | "excluded";
  supported: number;
  totalWeight?: number;
  supportedWeight?: number;
  complianceScore?: number;
}
export function aggregateElements(
  expression: ComplianceAggregation,
  elements: ElementDecision[],
  compiledElements?: Array<{ id: string; weight?: number }>
): AggregateResult {
  if ("elementId" in expression) {
    const e = elements.find(x => x.elementId === expression.elementId);
    const weight = compiledElements?.find(c => c.id === expression.elementId)?.weight ?? 1.0;
    if (!e || e.applicability.state === "unknown")
      return { state: "unknown", supported: 0, totalWeight: weight, supportedWeight: 0, complianceScore: 0 };
    if (e.applicability.state === "not_applicable")
      return { state: "excluded", supported: 0, totalWeight: 0, supportedWeight: 0, complianceScore: 1 };
    const isSupported = e.state === "supported";
    const state = isSupported ? "satisfied" : e.state === "not_located" || e.state === "contradicted" ? "missing" : "unknown";
    const suppWeight = isSupported ? weight : 0;
    return {
      state,
      supported: isSupported ? 1 : 0,
      totalWeight: weight,
      supportedWeight: suppWeight,
      complianceScore: weight > 0 ? suppWeight / weight : 1.0,
    };
  }
  const children = expression.children.map(c => aggregateElements(c, elements, compiledElements)).filter(c => c.state !== "excluded");
  const supported = children.reduce((sum, c) => sum + c.supported, 0);
  const totalWeight = children.reduce((sum, c) => sum + (c.totalWeight ?? 0), 0);
  const supportedWeight = children.reduce((sum, c) => sum + (c.supportedWeight ?? 0), 0);
  const complianceScore = totalWeight > 0 ? supportedWeight / totalWeight : 1.0;

  if (!children.length)
    return { state: "excluded", supported, totalWeight: 0, supportedWeight: 0, complianceScore: 1 };
  const state = expression.operator === "all"
    // A definite shortfall (an element searched and not established) outranks an
    // "unknown" (e.g. an untriggered conditional): the requirement is a gap, not
    // indeterminate. "unknown" only survives when nothing is missing outright —
    // so a fully-satisfied core plus one unknown still yields cannot_determine.
    ? children.every(c => c.state === "satisfied") ? "satisfied" : children.some(c => c.state === "missing") ? "missing" : "unknown"
    : children.some(c => c.state === "satisfied") ? "satisfied" : children.some(c => c.state === "unknown") ? "unknown" : "missing";
  return { state, supported, totalWeight, supportedWeight, complianceScore };
}
