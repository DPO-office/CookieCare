import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { chunkAndIndexDocument } from "../RAG/ragService.js";
import { jobQueue } from "../services/jobQueue.js";
import { buildPdfBuffer, buildDocxBuffer } from "../services/exportService.js";
import { RedlineProposal, Version, AuditLog } from "../types/index.js";

const decryptData = (text: string) => {
  if (text.startsWith("LEXENC_")) {
    const rawBase64 = text.replace("LEXENC_", "");
    return Buffer.from(rawBase64, "base64").toString("utf-8");
  }
  return text;
};

const encryptData = (text: string) => {
  return "LEXENC_" + Buffer.from(text).toString("base64");
};

export const getDocuments = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userEmail = req.user!.email.toLowerCase();

  try {
    const { rows } = await pool.query(
      "SELECT * FROM files WHERE creator_id = $1 OR shared_with::jsonb @> $2::jsonb ORDER BY created_at DESC",
      [userId, JSON.stringify([userEmail])]
    );

    const docs = rows.map((r) => ({
      ...r,
      content: r.is_encrypted ? decryptData(r.content) : r.content,
      isEncrypted: r.is_encrypted,
      signatures: r.signatures || [],
      redlines: r.redlines || [],
      sharedWith: r.shared_with || [],
      auditLogs: r.audit_logs || [],
    }));
    return res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getDocumentById = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userEmail = req.user!.email.toLowerCase();

  try {
    const { rows } = await pool.query("SELECT * FROM files WHERE id = $1", [req.params.id]);
    if (rows.length > 0) {
      const r = rows[0];
      const isShared = r.shared_with.some((e: string) => e.toLowerCase() === userEmail);
      const isOwner = r.creator_id === userId;

      if (!isOwner && !isShared) {
        return res.status(403).json({ error: "Access denied to this document." });
      }

      const doc = {
        ...r,
        content: r.is_encrypted ? decryptData(r.content) : r.content,
        versions: (r.versions || []).map((v: any) => ({
          ...v,
          content: v.content.startsWith("LEXENC_") ? decryptData(v.content) : v.content,
        })),
        signatures: r.signatures || [],
        redlines: r.redlines || [],
        sharedWith: r.shared_with || [],
        auditLogs: r.audit_logs || [],
      };
      return res.json(doc);
    }
    res.status(404).json({ error: "Document not found." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const createDocument = async (req: Request, res: Response) => {
  const { title, type, content } = req.body;
  const userId = req.user!.id;
  const email = req.user!.email;

  const id = "doc_" + Math.random().toString(36).substr(2, 9);
  const encryptedContent = encryptData(content || "");

  try {
    await pool.query(
      `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, versions, shared_with, audit_logs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, title, type, encryptedContent, userId, email, true, JSON.stringify([]), JSON.stringify([]), JSON.stringify([])]
    );
    res.status(201).json({ id, title, type });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const uploadDocument = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const { title, templateType, folder_id } = req.body;
  const job = jobQueue.enqueue(req.user!.id, "file_processing", {
    fileTitle: title || file.originalname,
    fileBufferBase64: file.buffer.toString("base64"),
    mimeType: file.mimetype,
    folder_id: folder_id || null,
    creatorEmail: req.user!.email
  });

  res.status(202).json({ success: true, job_id: job.id });
};

export const exportDocument = async (req: Request, res: Response) => {
  const { title, format, contentType, content } = req.body;
  try {
    let buffer: Buffer;
    let mimeType: string;
    let filename: string;

    if (format === "pdf") {
      buffer = await buildPdfBuffer(title, contentType, content);
      mimeType = "application/pdf";
      filename = `${title}.pdf`;
    } else {
      buffer = await buildDocxBuffer(title, contentType, content);
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      filename = `${title}.docx`;
    }

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
