import pdfParse from "pdf-parse";
import { pool } from "../../../config/database.js";
import { config } from "../../../config/index.js";
import { PlaybookIngester } from "../../../modules/drafting/services/playbook-ingester.js";

async function updateJobProgress(jobId: string, percentage: number, message: string): Promise<void> {
	await pool.query(
		"UPDATE jobs SET progress = $1, message = $2, status = 'PROCESSING', updated_at = NOW() WHERE id = $3;",
		[percentage, message, jobId]
	);
}

export async function handlePlaybookIngestionJob(jobId: string, userId: string, payload: any): Promise<void> {
	const { fileUrl, contractType } = payload ?? {};
    
	try {
        
        if (!fileUrl) {
                throw new Error("Playbook ingestion requires a fileUrl payload value.");
            }
		await updateJobProgress(jobId, 10, "Downloading file payload...");

		const response = await fetch(fileUrl);
		if (!response.ok) {
			throw new Error(`File download failed with status ${response.status} ${response.statusText}`);
		}

		const arrayBuffer = await response.arrayBuffer();
		const binaryBuffer = Buffer.from(arrayBuffer);

		const parsedPdf = await pdfParse(binaryBuffer);
		const extractedTextString = parsedPdf.text ?? "";

		await updateJobProgress(jobId, 30, "PDF text extraction pass completed successfully...");
		await updateJobProgress(jobId, 50, "Passing text arrays to the AI Ingester engine...");

		const ingester = new PlaybookIngester();
		const ingestionResult = await ingester.ingestPlaybookText(extractedTextString);

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
					contractType,
					processedRulesCount: ingestionResult.processedRulesCount,
				}),
				jobId,
			]
		);
	} catch (err: any) {
		const errorMessage = err instanceof Error ? err.message : String(err);

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
