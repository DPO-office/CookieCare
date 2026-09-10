import { addJobToQueue } from "../../../services/jobQueue.js";
import { Request, Response } from "express";
import {
  DraftRequestSchema,
  RefineRequestSchema,
  ResumeAskRequestSchema,
} from "./schema.js";
import { withTransaction } from "../../../utils/dbUtils.js";
import { encryptData, decryptData } from "../../../utils/crypto.js";
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

export const getDraftHistoryController = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const userRole = req.user!.role ?? "USER";
        const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 100);

        const rows = await withTransaction(userId, userRole, async (client) => {
            const { rows } = await client.query(
                `SELECT
                    j.id                                 AS job_id,
                    j.status,
                    j.created_at,
                    COALESCE(
                        NULLIF(j.payload->>'draftInstructions', ''),
                        NULLIF(j.payload->>'draftInput', ''),
                        'Untitled draft'
                    )                                    AS instruction,
                    COALESCE(j.result->>'file_id', j.result->>'documentId') AS document_id,
                    dsl.formatted_text                   AS formatted_text,
                    dsl.state_snapshot_json->'draft'->>'formattedDocument' AS formatted_document,
                    f.content                            AS file_content,
                    f.is_encrypted                       AS file_is_encrypted
                 FROM jobs j
                 LEFT JOIN LATERAL (
                     -- Fix: prefer the highest version that has real content (non-empty
                     -- formatted_text) over a bare ASK-pause snapshot (version=0,
                     -- formatted_text='').  Without this, a draft whose ASK resume
                     -- succeeded would still return the version=0 empty row because
                     -- plain ORDER BY version DESC does not skip empty-text rows.
                     SELECT formatted_text, state_snapshot_json
                     FROM draft_state_ledger d
                     WHERE d.document_id = COALESCE(j.result->>'file_id', j.result->>'documentId')
                     ORDER BY
                         CASE WHEN d.formatted_text IS NOT NULL
                                   AND d.formatted_text <> ''
                              THEN 0 ELSE 1 END,
                         d.version DESC
                     LIMIT 1
                 ) dsl ON true
                 LEFT JOIN files f
                    ON f.id = COALESCE(j.result->>'file_id', j.result->>'documentId')
                 WHERE j.user_id = current_setting('app.current_user_id', true)
                   AND j.type = 'template_drafting'
                   AND (j.payload->>'intent' IS NULL OR j.payload->>'intent' = 'CREATE')
                   AND j.status IN ('completed', 'failed')
                 ORDER BY j.created_at DESC
                 LIMIT $1`,
                [limit]
            );
            return rows;
        });

        const history = rows.map((r: any) => {
            // Resolve content using a three-tier fallback:
            // 1. formatted_text from draft_state_ledger (best — already plain text/HTML)
            // 2. formattedDocument extracted from state_snapshot_json
            // 3. files.content — the saved document, decrypted if needed
            //
            // Fix: use .trim() so an empty-string or whitespace-only formatted_text
            // (written by the ASK-pause saveStep) is treated as no-content and the
            // chain falls through to the next tier rather than stopping at a falsy "".
            let resolvedContent: string | null =
                r.formatted_text?.trim() || r.formatted_document?.trim() || null;

            if (!resolvedContent && r.file_content) {
                try {
                    const raw = r.file_is_encrypted
                        ? decryptData(String(r.file_content))
                        : String(r.file_content);
                    // Only accept non-empty decrypted content — a placeholder files row
                    // created before the pipeline ran stores "" and must not be returned
                    // as content (it would cause a blank editor instead of the
                    // "content unavailable" message).
                    resolvedContent = raw.trim() || null;
                } catch {
                    resolvedContent = null;
                }
            }

            return {
                jobId:          String(r.job_id),
                documentId:     r.document_id || null,
                title:          String(r.instruction || "Untitled draft").slice(0, 120).replace(/\n[\s\S]*/g, "").trim(),
                status:         String(r.status),
                createdAt:      String(r.created_at),
                formatted_text: resolvedContent,
            };
        });

        res.json({ history });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteDraftHistoryController = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const userRole = req.user!.role;
        const jobId = String(req.params.jobId || "");
        if (!jobId) { res.status(400).json({ error: "jobId required" }); return; }

        await withTransaction(userId, userRole, async (client) => {
            const result = await client.query(
                `DELETE FROM jobs
                 WHERE id = $1
                   AND type = 'template_drafting'
                   AND user_id = current_setting('app.current_user_id', true)`,
                [jobId]
            );
            if (result.rowCount === 0) throw new Error("NOT_FOUND");
        });

        res.json({ success: true });
    } catch (err: any) {
        if (err.message === "NOT_FOUND") { res.status(404).json({ error: "History entry not found." }); return; }
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
