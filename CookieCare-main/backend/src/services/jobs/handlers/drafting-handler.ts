import { pool } from "../../../config/database.js";
import { chunkAndIndexDocument } from "../../../RAG/ragService.js";
import { encryptData, decryptData } from "../../../utils/crypto.js";
import { withRetry } from "../../../utils/retry.js";
import { withTransaction } from "../../../utils/dbUtils.js";
import { openRouterComplete } from "../../openRouterClient.js";
import crypto from "crypto";
import { jobRegistry, updateJobProgress } from "../../jobQueue.js";
import { DraftState } from "../../../modules/drafting/models/draft-state.js";
import { extractText } from "../../../utils/extractText.js";
import { draftEntry } from "../../../modules/drafting/entry/draft-workflow.js";
import { resolveLegalDocumentTitle } from "../../../modules/drafting/prompts/system-templates.js";
import { parseSections } from "../../../modules/drafting/utils/document-sections.js";
import { applyUserAnswers } from "../../../modules/drafting/memory/conversation-store.js";

async function extractTextFromStorageUrl(fileUrl: string): Promise<string> {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`File download failed with status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    // Detect content type from URL extension; default to PDF for backward compatibility
    const isPdf = fileUrl.toLowerCase().includes(".pdf") || !fileUrl.includes(".");
    const mimeType = isPdf ? "application/pdf" : "application/octet-stream";
    return extractText(buffer, mimeType);
  }


async function handleInitialDraftingJob(jobId: string, userId: string, payload: any): Promise<any> {
    // Unified PAC CREATE feed — no BASIC/PROACTIVE/REACTIVE modes.
    // Inputs: draftInput + draftInstructions, optional uploadedDocument / vault documentId.
    const { draftInput, draftInstructions, uploadedDocument, documentId, intake } = payload;
    console.log(
      "Entered handleInitialDraftingJob (PAC CREATE)",
      uploadedDocument ? "with source upload" : documentId ? "with vault template" : "prompt-only"
    );

    await updateJobProgress(jobId, userId, 20, "Extracting compliance parameters and routing tracking slots...");
    const targetDocId = "doc_" + crypto.randomUUID();

    const composedInstructions = [
      draftInput || "",
      draftInstructions ? `Drafting instructions & requirements:\n${draftInstructions}` : "",
    ]
      .filter((part) => part && part.trim())
      .join("\n\n")
      .trim();

    let resolvedSourceText: string | undefined = undefined;

    if (uploadedDocument) {
      try {
        const fileLookup = await pool.query(
          "SELECT content, is_encrypted FROM files WHERE id = $1 LIMIT 1",
          [uploadedDocument]
        );
        if (fileLookup.rows.length > 0) {
          const fileRow = fileLookup.rows[0];
          resolvedSourceText = fileRow.is_encrypted
            ? decryptData(fileRow.content)
            : fileRow.content;
        }
      } catch (err) {
        console.error("Failed to resolve uploaded source text:", err);
      }
    }

    await updateJobProgress(jobId, userId, 25, "Structuring tracking context state blocks...");

    const initialStateContainer: DraftState = {
      onProgress: async (percent, message) => {
        await updateJobProgress(jobId, userId, percent, message);
      },
      onToken: (delta) => {
        jobRegistry.broadcastToken(userId, jobId, delta);
      },
      entryMode: "CREATE",
      intakeOverlay: intake
        ? {
            documentType: intake.documentType,
            governingLaw: intake.governingLaw,
            phiInvolved: intake.phiInvolved,
            partyCount: intake.partyCount,
            parties: intake.parties,
          }
        : undefined,
      organizationId: payload.organizationId ? String(payload.organizationId) : undefined,
      request: {
        intent: "CREATE",
        rawInstructions: composedInstructions,
        sourceText: resolvedSourceText,
        vaultDocumentId: documentId ? String(documentId) : null,
        payloadFields: { documentId: targetDocId },
      },
      requirements: {
        contractType: intake?.documentType || "General",
        jurisdiction: intake?.governingLaw || "Not specified",
        industry: "General",
        parties: intake?.parties || [],
        requiredClauses: [],
        optionalClauses: [],
        language: "English",
        instructions: composedInstructions,
      },
      retrieval: {
        matchedTemplate: null,
        applicablePlaybookRules: [],
        fallbackClauses: [],
        historicalReferences: [],
      },
      context: null,
      draft: null,
      validation: null,
      riskReview: null,
      metadata: {
        generationParameters: {},
        playbookVersion: "1.0.0",
        timestamp: new Date().toISOString(),
      },
    };
  
    await updateJobProgress(jobId, userId, 50, "Invoking AI model core engine and validation checkpoints...");

    // 3. Pre-create the files row BEFORE launching the pipeline.
    //    draft_state_ledger has a FK → files(id), and saveStep (the last pipeline
    //    step) inserts into draft_state_ledger using targetDocId.  If the files row
    //    does not exist at that point the FK constraint fires.  We insert a
    //    placeholder here so the parent row is already present, then UPDATE it with
    //    the real encrypted content once generation finishes.
    const { email: creatorEmail } = await withTransaction(userId, 'USER', async (client) => {
      const { rows } = await client.query("SELECT email FROM users WHERE id = $1", [userId]);
      return { email: rows[0]?.email || "" };
    });

    await withTransaction(userId, 'USER', async (client) => {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [targetDocId, "Draft in progress...", "draft", "", userId, creatorEmail, false, JSON.stringify([]), JSON.stringify([])]
      );
    });

    // Always PAC drafting (CREATE).
    const finalizedState = await draftEntry.run(initialStateContainer);

    // PAC may pause for ASK (needs_input) without a finished document.
    // PacController already persisted the paused snapshot to draft_state_ledger.
    if (finalizedState.agent?.stoppedReason === "awaiting_user") {
      const docId =
        finalizedState.metadata?.persistedDocumentId ||
        finalizedState.request?.payloadFields?.documentId ||
        targetDocId;
      return {
        status: "needs_input",
        file_id: docId,
        openQuestions: finalizedState.agent.openQuestions,
        conversation: finalizedState.conversation,
      };
    }
    
    if (!finalizedState.draft?.formattedDocument) {
      throw new Error("Pipeline Execution Failure: Final document text block emerged empty from workflow engine.");
    }
  
    const documentContentResult = finalizedState.draft.formattedDocument;
  
    // 5. Resolve the final title now that requirement extraction has run.
    // QUALITY_QUICKWIN: previous — `${contractType || "AI"} Agreement - ${new Date().toLocaleDateString()}`
    // which produced noisy titles like "Mutual NDA - Vendor Infrastructure Host Agreement - 24/7/2026"
    // The contract type is now derived by step 1 (requirement extraction), not the UI feed.
    const legalTitle = resolveLegalDocumentTitle(
      finalizedState.requirements?.contractType
    );
    const title = `${legalTitle} - ${new Date().toLocaleDateString("en-US")}`;
  
    const encryptedContent = encryptData(documentContentResult);
  
    // 6. Update the placeholder files row with the real content, then insert the
    //    initial document version.  Using UPDATE here avoids a duplicate-key error
    //    in case the pipeline's saveStep already touched the files row indirectly.
    await withTransaction(userId, 'USER', async (client) => {
      await client.query(
        `UPDATE files
         SET title = $1, content = $2, is_encrypted = $3, updated_at = NOW()
         WHERE id = $4`,
        [title, encryptedContent, true, targetDocId]
      );
  
      const versionId = "ver_" + crypto.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, targetDocId, encryptedContent]
      );
    });
  
    // 6. Index output arrays natively for background RAG search contexts
    // chunkAndIndexDocument(targetDocId, documentContentResult, userId).catch((err) =>
    //   console.warn(`[DraftingHandler/Initial] Vector indexing routine bypassed for ${targetDocId}:`, err)
    // );
  
    return { content: documentContentResult, file_id: targetDocId, version: 1 };
  }
  
/**
* FEATURE FEATURE 2: Human-Driven Document Modification & Refinement Loop
**/
async function handleRefinementJob(jobId: string, userId: string, payload: any): Promise<any> {
    const {
        documentId,
        instructions,
        highlightedText,
        text,
        refineType,
        param,
        currentVersion
    } = payload;

    await updateJobProgress(jobId, userId, 15, "Reconstituting pipeline memory context logs...");

    if (!documentId) {
        throw new Error("Refinement requires a documentId to restore draft state memory.");
    }

    let functionalInstruction = instructions || "";
    if (!functionalInstruction && refineType) {
        if (refineType === "tone") functionalInstruction = `Rewrite the following legal text in a ${param} tone.`;
        else if (refineType === "grammar") functionalInstruction = "Fix the spelling and grammar in the following legal text while preserving legal meaning.";
        else if (refineType === "extend") functionalInstruction = "Expand the following legal clause with more comprehensive protections.";
        else if (refineType === "reduce") functionalInstruction = "Shorten the following legal clause to its core obligation.";
        else if (refineType === "simplify") functionalInstruction = "Rewrite the following legal text in plain English for a non-lawyer.";
        else if (refineType === "complete") functionalInstruction = "Complete the following sentence or clause in a professional legal manner.";
        else if (refineType === "ask") functionalInstruction = param;
    }

    if (!functionalInstruction) {
        throw new Error("Refinement requires instructions.");
    }

    const targetDocId = documentId;

    let historicalStateSnapshot: DraftState | null = null;
    let resolvedVersion = currentVersion || 1;

    try {
        const snapshotLookup = await pool.query(
            `SELECT state_snapshot_json, version
             FROM draft_state_ledger
             WHERE document_id = $1
             ORDER BY version DESC
             LIMIT 1`,
            [targetDocId]
        );

        if (snapshotLookup.rows.length > 0) {
            historicalStateSnapshot = snapshotLookup.rows[0].state_snapshot_json as DraftState;
            resolvedVersion = snapshotLookup.rows[0].version;
        }
    } catch (dbErr) {
        console.warn(`[DraftingHandler/Refine] Snapshot trace lookup bypassed for database row ${targetDocId}:`, dbErr);
    }

    // highlightedText identifies the user's edit target; it is never the source
    // document itself. Refinement returns and persists a complete document, so
    // always rebuild that document from the latest snapshot/file (with `text` as
    // a legacy full-document fallback).
    let documentText = text || "";

    if (historicalStateSnapshot) {
        documentText = historicalStateSnapshot.draft?.formattedDocument || text || "";
    } else {
        try {
            const fileLookup = await withTransaction(userId, "USER", async (client) => {
                const { rows } = await client.query(
                    "SELECT content, is_encrypted FROM files WHERE id = $1",
                    [targetDocId]
                );
                return rows[0];
            });

            if (fileLookup?.content) {
                const fileContent = fileLookup.is_encrypted
                    ? decryptData(fileLookup.content)
                    : fileLookup.content;
                documentText = fileContent || text || "";
            }
        } catch (fileErr) {
            console.warn(`[DraftingHandler/Refine] File content lookup bypassed for ${targetDocId}:`, fileErr);
        }
    }

    if (!documentText) {
        throw new Error(`No draft content found for document ${targetDocId}.`);
    }

    const nextVersionNumber = resolvedVersion + 1;

    const previousRequest = historicalStateSnapshot?.request;
    const previousPayloadFields = previousRequest?.payloadFields ?? {};

    const inputStateContainer: DraftState = historicalStateSnapshot
        ? {
            ...historicalStateSnapshot,
            onProgress: async (percent, message) => {
                await updateJobProgress(jobId, userId, percent, message);
            },
            request: {
                ...(previousRequest ?? {}),
                intent: "REFINEMENT",
                rawInstructions: functionalInstruction,
                highlightedText,
                payloadFields: {
                    ...previousPayloadFields,
                    documentId: targetDocId
                }
            },
            retrieval: historicalStateSnapshot.retrieval,
            draft: {
                rawOutput: historicalStateSnapshot.draft?.rawOutput ?? documentText,
                formattedDocument: documentText,
                // Carry structured sections so surgical refine can localize edits;
                // reparse from text if an older snapshot predates the sections field.
                sections: historicalStateSnapshot.draft?.sections ?? parseSections(documentText),
                version: nextVersionNumber,
                parentVersionId: historicalStateSnapshot.draft?.parentVersionId
            },
            history: historicalStateSnapshot.history ?? [],
            validation: null,
            riskReview: null
        }
        : {
            onProgress: async (percent, message) => {
                await updateJobProgress(jobId, userId, percent, message);
            },
            request: {
                intent: "REFINEMENT",
                rawInstructions: functionalInstruction,
                highlightedText,
                sourceText: documentText,
                payloadFields: { documentId: targetDocId }
            },
            requirements: {
                contractType: "General",
                jurisdiction: "Unspecified",
                industry: "General",
                parties: [],
                requiredClauses: [],
                optionalClauses: [],
                language: "English",
                instructions: functionalInstruction
            },
            retrieval: {
                matchedTemplate: null,
                applicablePlaybookRules: [],
                fallbackClauses: [],
                historicalReferences: []
            },
            context: null,
            draft: {
                rawOutput: documentText,
                version: nextVersionNumber,
                formattedDocument: documentText,
                sections: parseSections(documentText)
            },
            validation: null,
            riskReview: null,
            metadata: {
                generationParameters: {},
                playbookVersion: "1.0.0",
                timestamp: new Date().toISOString()
            }
        };
  
    await updateJobProgress(jobId, userId, 45, "Executing adjustments and evaluating risk variables...");

    const refineState: DraftState = {
      ...inputStateContainer,
      entryMode: "HUMAN_REFINE",
      conversation: historicalStateSnapshot?.conversation,
      plan: historicalStateSnapshot?.plan,
      structuredFacts: historicalStateSnapshot?.structuredFacts,
      exhibits: historicalStateSnapshot?.exhibits,
    };

    const finalizedState = await draftEntry.run(refineState);
    const refinedTextOutputResult = finalizedState.draft?.formattedDocument || documentText;
  
    // 5. Query user data elements for application files sync
    const title = `Refined Text - ${new Date().toLocaleDateString()}`;
    const { email: creatorEmail } = await withTransaction(userId, 'USER', async (client) => {
      const { rows } = await client.query("SELECT email FROM users WHERE id = $1", [userId]);
      return { email: rows[0]?.email || "" };
    });
  
    const encryptedContent = encryptData(refinedTextOutputResult);
  
    // 6. Overwrite files data records and commit a new entry row to versions table
    await withTransaction(userId, 'USER', async (client) => {
      if (!documentId) {
        await client.query(
          `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [targetDocId, title, "draft", encryptedContent, userId, creatorEmail, true, JSON.stringify([]), JSON.stringify([])]
        );
      } else {
        await client.query(
          "UPDATE files SET content = $1, title = $2, updated_at = NOW() WHERE id = $3",
          [encryptedContent, title, targetDocId]
        );
      }
  
      const versionId = "ver_" + crypto.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, targetDocId, encryptedContent]
      );
    });
  
    // 7. Update vector database partitions asynchronously
    chunkAndIndexDocument(targetDocId, refinedTextOutputResult, userId).catch((err) =>
      console.warn(`[DraftingHandler/Refine] Vector matrix indexing failed for document ${targetDocId}:`, err)
    );
  
    return { data: refinedTextOutputResult, file_id: targetDocId, version: nextVersionNumber };
  }

async function handleResumeAskJob(jobId: string, userId: string, payload: any): Promise<any> {
  const { documentId, answers } = payload;
  if (!documentId) throw new Error("RESUME_ASK requires documentId");
  if (!answers || typeof answers !== "object") throw new Error("RESUME_ASK requires answers map");

  await updateJobProgress(jobId, userId, 10, "Resuming drafting with your answers...");

  const snapshotLookup = await pool.query(
    `SELECT state_snapshot_json, version
     FROM draft_state_ledger
     WHERE document_id = $1
     ORDER BY version DESC
     LIMIT 1`,
    [documentId]
  );

  if (!snapshotLookup.rows.length) {
    throw new Error(`No paused draft state found for ${documentId}`);
  }

  const raw = snapshotLookup.rows[0].state_snapshot_json as DraftState;
  // Snapshots omit runtime callbacks; restore request shell if an older row lacks it.
  let state: DraftState = {
    requirements: null,
    retrieval: {
      matchedTemplate: null,
      applicablePlaybookRules: [],
      fallbackClauses: [],
      historicalReferences: [],
    },
    context: null,
    draft: null,
    validation: null,
    riskReview: null,
    metadata: {
      generationParameters: {},
      playbookVersion: "1.0.0",
      timestamp: new Date().toISOString(),
    },
    ...raw,
    request: {
      intent: "CREATE",
      rawInstructions: "",
      ...(raw.request ?? {}),
      payloadFields: {
        documentId,
        ...(raw.request?.payloadFields ?? {}),
      },
    },
  };

  state = {
    ...applyUserAnswers(state, answers),
    onProgress: async (percent, message) => {
      await updateJobProgress(jobId, userId, percent, message);
    },
    onToken: (delta) => {
      jobRegistry.broadcastToken(userId, jobId, delta);
    },
  };

  const finalizedState = await draftEntry.resumeAfterAsk(state);

  if (finalizedState.agent?.stoppedReason === "awaiting_user") {
    return {
      status: "needs_input",
      file_id: documentId,
      openQuestions: finalizedState.agent.openQuestions,
      conversation: finalizedState.conversation,
    };
  }

  if (!finalizedState.draft?.formattedDocument) {
    throw new Error("Resume failed: empty document after PAC run");
  }

  const documentContentResult = finalizedState.draft.formattedDocument;
  const legalTitle = resolveLegalDocumentTitle(finalizedState.requirements?.contractType);
  const title = `${legalTitle} - ${new Date().toLocaleDateString("en-US")}`;
  const encryptedContent = encryptData(documentContentResult);

  await withTransaction(userId, "USER", async (client) => {
    await client.query(
      `UPDATE files SET title = $1, content = $2, is_encrypted = $3, updated_at = NOW() WHERE id = $4`,
      [title, encryptedContent, true, documentId]
    );
    const versionId = "ver_" + crypto.randomUUID();
    await client.query(`INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`, [
      versionId,
      documentId,
      encryptedContent,
    ]);
  });

  return {
    content: documentContentResult,
    file_id: documentId,
    version: finalizedState.draft.version,
  };
}

// Main execulatable function used in main JobQueue.ts
export async function executeTemplateDrafting(jobId: string, userId: string, payload: any) {
  if (payload.intent === "RESUME_ASK") {
    return await handleResumeAskJob(jobId, userId, payload);
  }

  if (
    payload.intent === "REFINEMENT" ||
    payload.type === "REFINEMENT" ||
    payload.type === "refine"
  ) {
    return await handleRefinementJob(jobId, userId, payload);
  }

  return await handleInitialDraftingJob(jobId, userId, payload);
}