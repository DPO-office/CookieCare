import { pool } from "../../../config/database.js";
import { ClauseIngester } from "../../../modules/drafting/services/clause-ingester.js";
import { extractIngestText } from "../../../modules/drafting/utils/ingest-text.js";

async function updateJobProgress(
  jobId: string,
  userId: string,
  percentage: number,
  message: string
): Promise<void> {
  await pool.query(
    `UPDATE jobs SET progress = $1, message = $2, status = 'PROCESSING', updated_at = NOW() WHERE id = $3;`,
    [percentage, message, jobId]
  );
  const { jobRegistry } = await import("../../jobQueue.js");
  jobRegistry.broadcast(userId, {
    id: jobId,
    progress: percentage,
    message,
    status: "processing",
  });
}

async function updateLibraryStage(
  libraryItemId: string | undefined,
  description: string,
  stage: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  if (!libraryItemId) return;
  await pool
    .query(
      `UPDATE library_items
       SET description = $1,
           details = $2
       WHERE id = $3`,
      [
        description,
        JSON.stringify({ status: "processing", stage, ...extra }),
        libraryItemId,
      ]
    )
    .catch(() => {
      /* non-fatal */
    });
}

export async function executeClauseIngestionJob(
  jobId: string,
  userId: string,
  payload: any
): Promise<any> {
  const { contractType, jurisdiction, fileId, fileTitle, libraryItemId } =
    payload ?? {};

  try {
    const resolvedType =
      contractType && String(contractType).trim()
        ? String(contractType).trim()
        : "General";

    await updateJobProgress(jobId, userId, 10, "Extracting clause pack text…");
    await updateLibraryStage(
      libraryItemId,
      `${resolvedType} clause pack — extracting text…`,
      "extracting",
      {
        isPack: true,
        sourceFileId: fileId || null,
        contractType: resolvedType,
      }
    );

    const { text } = await extractIngestText(payload);

    await updateJobProgress(jobId, userId, 40, "Structuring clauses with AI…");
    await updateLibraryStage(
      libraryItemId,
      `${resolvedType} clause pack — structuring with AI…`,
      "structuring",
      {
        isPack: true,
        sourceFileId: fileId || null,
        contractType: resolvedType,
      }
    );

    const ingester = new ClauseIngester();
    const result = await ingester.ingestClauseText(text, {
      contractType: resolvedType,
      userId,
      sourceFileId: fileId,
      jurisdiction: jurisdiction ? String(jurisdiction).trim() : undefined,
    });

    if (libraryItemId) {
      await pool.query(
        `UPDATE library_items
         SET description = $1,
             tags = $2,
             details = $3
         WHERE id = $4`,
        [
          `${resolvedType} clause pack — ${result.processedClausesCount} clauses ready`,
          `${resolvedType}, ready`,
          JSON.stringify({
            status: "ready",
            isPack: true,
            contractType: resolvedType,
            sourceFileId: fileId || null,
            fileTitle: fileTitle || null,
            processedClausesCount: result.processedClausesCount,
            clauseLibraryItemIds: result.libraryItemIds,
          }),
          libraryItemId,
        ]
      );
    }

    await pool.query(
      `UPDATE jobs
       SET status = $1, progress = $2, message = $3, result = $4, updated_at = NOW()
       WHERE id = $5;`,
      [
        "COMPLETED",
        100,
        "Successfully structured and stored clause library items.",
        JSON.stringify({
          contractType: resolvedType,
          fileTitle,
          processedClausesCount: result.processedClausesCount,
          libraryItemIds: result.libraryItemIds,
          packLibraryItemId: libraryItemId || null,
        }),
        jobId,
      ]
    );

    return result;
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (libraryItemId) {
      await pool
        .query(
          `UPDATE library_items
           SET description = $1,
               tags = $2,
               details = $3
           WHERE id = $4`,
          [
            "Clause pack — structuring failed",
            "clauses, failed",
            JSON.stringify({
              status: "failed",
              isPack: true,
              error: errorMessage,
              sourceFileId: fileId || null,
            }),
            libraryItemId,
          ]
        )
        .catch(() => {
          /* non-fatal */
        });
    }

    await pool.query(
      `UPDATE jobs
       SET status = $1, message = $2, error = $3, updated_at = NOW()
       WHERE id = $4;`,
      [
        "FAILED",
        "Clause ingestion failed while extracting or structuring the payload.",
        errorMessage,
        jobId,
      ]
    );
    throw err;
  }
}
