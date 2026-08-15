import { addJobToQueue } from "../../../services/jobQueue.js";
import { Request, Response } from "express";
import {
  DraftRequestSchema,
  RefineRequestSchema,
  ResumeAskRequestSchema,
} from "./schema.js";
import { withTransaction } from "../../../utils/dbUtils.js";
import { encryptData } from "../../../utils/crypto.js";
import crypto from "crypto";
import { extractText } from "../../../utils/extractText.js";
import { pool } from "../../../config/database.js";
import type { DraftState } from "../models/draft-state.js";

async function extractTextFromFileBuffer(buffer: Buffer, mimeType: string): Promise<string> {
    return extractText(buffer, mimeType);
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

export const resumeAskController = async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = ResumeAskRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid resume payload",
                details: parsed.error.flatten(),
            });
            return;
        }

        const job = await addJobToQueue(req.user!.id, "template_drafting", {
            intent: "RESUME_ASK",
            documentId: parsed.data.documentId,
            answers: parsed.data.answers,
        });
        res.status(202).json({ success: true, job_id: job.id });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const getConversationController = async (req: Request, res: Response): Promise<void> => {
    try {
        const documentId = String(req.params.documentId || "");
        if (!documentId) {
            res.status(400).json({ error: "documentId required" });
            return;
        }

        const { rows } = await pool.query(
            `SELECT state_snapshot_json
             FROM draft_state_ledger
             WHERE document_id = $1
             ORDER BY version DESC
             LIMIT 1`,
            [documentId]
        );

        if (!rows.length) {
            res.status(404).json({ error: "No draft state found" });
            return;
        }

        const snapshot = rows[0].state_snapshot_json as DraftState;
        res.json({
            success: true,
            conversation: snapshot.conversation ?? { documentId, organizationId: "", turns: [] },
        });
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
