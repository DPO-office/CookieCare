import { addJobToQueue } from "../../../services/jobQueue.js";
import { Request, Response } from "express";
import { DraftRequestSchema, RefineRequestSchema } from "./schema.js";
import { withTransaction } from "../../../utils/dbUtils.js";
import { encryptData } from "../../../utils/crypto.js";
import crypto from "crypto";
import pdf from "pdf-parse-fork";
import mammoth from "mammoth";

async function extractTextFromFileBuffer(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === "application/pdf") {
        const data = await pdf(buffer);
        return data.text;
    }

    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const data = await mammoth.extractRawText({ buffer });
        return data.value;
    }

    if (mimeType.startsWith("text/")) {
        return buffer.toString("utf-8");
    }

    return buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
}

export const draftRouteController = async (req: Request, res: Response): Promise<void> => {
    try {
        const request = DraftRequestSchema.safeParse(req.body);

        if (!request.success) {
            res.status(400).json({
                error: "Invalid request payload",
                details: request.error.flatten()
            });
            return;
        }

        const job = await addJobToQueue(req.user!.id, "template_drafting", request.data);
        res.status(202).json({ success: true, job_id: job.id });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const refineRouteController = async (req: Request, res: Response): Promise<void> => {
    try {
        const request = RefineRequestSchema.safeParse(req.body);

        if (!request.success) {
            res.status(400).json({
                error: "Invalid refinement payload",
                details: request.error.flatten()
            });
            return;
        }

        const { documentId, instructions, highlightedText } = request.data;

        const job = await addJobToQueue(req.user!.id, "template_drafting", {
            intent: "REFINEMENT",
            documentId,
            instructions,
            highlightedText
        });

        res.status(202).json({ success: true, job_id: job.id });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const processUploadedTemplateController = async (req: Request, res: Response): Promise<void> => {
    try {
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: "No file uploaded. Send multipart/form-data with a 'file' field." });
            return;
        }

        const allowedMimeTypes = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "text/markdown"
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            res.status(400).json({ error: "Unsupported file type. Only PDF, DOCX, and TXT are permitted." });
            return;
        }

        const rawText = (await extractTextFromFileBuffer(file.buffer, file.mimetype)).replace(/\0/g, "").trim();
        if (!rawText) {
            res.status(400).json({ error: "Could not extract readable text from the uploaded file." });
            return;
        }

        const sourceDocumentId = "doc_" + crypto.randomUUID();
        const title = file.originalname || `Reactive Source - ${new Date().toLocaleDateString()}`;
        const userId = req.user!.id;
        const encryptedContent = encryptData(rawText);

        await withTransaction(userId, "USER", async (client) => {
            await client.query(
                `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    sourceDocumentId,
                    title,
                    "source_template",
                    encryptedContent,
                    userId,
                    req.user!.email,
                    true,
                    JSON.stringify([]),
                    JSON.stringify([])
                ]
            );

            const versionId = "ver_" + crypto.randomUUID();
            await client.query(
                `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
                [versionId, sourceDocumentId, encryptedContent]
            );
        });

        res.status(201).json({ success: true, sourceDocumentId });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};
