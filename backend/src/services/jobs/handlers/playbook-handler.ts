import { pool } from "../../../config/database.js";
import { PlaybookIngester } from "../../../modules/drafting/services/playbook-ingester.js";
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
  // Dynamic import avoids circular dependency with jobQueue (which imports this handler).
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

export async function executePlaybookIngestionJob(
  jobId: string,
  userId: string,
  payload: any
): Promise<any> {
  const { fileTitle, fileId, libraryItemId } = payload ?? {};

  try {
    await updateJobProgress(jobId, userId, 10, "Extracting playbook document text…");
    await updateLibraryStage(
      libraryItemId,
      "Company playbook — extracting text…",
      "extracting",
      { scope: "company", sourceFileId: fileId || null }
    );

    const { text: extractedTextString } = await extractIngestText(payload);

    await updateJobProgress(
      jobId,
      userId,
      35,
      "Text extracted — preparing AI structuring…"
    );
    await updateLibraryStage(
      libraryItemId,
      "Company playbook — preparing AI structuring…",
      "preparing",
      { scope: "company", sourceFileId: fileId || null }
    );

    await updateJobProgress(
      jobId,
      userId,
      50,
      "Structuring playbook rules with AI (often ~1 min)…"
    );
    await updateLibraryStage(
      libraryItemId,
      "Company playbook — structuring rules with AI…",
      "structuring",
      { scope: "company", sourceFileId: fileId || null }
    );

    const ingester = new PlaybookIngester();
    const ingestionResult = await ingester.ingestPlaybookText(extractedTextString, {
      libraryItemId,
      userId,
    });

    // Surface an empty extraction as a failure instead of silently reporting
    // "0 rules structured" — otherwise the rulebook looks ready but drives
    // nothing during negotiation.
    if (ingestionResult.processedRulesCount === 0) {
      throw new Error(
        "No rules could be extracted from this playbook. The document may be scanned/image-only or not structured as a playbook."
      );
    }

    await updateJobProgress(jobId, userId, 90, "Saving structured rules to the vault…");

    if (libraryItemId) {
      await pool.query(
        `UPDATE library_items
         SET description = $1,
             tags = $2,
             details = $3
         WHERE id = $4`,
        [
          `Company playbook — ${ingestionResult.processedRulesCount} rules structured`,
          "playbook, company",
          JSON.stringify({
            status: "ready",
            scope: "company",
            sourceFileId: fileId || null,
            processedRulesCount: ingestionResult.processedRulesCount,
            fileTitle: fileTitle || null,
          }),
          libraryItemId,
        ]
      );
    }

    await pool.query(
      `UPDATE jobs
       SET status = $1,
           progress = $2,
           message = $3,
           result = $4,
           updated_at = NOW()
       WHERE id = $5;`,
      [
        "COMPLETED",
        100,
        "Successfully structured and stored playbook guidelines!",
        JSON.stringify({
          scope: "company",
          libraryItemId: libraryItemId || null,
          processedRulesCount: ingestionResult.processedRulesCount,
        }),
        jobId,
      ]
    );
    return {
      ...ingestionResult,
      libraryItemId: libraryItemId || null,
    };
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (payload?.libraryItemId) {
      await pool
        .query(
          `UPDATE library_items
           SET description = $1,
               tags = $2,
               details = $3
           WHERE id = $4`,
          [
            "Company playbook — structuring failed",
            "playbook, failed",
            JSON.stringify({
              status: "failed",
              scope: "company",
              error: errorMessage,
              sourceFileId: payload?.fileId || null,
            }),
            payload.libraryItemId,
          ]
        )
        .catch(() => {
          /* non-fatal */
        });
    }

    await pool.query(
      `UPDATE jobs
       SET status = $1,
           message = $2,
           error = $3,
           updated_at = NOW()
       WHERE id = $4;`,
      [
        "FAILED",
        "Playbook ingestion failed while downloading, extracting, or structuring the PDF payload.",
        errorMessage,
        jobId,
      ]
    );

    throw err;
  }
}
