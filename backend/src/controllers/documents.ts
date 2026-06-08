import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { addJobToQueue } from "../services/jobQueue.js";
import { withTransaction } from "../utils/dbUtils.js";
import { buildPdfBuffer, buildDocxBuffer } from "../services/exportService.js";
import { encryptData, decryptData } from "../utils/crypto.js";
import crypto from "crypto";
import * as diff from "diff";

export const getDocuments = async (req: Request, res: Response) => {
  const userEmail = req.user!.email.toLowerCase();
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    const docs = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM files WHERE creator_id = current_setting('app.current_user_id', true) OR shared_with::jsonb @> $1::jsonb ORDER BY created_at DESC",
        [JSON.stringify([userEmail])]
      );
      return rows;
    }).catch(e => {
      console.error("Failed to fetch documents from DB:", e);
      throw new Error("DB_FETCH_FAILED");
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
    const message = err.message === "DB_FETCH_FAILED" ? "Security enclave database unreachable." : "Internal error fetching document repository.";
    res.status(500).json({ error: message });
  }
};

export const getDocumentById = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT * FROM files WHERE id = $1", [req.params.id]);
      return rows;
    });

    if (rows.length > 0) {
      const r = rows[0];

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
  const userRole = req.user!.role;
  const email = req.user!.email;

  const id = "doc_" + crypto.randomUUID();
  const encryptedContent = encryptData(content || "");

  try {
    await withTransaction(userId, userRole, async (client) => {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, versions, shared_with, audit_logs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, title, type, encryptedContent, userId, email, true, JSON.stringify([]), JSON.stringify([]), JSON.stringify([])]
      );
    });
    res.status(201).json({ id, title, type });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const uploadDocument = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded. Verify multipart/form-data boundary." });

  // Security Layer: Basic file integrity and MIME checks
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'application/msword'
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return res.status(400).json({ error: "Unsupported file type. Only PDF, DOCX, and TXT are permitted for legal indexing." });
  }

  if (file.size > 25 * 1024 * 1024) { // 25MB limit
    return res.status(400).json({ error: "File size exceeds 25MB security threshold." });
  }

  const { title, folder_id } = req.body;
  const fileId = "doc_" + crypto.randomUUID();
  const fileTitle = title || file.originalname;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    await withTransaction(userId, userRole, async (client) => {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, mime_type, folder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [fileId, fileTitle, "upload", "", req.user!.id, req.user!.email, file.mimetype, folder_id || null]
      );
    }).catch(e => {
      console.error("Database insert failed during upload:", e);
      throw new Error("DB_UPLOAD_FAILED");
    });

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
    console.error("Document upload route crash:", err);
    const message = err.message === "DB_UPLOAD_FAILED" ? "Failed to register upload in security log." : "Internal error during background job queueing.";
    res.status(500).json({ error: message });
  }
};

export const createRedline = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { originalText, proposedText, comment } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    const newRedline = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT redlines FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      const redlines = rows[0].redlines || [];
      const redline = { id: crypto.randomUUID(), originalText, proposedText, comment, proposedByEmail: req.user!.email, proposedAt: new Date().toISOString(), status: "pending" };
      redlines.push(redline);
      await client.query("UPDATE files SET redlines = $1 WHERE id = $2", [JSON.stringify(redlines), id]);
      return redline;
    });
    res.status(201).json(newRedline);
  } catch (err: any) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};

export const acceptRedline = async (req: Request, res: Response) => {
  const { id, redlineId } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT * FROM files WHERE id = $1", [id]);
      return rows;
    });

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
      await withTransaction(req.user!.id, req.user!.role, async (client) => {
        await client.query("UPDATE files SET content = $1, redlines = $2 WHERE id = $3", [encryptData(fallbackReplaced), JSON.stringify(redlines), id]);
        await client.query(`
          INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
          VALUES ($1, $2, $3)
        `, [req.user!.id, 'redline_accept', JSON.stringify({ documentId: id, redlineId })]);
      });
    } else {
      redlines[index].status = "accepted";
      await withTransaction(req.user!.id, req.user!.role, async (client) => {
        await client.query("UPDATE files SET content = $1, redlines = $2 WHERE id = $3", [encryptData(applied), JSON.stringify(redlines), id]);
        await client.query(`
          INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
          VALUES ($1, $2, $3)
        `, [req.user!.id, 'redline_accept', JSON.stringify({ documentId: id, redlineId })]);
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("Failed to accept redline:", err);
    res.status(500).json({ error: err.message });
  }
};

export const rejectRedline = async (req: Request, res: Response) => {
  const { id, redlineId } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT redlines FROM files WHERE id = $1", [id]);
      return rows;
    });

    if (rows.length === 0) return res.status(404).json({ error: "Document not found" });
    const redlines = rows[0].redlines || [];
    const index = redlines.findIndex((r: any) => r.id === redlineId);
    if (index === -1) return res.status(404).json({ error: "Redline not found" });
    redlines[index].status = "rejected";
    await withTransaction(req.user!.id, req.user!.role, async (client) => {
      await client.query("UPDATE files SET redlines = $1 WHERE id = $2", [JSON.stringify(redlines), id]);

      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [req.user!.id, 'redline_reject', JSON.stringify({ documentId: id, redlineId })]);
    });

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const exportDocument = async (req: Request, res: Response) => {
  const { title, format, contentType, content, documentId } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    // Audit document export
    if (documentId) {
      await withTransaction(userId, userRole, async (client) => {
        await client.query(`
          INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
          VALUES ($1, $2, $3)
        `, [userId, 'document_export', JSON.stringify({ documentId, format, title })]);
      });
    }

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
