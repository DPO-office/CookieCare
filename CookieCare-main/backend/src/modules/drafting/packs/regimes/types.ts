import type { WorkUnit } from "../../models/draft-plan.js";
import type { StructuredFacts } from "../../models/structured-facts.js";
import type { DraftingSkillConfig } from "../skill-contract.js";

export interface RegimePack {
  id: string;
  triggerCondition: (facts: StructuredFacts) => boolean;
  additionalWorkUnits: WorkUnit[];
  skillPaths: string[];
  /** Optional executable skill config. */
  skillConfig?: DraftingSkillConfig;
}
