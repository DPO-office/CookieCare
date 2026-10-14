import { pool } from "../../../config/database.js";

export interface PlaybookOverrideRule {
  ruleId: string;
  appliesToSkillIds: string[];
  clauseType: string;
  overrideSeverity?: "low" | "medium" | "high";
  overrideNote: string;
}

export interface OrgMemoryProfile {
  orgId: string;
  skillFrequency: Record<string, number>;
  defaultJurisdiction?: string;
  playbookOverrides: PlaybookOverrideRule[];
  updatedAt: string;
}

const FREQUENCY_DECAY = 0.92;

export function emptyOrgMemory(orgId: string): OrgMemoryProfile {
  return {
    orgId,
    skillFrequency: {},
    playbookOverrides: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function loadOrgMemory(orgId: string | undefined): Promise<OrgMemoryProfile | undefined> {
  const id = orgId?.trim();
  if (!id) return undefined;
  try {
    const { rows } = await pool.query(
      `SELECT profile_json FROM analysis_org_memory WHERE org_id = $1 LIMIT 1`,
      [id]
    );
    if (!rows.length) return emptyOrgMemory(id);
    const profile = rows[0].profile_json as OrgMemoryProfile;
    return {
      ...emptyOrgMemory(id),
      ...profile,
      orgId: id,
      skillFrequency: profile.skillFrequency ?? {},
      playbookOverrides: profile.playbookOverrides ?? [],
    };
  } catch (err) {
    console.warn("[org-memory] load failed:", err instanceof Error ? err.message : err);
    return emptyOrgMemory(id);
  }
}

export async function saveOrgMemory(profile: OrgMemoryProfile): Promise<void> {
  const id = profile.orgId?.trim();
  if (!id) return;
  const next: OrgMemoryProfile = { ...profile, orgId: id, updatedAt: new Date().toISOString() };
  try {
    await pool.query(
      `INSERT INTO analysis_org_memory (org_id, profile_json, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (org_id) DO UPDATE
       SET profile_json = EXCLUDED.profile_json, updated_at = NOW()`,
      [id, JSON.stringify(next)]
    );
  } catch (err) {
    console.warn("[org-memory] save failed:", err instanceof Error ? err.message : err);
  }
}

/** Decayed increment — routing bias only, never finding substance. */
export function recordSkillUse(profile: OrgMemoryProfile, skillId: string): OrgMemoryProfile {
  const decayed: Record<string, number> = {};
  for (const [k, v] of Object.entries(profile.skillFrequency)) {
    const next = v * FREQUENCY_DECAY;
    if (next > 0.05) decayed[k] = next;
  }
  decayed[skillId] = (decayed[skillId] ?? 0) + 1;
  return { ...profile, skillFrequency: decayed, updatedAt: new Date().toISOString() };
}

export function preferredSkillId(profile: OrgMemoryProfile | undefined): string | undefined {
  if (!profile) return undefined;
  let best: string | undefined;
  let bestN = 0;
  for (const [id, n] of Object.entries(profile.skillFrequency)) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return bestN >= 1 ? best : undefined;
}
