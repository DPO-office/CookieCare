/**
 * Canonical requirement identity — collapse PLAN ids and package-native ids
 * into one assessment key so findings stamped as `duration` satisfy
 * `gdpr.article28.duration` (and vice versa).
 *
 * Preference: PLAN-shaped ids are canonical when present in an alias group.
 * Package natives are aliases of those PLAN keys.
 */

export type RequirementIdentity = {
  canonicalId: string;
  aliases: string[];
};

/** Short-form / PLAN ↔ package-native pairs for Art 28 and common GDPR asks. */
const STATIC_ALIAS_GROUPS: string[][] = [
  ["gdpr.article28.subject_matter", "article28.subject_matter", "subject_matter"],
  ["gdpr.article28.duration", "article28.duration", "duration"],
  [
    "gdpr.article28.nature_and_purpose",
    "article28.nature_and_purpose",
    "nature_and_purpose",
    "nature_purpose",
  ],
  [
    "gdpr.article28.categories_of_data",
    "article28.categories_of_data",
    "categories_of_data",
    "data_categories",
  ],
  [
    "gdpr.article28.categories_of_data_subjects",
    "article28.categories_of_data_subjects",
    "categories_of_data_subjects",
    "data_subject_categories",
  ],
  // Combined PLAN categories row — live PLAN spellings omit "of_" or repeat "data_".
  [
    "gdpr.article28.categories_of_data_and_subjects",
    "gdpr.article28.data_categories_and_subjects",
    "gdpr.article28.categories_data_and_subjects",
    "gdpr.article28.categories_of_data_and_data_subjects",
    "gdpr.article28.categories_data_and_data_subjects",
    "article28.categories_of_data_and_subjects",
    "article28.categories_data_and_subjects",
    "article28.categories_of_data_and_data_subjects",
    "article28.categories_data_and_data_subjects",
    "categories_of_data_and_subjects",
    "categories_data_and_subjects",
    "categories_of_data_and_data_subjects",
    "categories_data_and_data_subjects",
    "data_categories_and_subjects",
  ],
  [
    "gdpr.article28.controller_obligations_and_rights",
    "gdpr.article28.controller_obligations_rights",
    "article28.controller_obligations_and_rights",
    "article28.controller_obligations_rights",
    "controller_obligations_and_rights",
    "controller_obligations_rights",
  ],
  [
    "gdpr.article28_3.mandatory_clauses_adequacy",
    "gdpr.article28_3.mandatory_obligations_adequacy",
    "gdpr.article28.processor_obligations",
    "gdpr.article28.mandatory_clauses_adequacy",
    "gdpr.article28.mandatory_clauses_completeness",
    "gdpr.article28_3.mandatory_clauses_completeness",
    "article28_3.mandatory_clauses_adequacy",
    "article28.mandatory_clauses_completeness",
    "mandatory_article28_clauses",
    "mandatory_article_28_3_clauses",
  ],
  ["dsr.response_timeframes"],
  ["dsr.gap_analysis"],
  ["international_data_transfer", "international_data_transfers", "international_transfer"],
];

/** Prefer PLAN-shaped ids as canonical when present. */
const CANONICAL_PREFERENCE = [
  "gdpr.article28.subject_matter",
  "gdpr.article28.duration",
  "gdpr.article28.nature_and_purpose",
  "gdpr.article28.categories_of_data",
  "gdpr.article28.categories_of_data_subjects",
  "gdpr.article28.categories_of_data_and_subjects",
  "gdpr.article28.categories_data_and_subjects",
  "gdpr.article28.controller_obligations_and_rights",
  "gdpr.article28.controller_obligations_rights",
  "gdpr.article28_3.mandatory_clauses_adequacy",
  "gdpr.article28.mandatory_clauses_adequacy",
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
  // Prefer PLAN-shaped ids (contain "article") over bare natives.
  const planShaped = normalized.find((m) => m.includes("article"));
  if (planShaped) return planShaped;
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
 * Words that carry no identifying content — stripped before the token-set
 * fallback compares two ids. Includes the namespace prefixes ("gdpr",
 * "article"/"art" with or without a trailing number) so only the topic words
 * are compared.
 */
const IGNORED_ID_TOKEN = /^(?:gdpr|and|of|the|article|art)\d*$/;

/**
 * Order-independent identity for an id's topic words, e.g.
 * "controller_rights_and_obligations" and "controller_obligations_and_rights"
 * both reduce to "controller_obligations_rights". Classify-intent is an LLM
 * call — it can phrase a known concept with a different word order than any
 * hand-authored alias anticipated (see the ART28-ATTEMPTS retrospective: a
 * PLAN run said "controller_rights_and_obligations", every static alias said
 * "controller_obligations_and_rights", and the mismatch silently dropped an
 * already-VERIFIED finding at the LOCK stage). This fallback makes new word
 * orderings of an *already-known* concept resolve correctly without needing
 * a hand-added alias for every permutation; it never merges two id groups
 * that weren't already aliased to each other.
 */
function tokenSetKey(id: string): string {
  const tokens = rawNormalize(id)
    .split(/[._]+/)
    .filter((t) => t.length > 0 && !IGNORED_ID_TOKEN.test(t));
  if (tokens.length === 0) return "";
  return [...new Set(tokens)].sort().join("_");
}

function buildTokenSetFallbackMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of STATIC_ALIAS_GROUPS) {
    const canonical = pickCanonical(group);
    for (const member of group) {
      const key = tokenSetKey(member);
      if (key) map.set(key, canonical);
    }
  }
  return map;
}

const TOKEN_SET_FALLBACK_MAP = buildTokenSetFallbackMap();

/**
 * Combined categories PLAN id is an umbrella: findings stamped to either
 * data_categories or data_subject_categories support it.
 * Mandatory coverage umbrellas collect lettered Art 28(3) package rows.
 */
const LETTERED_ART28_MEMBERS = [
  "art28_3_a_instructions",
  "art28_3_b_confidentiality",
  "art28_3_c_security",
  "art28_3_d_subprocessors",
  "art28_3_e_dsr_assistance",
  "art28_3_f_security_assistance",
  "art28_3_g_deletion_return",
  "art28_3_h_audit",
  "art28_4_subprocessor_flow_down",
];

const CATEGORY_UMBRELLA_MEMBERS = ["data_categories", "data_subject_categories"];

const UMBRELLA_TO_MEMBERS: Record<string, string[]> = {
  "gdpr.article28.categories_of_data_and_subjects": CATEGORY_UMBRELLA_MEMBERS,
  "gdpr.article28.data_categories_and_subjects": CATEGORY_UMBRELLA_MEMBERS,
  "gdpr.article28.categories_data_and_subjects": CATEGORY_UMBRELLA_MEMBERS,
  "gdpr.article28.categories_of_data_and_data_subjects": CATEGORY_UMBRELLA_MEMBERS,
  "gdpr.article28.categories_data_and_data_subjects": CATEGORY_UMBRELLA_MEMBERS,
  "article28.categories_of_data_and_subjects": CATEGORY_UMBRELLA_MEMBERS,
  "article28.categories_data_and_subjects": CATEGORY_UMBRELLA_MEMBERS,
  "article28.categories_of_data_and_data_subjects": CATEGORY_UMBRELLA_MEMBERS,
  "article28.categories_data_and_data_subjects": CATEGORY_UMBRELLA_MEMBERS,
  categories_of_data_and_subjects: CATEGORY_UMBRELLA_MEMBERS,
  categories_data_and_subjects: CATEGORY_UMBRELLA_MEMBERS,
  categories_of_data_and_data_subjects: CATEGORY_UMBRELLA_MEMBERS,
  categories_data_and_data_subjects: CATEGORY_UMBRELLA_MEMBERS,
  data_categories_and_subjects: CATEGORY_UMBRELLA_MEMBERS,
  mandatory_article28_clauses: LETTERED_ART28_MEMBERS,
  mandatory_article_28_3_clauses: LETTERED_ART28_MEMBERS,
  "gdpr.article28.mandatory_clauses_completeness": LETTERED_ART28_MEMBERS,
  "gdpr.article28.mandatory_clauses_adequacy": LETTERED_ART28_MEMBERS,
  "gdpr.article28_3.mandatory_clauses_adequacy": LETTERED_ART28_MEMBERS,
  "gdpr.article28_3.mandatory_obligations_adequacy": LETTERED_ART28_MEMBERS,
  "gdpr.article28.processor_obligations": LETTERED_ART28_MEMBERS,
  "gdpr.article28_3.mandatory_clauses_completeness": LETTERED_ART28_MEMBERS,
  "article28_3.mandatory_clauses_adequacy": LETTERED_ART28_MEMBERS,
};

export function getUmbrellaMembers(id: string): string[] | undefined {
  if (!id) return undefined;
  const key = rawNormalize(id);
  const canonical = canonicalRequirementId(id);
  const exact =
    UMBRELLA_TO_MEMBERS[id] ??
    UMBRELLA_TO_MEMBERS[key] ??
    UMBRELLA_TO_MEMBERS[canonical];
  if (exact) return exact;

  if (key.includes("categor") && (key.includes("data") || key.includes("subject"))) {
    return CATEGORY_UMBRELLA_MEMBERS;
  }
  if (
    key.includes("mandatory") &&
    (key.includes("article28") || key.includes("art28") || key.includes("clause"))
  ) {
    return LETTERED_ART28_MEMBERS;
  }
  return undefined;
}

export function normalizeRequirementKey(id: string): string {
  return rawNormalize(id);
}

/**
 * Resolve any known alias to its canonical PLAN-shaped (or preferred) id.
 * Unknown ids return themselves (normalized).
 */
export function canonicalRequirementId(id: string): string {
  const key = rawNormalize(id);
  const exact = STATIC_MAP.get(key);
  if (exact) return exact;
  const tokenKey = tokenSetKey(id);
  const fallback = tokenKey ? TOKEN_SET_FALLBACK_MAP.get(tokenKey) : undefined;
  return fallback ?? key;
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

  const umbrellaMembers = getUmbrellaMembers(requirementId);
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
 * True when this PLAN/coverage id collects member findings rather than being
 * a single evaluated package-native row.
 */
export function isUmbrellaRequirementId(requirementId: string): boolean {
  return Boolean(getUmbrellaMembers(requirementId));
}

/**
 * Collapse a list of requirement ids to unique canonical ids (stable order).
 *
 * For locked assessments, pass `expandUmbrellas: false` so a PLAN umbrella
 * (categories / mandatory clauses) stays one row that collects member findings.
 * Outline helpers may still expand when they need member tags.
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
    const umbrella = getUmbrellaMembers(id);
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
    // Wanted tag may be a package-native member of an umbrella assessment.
    if (findingSupportsRequirement(wanted, assessmentId)) return true;
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
