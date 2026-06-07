import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { addJobToQueue } from "../services/jobQueue.js";
import { buildPdfBuffer, buildDocxBuffer } from "../services/exportService.js";
import { encryptData, decryptData } from "../utils/crypto.js";
import { withTransaction } from "../utils/dbUtils.js";
import crypto from "crypto";
import * as diff from "diff";

export const getDocuments = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const userEmail = req.user!.email.toLowerCase();

  try {
    const docs = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM files WHERE creator_id = $1 OR shared_with::jsonb @> $2::jsonb ORDER BY created_at DESC",
        [userId, JSON.stringify([userEmail])]
      );
      return rows;
    });

    const formattedDocs = docs.map((r: any) => ({
      ...r,
      content: r.is_encrypted ? decryptData(r.content) : r.content,
      isEncrypted: r.is_encrypted,
      signatures: r.signatures || [],
      redlines: r.redlines || [],
      sharedWith: r.shared_with || [],
      auditLogs: r.audit_logs || [],
    }));
    return res.json(formattedDocs);
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
          content: decryptData(v.content),
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

  const id = "doc_" + crypto.randomUUID();
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

  const { title, folder_id } = req.body;
  const fileId = "doc_" + crypto.randomUUID();
  const fileTitle = title || file.originalname;

  try {
    await pool.query(
      `INSERT INTO files (id, title, type, content, creator_id, creator_email, mime_type, folder_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [fileId, fileTitle, "upload", "", req.user!.id, req.user!.email, file.mimetype, folder_id || null]
    );

    const job = await addJobToQueue(req.user!.id, "file_processing", {
      fileId,
      fileTitle,
      fileBufferBase64: file.buffer.toString("base64"),
      mimeType: file.mimetype,
      folder_id: folder_id || null,
      creatorEmail: req.user!.email
    });

    res.status(202).json({ success: true, job_id: job.id, file_id: fileId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const createRedline = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { originalText, proposedText, comment } = req.body;
  try {
    const { rows } = await pool.query("SELECT redlines FROM files WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Document not found" });
    const redlines = rows[0].redlines || [];
    const newRedline = { id: crypto.randomUUID(), originalText, proposedText, comment, proposedByEmail: req.user!.email, proposedAt: new Date().toISOString(), status: "pending" };
    redlines.push(newRedline);
    await pool.query("UPDATE files SET redlines = $1 WHERE id = $2", [JSON.stringify(redlines), id]);
    res.status(201).json(newRedline);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const acceptRedline = async (req: Request, res: Response) => {
  const { id, redlineId } = req.params;
  try {
    const { rows } = await pool.query("SELECT * FROM files WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Document not found" });

    const doc = rows[0];
    const redlines = doc.redlines || [];
    const index = redlines.findIndex((r: any) => r.id === redlineId);
    if (index === -1) return res.status(404).json({ error: "Redline not found" });

    const currentContent = decryptData(doc.content);
    const proposal = redlines[index];

    // Use resilient patch-and-apply logic instead of simple .replace()
    // 1. Create a patch from the original vs proposed text
    const patch = diff.createPatch("content", proposal.originalText, proposal.proposedText);

    // 2. Apply the patch to the full document content
    const applied = diff.applyPatch(currentContent, patch);

    if (applied === false) {
      // Fallback: If patch fails (due to minor context shift), attempt direct replacement
      const fallbackReplaced = currentContent.replace(proposal.originalText, proposal.proposedText);
      if (fallbackReplaced === currentContent && currentContent.indexOf(proposal.originalText) === -1) {
        return res.status(400).json({ error: "Could not apply redline. Document structure has changed significantly." });
      }

      redlines[index].status = "accepted";
      await pool.query("UPDATE files SET content = $1, redlines = $2 WHERE id = $3", [encryptData(fallbackReplaced), JSON.stringify(redlines), id]);
    } else {
      redlines[index].status = "accepted";
      await pool.query("UPDATE files SET content = $1, redlines = $2 WHERE id = $3", [encryptData(applied), JSON.stringify(redlines), id]);
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("Failed to accept redline:", err);
    res.status(500).json({ error: err.message });
  }
};

export const rejectRedline = async (req: Request, res: Response) => {
  const { id, redlineId } = req.params;
  try {
    const { rows } = await pool.query("SELECT redlines FROM files WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Document not found" });
    const redlines = rows[0].redlines || [];
    const index = redlines.findIndex((r: any) => r.id === redlineId);
    if (index === -1) return res.status(404).json({ error: "Redline not found" });
    redlines[index].status = "rejected";
    await pool.query("UPDATE files SET redlines = $1 WHERE id = $2", [JSON.stringify(redlines), id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
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
