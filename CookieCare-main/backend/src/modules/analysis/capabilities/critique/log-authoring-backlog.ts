import { pool } from "../../../../config/database.js";
import { pacLog } from "../../utils/pac-log.js";

export async function logAuthoringBacklog(args: {
  orgId?: string;
  sessionId?: string;
  target: string;
  reason: string;
  workUnitId?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO analysis_authoring_backlog_log (org_id, session_id, target, reason, work_unit_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        args.orgId ?? null,
        args.sessionId ?? null,
        args.target.slice(0, 500),
        args.reason.slice(0, 500),
        args.workUnitId ?? null,
      ]
    );
    pacLog("authoring backlog", {
      target: args.target,
      reason: args.reason,
    });
  } catch (err) {
    console.warn("[logAuthoringBacklog] insert failed:", err);
  }
}
