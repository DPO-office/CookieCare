/**
 * Runnable entry for CI — fails process if skill.config ↔ SKILL.md parity is broken.
 * Invoked via `npm run lint:skills` and as part of the golden fixture suite.
 */
import { assertSkillParity } from "./lint-skill-parity.js";

assertSkillParity();
console.log("[lint-skill-parity] ok");
