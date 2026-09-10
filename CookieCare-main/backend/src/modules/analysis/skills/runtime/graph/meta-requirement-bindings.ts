import type { IntentRequirementType } from "../../../models/intent.js";
import type { MetaRequirementBinding } from "../catalog/types.js";

export function matchMetaRequirementBindings(
  req: { id: string; type?: IntentRequirementType; label?: string },
  skills: Array<{ metaRequirementBindings?: MetaRequirementBinding[] }>
): string[] {
  const hay = `${req.id} ${req.label ?? ""}`.toLowerCase();
  const normalizedId = req.id.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const out: string[] = [];
  for (const skill of skills) {
    for (const binding of skill.metaRequirementBindings ?? []) {
      const { idIncludes, types } = binding.match;
      if (!idIncludes?.length && !types?.length) continue;
      const typeOk =
        !types?.length || (req.type != null && types.includes(req.type));
      const includeOk =
        !idIncludes?.length ||
        idIncludes.some((token) => {
          const needle = token.toLowerCase();
          const normalizedNeedle = needle.replace(/[\s-]+/g, "_");
          return hay.includes(needle) || normalizedId.includes(normalizedNeedle);
        });
      if (typeOk && includeOk) out.push(...binding.capabilityIds);
    }
  }
  return [...new Set(out)];
}
