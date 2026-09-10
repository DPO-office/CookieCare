import crypto from "crypto";
import { pool } from "../../../../config/database.js";
import { DraftState } from "../../models/draft-state.js";
import { toPersistedState } from "../../utils/persisted-state.js";

export type SaveStepOptions = {
  /** When true, allow persisting PLAN/ASK pause without a finished draft body. */
  allowEmptyDraft?: boolean;
};

/**
 * Persist a draft snapshot to draft_state_ledger.
 * ASK pauses use version 0 and empty formatted_text so resume-ask can reload state.
 */
export const saveStep = async (
  state: DraftState,
  options: SaveStepOptions = {}
): Promise<DraftState> => {
  const allowEmptyDraft = options.allowEmptyDraft === true;
  const isPausedAsk = state.agent?.stoppedReason === "awaiting_user";

  if (!state.draft && !allowEmptyDraft && !isPausedAsk) {
    throw new Error(
      "Save Step Aborted: Cannot execute state persistence layer on an empty draft artifact."
    );
  }

  try {
    const snapshotMatrix = structuredClone(toPersistedState(state));
    const documentId =
      state.request?.payloadFields?.documentId ||
      state.conversation?.documentId ||
      `doc_${crypto.randomUUID()}`;

    const currentVersion =
      isPausedAsk || !state.draft ? 0 : state.draft.version ?? 1;
    const formattedText = state.draft?.formattedDocument ?? "";

    await pool.query(
      `INSERT INTO draft_state_ledger (
        document_id,
        version,
        state_snapshot_json,
        formatted_text,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (document_id, version)
      DO UPDATE SET
        state_snapshot_json = EXCLUDED.state_snapshot_json,
        formatted_text = EXCLUDED.formatted_text,
        updated_at = NOW()`,
      [documentId, currentVersion, JSON.stringify(snapshotMatrix), formattedText]
    );

    console.log(
      `[Ledger] Successfully committed Snapshot V${currentVersion} for document ${documentId}` +
        (isPausedAsk ? " (paused ASK)" : "")
    );

    return {
      ...state,
      request: {
        ...state.request,
        payloadFields: {
          ...(state.request?.payloadFields ?? { documentId }),
          documentId,
        },
      },
      metadata: {
        ...state.metadata,
        persistedDocumentId: documentId,
        isFullySaved: !isPausedAsk,
        isPausedAsk,
        finalSavedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(
      "Fatal database exception encountered during pipeline ledger save operations:",
      error
    );
    throw new Error(`Persistence Layer Failure: ${(error as Error).message}`);
  }
};
