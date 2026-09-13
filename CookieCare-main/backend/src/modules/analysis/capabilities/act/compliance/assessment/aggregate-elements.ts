import type { ComplianceAggregation } from "../../../../skills/runtime/catalog/types.js";
import type { ElementDecision } from "../contracts/index.js";
export interface AggregateResult {
  state: "satisfied" | "missing" | "unknown" | "excluded";
  supported: number;
}
export function aggregateElements(expression: ComplianceAggregation, elements: ElementDecision[]): AggregateResult {
  if ("elementId" in expression) {
    const e = elements.find(x => x.elementId === expression.elementId);
    if (!e || e.applicability.state === "unknown")
      return { state: "unknown", supported: 0 };
    if (e.applicability.state === "not_applicable")
      return { state: "excluded", supported: 0 };
    return { state: e.state === "supported" ? "satisfied" : e.state === "not_located" || e.state === "contradicted" ? "missing" : "unknown", supported: e.state === "supported" ? 1 : 0 };
  }
  const children = expression.children.map(c => aggregateElements(c, elements)).filter(c => c.state !== "excluded");
  const supported = children.reduce((sum, c) => sum + c.supported, 0);
  if (!children.length)
    return { state: "excluded", supported };
  const state = expression.operator === "all"
    ? children.some(c => c.state === "unknown") ? "unknown" : children.every(c => c.state === "satisfied") ? "satisfied" : "missing"
    : children.some(c => c.state === "satisfied") ? "satisfied" : children.some(c => c.state === "unknown") ? "unknown" : "missing";
  return { state, supported };
}
