export type { FixItem } from "./critique-report.js";

export interface FixPlan {
  items: import("./critique-report.js").FixItem[];
  /** When true, HUMAN_REFINE / CRITIQUE-targeted ACT should only touch these work units. */
  targetedOnly: boolean;
}
