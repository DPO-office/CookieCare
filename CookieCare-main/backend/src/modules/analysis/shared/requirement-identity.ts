/**
 * Canonical requirement identity — collapse PLAN ids and package-native ids
 * into one assessment key so findings stamped as `duration` satisfy
 * `gdpr.article28.duration` (and vice versa).
 */

export type RequirementIdentity = {
  canonicalId: string;
  aliases: string[];
};

/** Short-form / PLAN ↔ package-native pairs for Art 28 and common GDPR asks. */
const STATIC_ALIAS_GROUPS: string[][] = [
  ["subject_matter", "gdpr.article28.subject_matter", "article28.subject_matter"],
  ["duration", "gdpr.article28.duration", "article28.duration"],
  [
    "nature_purpose",
    "nature_and_purpose",
    "gdpr.article28.nature_and_purpose",
    "article28.nature_and_purpose",
  ],
  [
    "data_categories",
    "categories_of_data",
    "gdpr.article28.categories_of_data",
    "article28.categories_of_data",
  ],
  [
    "data_subject_categories",
    "categories_of_data_subjects",
    "gdpr.article28.categories_of_data_subjects",
    "article28.categories_of_data_subjects",
  ],
  // Combined PLAN categories row maps to both category natives; canonical is the PLAN-facing aggregate key.
  [
    "gdpr.article28.categories_of_data_and_subjects",
    "article28.categories_of_data_and_subjects",
    "categories_of_data_and_subjects",
  ],
  [
    "controller_obligations_rights",
    "controller_obligations_and_rights",
    "gdpr.article28.controller_obligations_and_rights",
    "article28.controller_obligations_and_rights",
  ],
  [
    "mandatory_article28_clauses",
    "mandatory_article_28_3_clauses",
    "gdpr.article28.mandatory_clauses_completeness",
    "article28.mandatory_clauses_completeness",
  ],
  ["dsr.response_timeframes"],
  ["dsr.gap_analysis"],
  ["international_data_transfer", "international_data_transfers", "international_transfer"],
];

/** Prefer package-native / shortest stable id as canonical when present. */
const CANONICAL_PREFERENCE = [
  "subject_matter",
  "duration",
  "nature_purpose",
  "data_categories",
  "data_subject_categories",
  "controller_obligations_rights",
  "mandatory_article28_clauses",
  "international_data_transfer",
  "dsr.response_timeframes",
  "dsr.gap_analysis",
];

function rawNormalize(id: string): string {
  return id.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function pickCanonical(members: string[]): string {
  const normalized = members.map((m) => rawNormalize(m));
  for (const preferred of CANONICAL_PREFERENCE) {
    const hit = normalized.find((m) => m === preferred);
    if (hit) return hit;
  }
  // Prefer non-PLAN-prefixed package-native style ids.
  const native = normalized.find((m) => !m.includes("article") && !m.includes("."));
  if (native) return native;
  const short = [...normalized].sort((a, b) => a.length - b.length)[0];
  return short ?? normalized[0]!;
}

function buildStaticAliasMap(): Map<string, string> {
  const aliasToCanonical = new Map<string, string>();
  for (const group of STATIC_ALIAS_GROUPS) {
    const canonical = pickCanonical(group);
    for (const member of group) {
      aliasToCanonical.set(rawNormalize(member), canonical);
    }
    aliasToCanonical.set(canonical, canonical);
  }
  return aliasToCanonical;
}

const STATIC_MAP = buildStaticAliasMap();

/**
 * Combined categories PLAN id is an umbrella: findings stamped to either
 * data_categories or data_subject_categories support it, but assessments
 * still emit the two natives (and optionally the umbrella only when PLAN asked).
 */
const UMBRELLA_TO_MEMBERS: Record<string, string[]> = {
  "gdpr.article28.categories_of_data_and_subjects": [
    "data_categories",
    "data_subject_categories",
  ],
  "article28.categories_of_data_and_subjects": [
    "data_categories",
    "data_subject_categories",
  ],
  categories_of_data_and_subjects: ["data_categories", "data_subject_categories"],
  mandatory_article28_clauses: [
    "art28_3_a_instructions",
    "art28_3_b_confidentiality",
    "art28_3_c_security",
    "art28_3_d_subprocessors",
    "art28_3_e_dsr_assistance",
    "art28_3_f_security_assistance",
    "art28_3_g_deletion_return",
    "art28_3_h_audit",
    "art28_4_subprocessor_flow_down",
  ],
  mandatory_article_28_3_clauses: [
    "art28_3_a_instructions",
    "art28_3_b_confidentiality",
    "art28_3_c_security",
    "art28_3_d_subprocessors",
    "art28_3_e_dsr_assistance",
    "art28_3_f_security_assistance",
    "art28_3_g_deletion_return",
    "art28_3_h_audit",
    "art28_4_subprocessor_flow_down",
  ],
  "gdpr.article28.mandatory_clauses_completeness": [
    "art28_3_a_instructions",
    "art28_3_b_confidentiality",
    "art28_3_c_security",
    "art28_3_d_subprocessors",
    "art28_3_e_dsr_assistance",
    "art28_3_f_security_assistance",
    "art28_3_g_deletion_return",
    "art28_3_h_audit",
    "art28_4_subprocessor_flow_down",
  ],
};

export function normalizeRequirementKey(id: string): string {
  return rawNormalize(id);
}

/**
 * Resolve any known alias to its canonical package-native (or preferred) id.
 * Unknown ids return themselves (normalized).
 */
export function canonicalRequirementId(id: string): string {
  const key = rawNormalize(id);
  return STATIC_MAP.get(key) ?? key;
}

/** True when `a` and `b` refer to the same canonical requirement. */
export function requirementIdsEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (rawNormalize(a) === rawNormalize(b)) return true;
  return canonicalRequirementId(a) === canonicalRequirementId(b);
}

/**
 * Ids that should match when collecting supporting findings for `requirementId`.
 * Includes the id itself, its canonical form, static aliases, and umbrella members.
 */
export function matchingRequirementIds(requirementId: string): Set<string> {
  const out = new Set<string>();
  const key = rawNormalize(requirementId);
  const canonical = canonicalRequirementId(requirementId);
  out.add(key);
  out.add(canonical);
  out.add(rawNormalize(requirementId));

  for (const [alias, canon] of STATIC_MAP) {
    if (canon === canonical || alias === key || alias === canonical) {
      out.add(alias);
      out.add(canon);
    }
  }

  const umbrellaMembers =
    UMBRELLA_TO_MEMBERS[requirementId] ??
    UMBRELLA_TO_MEMBERS[key] ??
    UMBRELLA_TO_MEMBERS[canonical];
  if (umbrellaMembers) {
    for (const member of umbrellaMembers) {
      out.add(rawNormalize(member));
      out.add(canonicalRequirementId(member));
    }
  }

  // Reverse: if this is a member of an umbrella, do not pull sibling umbrella
  // members unless the target itself is the umbrella (handled above).
  return out;
}

/**
 * Whether a finding stamped with `findingRequirementId` supports `assessmentId`.
 */
export function findingSupportsRequirement(
  findingRequirementId: string | undefined,
  assessmentId: string
): boolean {
  if (!findingRequirementId) return false;
  if (requirementIdsEquivalent(findingRequirementId, assessmentId)) return true;
  const matchSet = matchingRequirementIds(assessmentId);
  return matchSet.has(rawNormalize(findingRequirementId));
}

/**
 * Whole-article requirements may receive unstamped same-article findings.
 * Particular / lettered / topic-shaped ids must not.
 */
export function isWholeArticleRequirement(requirementId: string): boolean {
  const id = rawNormalize(requirementId);
  if (/\.compliance$/.test(id)) return true;
  if (/^gdpr\.article\d+$/.test(id)) return true;
  if (/^article\d+$/.test(id)) return true;
  // Bare "gdpr.article17" style without a particular suffix.
  if (/^(?:gdpr\.)?article_?\d+$/.test(id)) return true;
  return false;
}

/**
 * Collapse a list of requirement ids to unique canonical ids (stable order).
 * Umbrella PLAN coverage ids expand to their member natives when members are
 * present in `availableFindingIds` or when `expandUmbrellas` is true.
 */
export function collapseToCanonicalRequirementIds(
  ids: string[],
  opts?: {
    expandUmbrellas?: boolean;
    availableFindingRequirementIds?: Iterable<string>;
  }
): string[] {
  const expand = opts?.expandUmbrellas ?? true;
  const available = new Set(
    [...(opts?.availableFindingRequirementIds ?? [])].map((id) =>
      canonicalRequirementId(id)
    )
  );
  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (id: string) => {
    const canon = canonicalRequirementId(id);
    if (seen.has(canon)) return;
    seen.add(canon);
    ordered.push(canon);
  };

  for (const id of ids) {
    const key = rawNormalize(id);
    const umbrella =
      UMBRELLA_TO_MEMBERS[id] ?? UMBRELLA_TO_MEMBERS[key] ?? undefined;
    if (expand && umbrella) {
      if (available.size === 0) {
        // No stamped findings yet — keep a single coverage/umbrella row.
        push(id);
        continue;
      }
      const membersToEmit = umbrella.filter((member) =>
        available.has(canonicalRequirementId(member))
      );
      if (membersToEmit.length > 0) {
        for (const member of membersToEmit) push(member);
      } else {
        push(id);
      }
      continue;
    }
    push(id);
  }
  return ordered;
}

/**
 * Register package-authored requirement ids so they normalize to themselves
 * as canonical when not already in the static map.
 */
export function registerPackageRequirementIds(requirementIds: string[]): void {
  for (const id of requirementIds) {
    const key = rawNormalize(id);
    if (!STATIC_MAP.has(key)) {
      STATIC_MAP.set(key, key);
    }
  }
}

/**
 * Whether an assessment keyed by `assessmentId` belongs in a section that
 * asked for any of `wantedIds` (PLAN aliases, natives, or umbrellas).
 */
export function assessmentMatchesWantedIds(
  assessmentId: string,
  wantedIds: Iterable<string>
): boolean {
  const assessmentCanon = canonicalRequirementId(assessmentId);
  const assessmentKey = rawNormalize(assessmentId);
  for (const wanted of wantedIds) {
    if (!wanted) continue;
    if (requirementIdsEquivalent(assessmentId, wanted)) return true;
    const matchSet = matchingRequirementIds(wanted);
    if (matchSet.has(assessmentKey) || matchSet.has(assessmentCanon)) return true;
  }
  return false;
}

/**
 * Filter assessments whose canonical/alias identity intersects `wantedIds`.
 */
export function filterAssessmentsByRequirementIds<
  T extends { requirementId: string },
>(assessments: T[], wantedIds: Iterable<string>): T[] {
  const wanted = [...wantedIds];
  if (wanted.length === 0) return [];
  return assessments.filter((row) =>
    assessmentMatchesWantedIds(row.requirementId, wanted)
  );
}
