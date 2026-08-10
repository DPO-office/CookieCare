import crypto from "crypto";
import { pool } from "../../../../config/database.js";
import { DraftState } from "../../models/draft-state.js";
import { toPersistedState } from "../../utils/persisted-state.js";

export const saveStep = async (state: DraftState): Promise<DraftState> => {

  if (!state.draft) {
    throw new Error('Save Step Aborted: Cannot execute state persistence layer on an empty draft artifact.');
  }

  try {
    // Persist via the hygiene boundary: strips the large compiled prompts
    // (context.assembledPrompt/systemPrompt) and includes the memory log.
    const snapshotMatrix = structuredClone(toPersistedState(state));

    // 3. Resolve historical identifier keys to manage document version tracking paths
    const documentId = state.request.payloadFields?.documentId || `doc_${crypto.randomUUID()}`;
    const currentVersion = state.draft.version;

    // 4. Fire the persistence logic routine directly to the historical table system
    // 2. PASTE THIS REAL DATABASE PERSISTENCE LAYER HERE:
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
      [
        documentId,
        currentVersion,
        JSON.stringify(snapshotMatrix), // Stores the cloned state object
        state.draft.formattedDocument   // Stores the actual text for quick index lookups
      ]
    );

    console.log(`[Ledger] Successfully committed Snapshot V${currentVersion} for document ${documentId}`);

    // 5. Return the finalized state securely with updated execution telemetry immutably
    return {
      ...state,
      metadata: {
        ...state.metadata,
        persistedDocumentId: documentId,
        isFullySaved: true,
        finalSavedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('Fatal database exception encountered during pipeline ledger save operations:', error);
    throw new Error(`Persistence Layer Failure: ${(error as Error).message}`);
  }
};