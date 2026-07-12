import { pool } from "../../../config/database.js";
import { chunkAndIndexDocument } from "../../../RAG/ragService.js"; 
import { encryptData } from "../../../utils/crypto.js";
import { withRetry } from "../../../utils/retry.js";
import { withTransaction } from "../../../utils/dbUtils.js";
import { openRouterComplete } from "../../openRouterClient.js";
import crypto from "crypto";
import { jobRegistry, updateJobProgress } from "../../jobQueue.js";
import { DraftMode, DraftState } from "../../../modules/drafting/models/draft-state.js";
import pdf from "pdf-parse-fork";
import { DraftWorkflowOrchestrator } from "../../../modules/drafting/workflows/draft-workflow.js";

async function extractTextFromStorageUrl(fileUrl: string): Promise<string> {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`File download failed with status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const parsedPdfData = await pdf(Buffer.from(arrayBuffer));
    return parsedPdfData.text;
  }


async function handleInitialDraftingJob(jobId: string, userId: string, payload: any): Promise<any> {
    const { mode, outputLevel, instructions, formFields, templateId, sourceText, playbookText, intent, fileUrl } = payload;
  
    await updateJobProgress(jobId, userId, 20, "Extracting compliance parameters and routing tracking slots...");
    const targetDocId = "doc_" + crypto.randomUUID();

    let resolvedSourceText: string | undefined = undefined;
  
    // 1. Calculate intent and profile execution paths
    if (intent === "REACTIVE" && fileUrl) {
        resolvedSourceText = await extractTextFromStorageUrl(fileUrl);
      }

      const evaluatedIntent: DraftMode = intent === "REACTIVE" || (resolvedSourceText && resolvedSourceText.trim())
      ? "REACTIVE"
      : "PROACTIVE";

      await updateJobProgress(jobId, userId, 25, "Structuring tracking context state blocks...");
  
    // 2. Standardize request data elements inside a valid DraftState footprint
    const initialStateContainer: DraftState = {
        request: {
          intent: evaluatedIntent, 
          mode: null, // we are using intent everywhere instead of mode        
          rawInstructions: instructions || "",
          sourceText: resolvedSourceText,
          templateId: templateId || undefined,
          formFields: formFields || {},
          payloadFields: { documentId: targetDocId }
        },
        requirements: null,
        retrieval: {
          matchedTemplate: null,
          applicablePlaybookRules: [],
          fallbackClauses: [],
          historicalReferences: []
        },
        context: null,
        draft: null,
        validation: null,
        riskReview: null,
        metadata: {
          generationParameters: {},
          playbookVersion: "1.0.0",
          timestamp: new Date().toISOString()
        }
      };
  
    await updateJobProgress(jobId, userId, 50, "Invoking AI model core engine and validation checkpoints...");

    const orchestrator = new DraftWorkflowOrchestrator()
  
    // 3. Dispatch straight to the central state loop pipeline running code
        const finalizedState = await orchestrator.executeInitialWorkflow(initialStateContainer);
    
    if (!finalizedState.draft?.formattedDocument) {
      throw new Error("Pipeline Execution Failure: Final document text block emerged empty from workflow engine.");
    }
  
    const documentContentResult = finalizedState.draft.formattedDocument;
  
    // 4. Fetch user records to update application file rows
    const title = `AI Draft - ${new Date().toLocaleDateString()}`;
    const { email: creatorEmail } = await withTransaction(userId, 'USER', async (client) => {
      const { rows } = await client.query("SELECT email FROM users WHERE id = $1", [userId]);
      return { email: rows[0]?.email || "" };
    });
  
    const encryptedContent = encryptData(documentContentResult);
  
    // 5. Commit structured text data seamlessly to your application's user tables
    await withTransaction(userId, 'USER', async (client) => {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [targetDocId, title, "draft", encryptedContent, userId, creatorEmail, true, JSON.stringify([]), JSON.stringify([])]
      );
  
      const versionId = "ver_" + crypto.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, targetDocId, encryptedContent]
      );
    });
  
    // 6. Index output arrays natively for background RAG search contexts
    chunkAndIndexDocument(targetDocId, documentContentResult, userId).catch((err) =>
      console.warn(`[DraftingHandler/Initial] Vector indexing routine bypassed for ${targetDocId}:`, err)
    );
  
    return { content: documentContentResult, file_id: targetDocId, version: 1 };
  }
  
/**
* FEATURE FEATURE 2: Human-Driven Document Modification & Refinement Loop
**/
async function handleRefinementJob(jobId: string, userId: string, payload: any): Promise<any> {
    const { text, refineType, param, documentId, currentVersion } = payload;
    
    await updateJobProgress(jobId, userId, 15, "Reconstituting pipeline memory context logs...");
  
    // 1. Standardize human raw feedback into clean functional directives
    let functionalInstruction = "";
    if (refineType === "tone") functionalInstruction = `Rewrite the following legal text in a ${param} tone.`;
    else if (refineType === "grammar") functionalInstruction = `Fix the spelling and grammar in the following legal text while preserving legal meaning.`;
    else if (refineType === "extend") functionalInstruction = `Expand the following legal clause with more comprehensive protections.`;
    else if (refineType === "reduce") functionalInstruction = `Shorten the following legal clause to its core obligation.`;
    else if (refineType === "simplify") functionalInstruction = `Rewrite the following legal text in plain English for a non-lawyer.`;
    else if (refineType === "complete") functionalInstruction = `Complete the following sentence or clause in a professional legal manner.`;
    else if (refineType === "ask") functionalInstruction = param;
  
    const targetDocId = documentId || "doc_" + crypto.randomUUID();
    const nextVersionNumber = (currentVersion || 1) + 1;
  
    // 2. State Restoration Step: Query the administrative ledger to recall prior snapshot data
    let historicalStateSnapshot: DraftState | null = null;
    try {
      const snapshotLookup = await pool.query(
        "SELECT state_snapshot_json FROM draft_state_ledger WHERE document_id = $1 AND version = $2 LIMIT 1",
        [targetDocId, currentVersion || 1]
      );
      if (snapshotLookup.rows.length > 0) {
        historicalStateSnapshot = snapshotLookup.rows[0].state_snapshot_json as DraftState;
      }
    } catch (dbErr) {
      console.warn(`[DraftingHandler/Refine] Snapshot trace lookup bypassed for database row ${targetDocId}:`, dbErr);
    }
  
    // 3. Unified Container Packing: Rebuild state array mapping current changes over old context templates
    const inputStateContainer: DraftState = historicalStateSnapshot
      ? {
          ...historicalStateSnapshot,
          request: {
            ...historicalStateSnapshot.request,
            rawInstructions: functionalInstruction,
            payloadFields: {
              ...historicalStateSnapshot.request.payloadFields,
              documentId: targetDocId,
            },
          },
          draft: {
            ...historicalStateSnapshot.draft,
            version: nextVersionNumber,
            rawOutput: historicalStateSnapshot.draft?.rawOutput ?? text,
            formattedDocument: text, // Pass current editor text down so validation checks can sweep it
          },
        }
      : {
          // Structural Fallback: If no ledger history tracking entry exists, instantiate default boundaries cleanly
          request: {
            intent: "PROACTIVE",
            mode: "Standard Template",
            rawInstructions: functionalInstruction,
            sourceText: text,
            payloadFields: { documentId: targetDocId },
          },
          requirements: {
            contractType: "General",
            jurisdiction: "Unspecified",
            industry: "General",
            parties: [],
            requiredClauses: [],
            optionalClauses: [],
            language: "English",
            instructions: functionalInstruction,
          },
          retrieval: {
            matchedTemplate: null,
            applicablePlaybookRules: [],
            fallbackClauses: [],
            historicalReferences: [],
          },
          context: null,
          draft: {
            rawOutput: text,
            version: nextVersionNumber,
            formattedDocument: text,
          },
          validation: null,
          riskReview: null,
          metadata: {
            generationParameters: {},
            playbookVersion: "1.0.0",
            timestamp: new Date().toISOString(),
          },
        };
  
    await updateJobProgress(jobId, userId, 45, "Executing adjustments and evaluating risk variables...");
    const orchestrator = new DraftWorkflowOrchestrator()

  
    // 4. Fire the modification loop pipeline running code
    const finalizedRefinedState = await orchestrator.executeHumanRefinementPipeline(inputStateContainer);
    const refinedTextOutputResult = finalizedRefinedState.draft?.formattedDocument || text;
  
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


export async function executeTemplateDrafting(jobId: string, userId: string, payload: any) {
  if (payload.type === "REFINEMENT"){
    return await handleRefinementJob(jobId,userId,payload)
  }

  return await handleInitialDraftingJob(jobId,userId,payload)

}