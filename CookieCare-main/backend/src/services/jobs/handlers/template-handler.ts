import { pool } from "../../../config/database.js";
import { TemplateIngester } from "../../../modules/drafting/services/template-ingester.js";
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

export async function executeTemplateIngestionJob(
  jobId: string,
  userId: string,
  payload: any
): Promise<any> {
  const { contractType, jurisdiction, fileId, fileTitle, libraryItemId } =
    payload ?? {};

  try {
    if (!contractType || !String(contractType).trim()) {
      throw new Error("Template ingestion requires an explicit contractType.");
    }

    const tplType = String(contractType).trim();
    await updateJobProgress(jobId, userId, 10, "Extracting template document text…");
    await updateLibraryStage(
      libraryItemId,
      `${tplType} template — extracting text…`,
      "extracting",
      {
        sourceFileId: fileId || null,
        contractType: tplType,
        jurisdiction: jurisdiction ? String(jurisdiction).trim() : null,
      }
    );

    const { text } = await extractIngestText(payload);

    await updateJobProgress(jobId, userId, 40, "Normalizing template with AI…");
    await updateLibraryStage(
      libraryItemId,
      `${tplType} template — normalizing with AI…`,
      "normalizing",
      {
        sourceFileId: fileId || null,
        contractType: tplType,
        jurisdiction: jurisdiction ? String(jurisdiction).trim() : null,
      }
    );

    const ingester = new TemplateIngester();
    const result = await ingester.ingestTemplateText(text, {
      contractType: tplType,
      userId,
      sourceFileId: fileId,
      fileTitle: fileTitle ? String(fileTitle) : undefined,
      jurisdiction: jurisdiction ? String(jurisdiction).trim() : undefined,
      libraryItemId: libraryItemId || undefined,
    });

    await pool.query(
      `UPDATE jobs
       SET status = $1, progress = $2, message = $3, result = $4, updated_at = NOW()
       WHERE id = $5;`,
      [
        "COMPLETED",
        100,
        "Successfully stored contract template in the vault library.",
        JSON.stringify({
          contractType,
          fileTitle,
          templateId: result.templateId,
          libraryItemId: result.libraryItemId,
          name: result.name,
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
            "Template — normalization failed",
            "template, failed",
            JSON.stringify({
              status: "failed",
              error: errorMessage,
              sourceFileId: fileId || null,
              contractType: contractType || null,
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
        "Template ingestion failed while extracting or normalizing the payload.",
        errorMessage,
        jobId,
      ]
    );
    throw err;
  }
}
