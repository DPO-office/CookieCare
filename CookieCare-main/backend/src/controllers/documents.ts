import { Request, Response } from "express";
import { pool } from "../config/database.js";
import { addJobToQueue } from "../services/jobQueue.js";
import { withTransaction } from "../utils/dbUtils.js";
import { buildPdfBuffer, buildDocxBuffer } from "../services/exportService.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import { chunkAndIndexDocument } from "../RAG/ragService.js";
import { getOrCreateDefaultFolder } from "./folders.js";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";

export const getDocuments = async (req: Request, res: Response) => {
  const userEmail = req.user!.email.toLowerCase();
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    const docs = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM files WHERE creator_id = current_setting('app.current_user_id', true) OR shared_with::jsonb @> $1::jsonb OR shared_with::jsonb @> $2::jsonb ORDER BY created_at DESC",
        [JSON.stringify([userEmail]), JSON.stringify([{ email: userEmail }])]
      );
      return rows;
    }).catch(e => {
      console.error("Failed to fetch documents from DB:", e);
      throw new Error("DB_FETCH_FAILED");
    });

    const formattedDocs = docs.map((r: any) => ({
      ...r,
      content: r.is_encrypted ? decrypt(r.content) : r.content,
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
    const doc = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT * FROM files WHERE id = $1", [req.params.id]);
      if (rows.length === 0) return null;

      const { rows: versionRows } = await client.query(
        "SELECT * FROM document_versions WHERE file_id = $1 ORDER BY created_at DESC",
        [req.params.id]
      );

      const r = rows[0];
      return {
        ...r,
        content: r.is_encrypted ? decrypt(r.content) : r.content,
        versions: versionRows.map((v: any) => ({
          id: v.id,
          content: decrypt(v.content),
          createdAt: v.created_at
        })),
        signatures: r.signatures || [],
        redlines: r.redlines || [],
        sharedWith: r.shared_with || [],
        auditLogs: r.audit_logs || [],
      };
    });

    if (doc) {
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
  const encryptedContent = encrypt(content || "");

  try {
    await withTransaction(userId, userRole, async (client) => {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, title, type, encryptedContent, userId, email, true, JSON.stringify([]), JSON.stringify([])]
      );

      const versionId = "ver_" + crypto.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, id, encryptedContent]
      );
    });

    // Index the document content for RAG retrieval (fire-and-forget, non-blocking)
    if (content && content.trim().length > 0) {
      chunkAndIndexDocument(id, content, userId).catch((err) =>
        console.warn(`[createDocument] Chunk indexing failed for ${id}:`, err)
      );
    }

    res.status(201).json({ id, title, type });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};  


// General file upload and playbook uploading job creation init here
export const uploadDocument = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded. Verify multipart/form-data boundary." });

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

  const type = await fileTypeFromBuffer(file.buffer);
  const detectedMime = type?.mime || file.mimetype;

  if (!allowedMimeTypes.includes(detectedMime)) {
    return res.status(400).json({ error: "File signature mismatch. Extension does not match content magic bytes." });
  }

  const { title, folder_id,contractType } = req.body;
  // For playbook
  const systemFileType = req.body.category?.trim().toLowerCase() || "upload";
  // Playbook validation rule stays simple
  if (systemFileType === "playbook" && (!contractType || !contractType.trim())) {
    return res.status(400).json({ error: "Playbook ingestion requires an explicit 'contractType' parameter." });
  }

  const fileId = "doc_" + crypto.randomUUID();
  const fileTitle = title || file.originalname;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  // If no folder_id is supplied, resolve (or create) the "Uploaded Documents" default folder.
  let resolvedFolderId: string;
  try {
    resolvedFolderId = folder_id && folder_id.trim() ? folder_id.trim() : await getOrCreateDefaultFolder(userId, userRole);
  } catch (folderErr) {
    console.error("[uploadDocument] Failed to resolve default folder:", folderErr);
    return res.status(500).json({ error: "Failed to resolve upload destination folder." });
  }

  try {
    await withTransaction(userId, userRole, async (client) => {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, mime_type, folder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [fileId, fileTitle, "upload", "", req.user!.id, req.user!.email, file.mimetype, resolvedFolderId]
      );
    }).catch(e => {
      console.error("Database insert failed during upload:", e);
      throw new Error("DB_UPLOAD_FAILED");
    });

    let job;

    if (systemFileType === "playbook") {

      job = await addJobToQueue(req.user!.id, "PLAYBOOK_INGEST", {
        fileId,
        contractType: contractType.trim(),
        fileTitle,
        fileBufferBase64: file.buffer.toString("base64"),
        mimeType: file.mimetype
      });
    }

    job = await addJobToQueue(req.user!.id, "file_processing", {
      fileId,
      fileTitle,
      fileBufferBase64: file.buffer.toString("base64"),
      mimeType: file.mimetype,
      folder_id: resolvedFolderId,
      creatorEmail: req.user!.email
    });

    res.status(202).json({ success: true, job_id: job.id, file_id: fileId });
  } catch (err: any) {
    console.error("Document upload route crash:", err);
    const message = err.message === "DB_UPLOAD_FAILED" ? "Failed to register upload in security log." : "Internal error during background job queueing.";
    res.status(500).json({ error: message });
  }
};

export const updateDocument = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, content, folder_id } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT * FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      const doc = rows[0];

      const encryptedContent = content ? encrypt(content) : doc.content;

      await client.query(
        `UPDATE files SET title = COALESCE($1, title), content = $2, folder_id = COALESCE($3, folder_id), updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [title || null, encryptedContent, folder_id || null, id]
      );

      const versionId = "ver_" + crypto.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, id, encryptedContent]
      );

      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, 'document_update', JSON.stringify({ documentId: id, title })]);
    });

    // Re-index updated content for RAG retrieval (fire-and-forget, non-blocking)
    if (content && content.trim().length > 0) {
      // Delete old chunks then re-insert via chunkAndIndexDocument
      pool.query(
        "DELETE FROM legal_document_chunks WHERE file_id = $1 AND user_id = $2",
        [id, userId]
      ).then(() => chunkAndIndexDocument(id, content, userId))
        .catch((err) => console.warn(`[updateDocument] Re-indexing failed for ${id}:`, err));
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};

export const deleteDocument = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rowCount } = await client.query("DELETE FROM files WHERE id = $1", [id]);
      if (rowCount === 0) throw new Error("Document not found");

      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, 'document_delete', JSON.stringify({ documentId: id })]);
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};

export const shareDocument = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { email } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    const sharedWith = await withTransaction(userId, userRole, async (client) => {
      const { rows: userRows } = await client.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
      if (userRows.length === 0) throw new Error("USER_NOT_FOUND");

      const { rows } = await client.query("SELECT shared_with FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");

      const sharedWith = rows[0].shared_with || [];
      if (!sharedWith.includes(email.toLowerCase())) {
        sharedWith.push(email.toLowerCase());
      }

      await client.query("UPDATE files SET shared_with = $1 WHERE id = $2", [JSON.stringify(sharedWith), id]);

      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, 'document_share', JSON.stringify({ documentId: id, sharedWith: email })]);
      return sharedWith;
    });
    res.json({ success: true, sharedWith });
  } catch (err: any) {
    if (err.message === "USER_NOT_FOUND") return res.status(404).json({ error: "User with this email not found." });
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};

export const requestSignature = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { email } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    const signatures = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT signatures FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");

      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, 'signature_request', JSON.stringify({ documentId: id, requestedFrom: email })]);
      return rows[0].signatures || [];
    });
    res.json({ success: true, signatures });
  } catch (err: any) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};

export const signDocument = async (req: Request, res: Response) => {
  const { id } = req.params;
  const signatureData = req.body.signatureData ?? req.body.fullName;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT signatures, content, is_encrypted FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");

      const signatures = rows[0].signatures || [];
      const plaintext = rows[0].is_encrypted ? decrypt(rows[0].content) : rows[0].content;
      const contentHash = crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');

      const newSignature = {
        id: crypto.randomUUID(),
        userId,
        userEmail: req.user!.email,
        signedAt: new Date().toISOString(),
        contentHash,
        signatureData
      };

      signatures.push(newSignature);
      await client.query("UPDATE files SET signatures = $1 WHERE id = $2", [JSON.stringify(signatures), id]);

      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, 'document_sign', JSON.stringify({ documentId: id, signatureId: newSignature.id })]);
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};

/**
 * Safely parses the redlines field from the database.
 * 
 * Handles various states:
 * - Already-parsed array (from JSONB column)
 * - Stringified JSON array
 * - null / undefined
 * - Malformed data
 * 
 * Returns an empty array if parsing fails or data is invalid.
 */
function parseRedlines(raw: unknown): any[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to return []
    }
  }
  return [];
}

export const createRedline = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { originalText, proposedText, comment } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    const newRedline = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT redlines FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      const redlines = parseRedlines(rows[0].redlines);
      const redline = { id: crypto.randomUUID(), originalText, proposedText, comment, proposedByEmail: req.user!.email, proposedAt: new Date().toISOString(), status: "pending" };
      redlines.push(redline);
      await client.query("UPDATE files SET redlines = $1 WHERE id = $2", [JSON.stringify(redlines), id]);
      console.log("[createRedline] persisted redline", {
        documentId: id,
        createdRedlineId: redline.id,
        redlineIdsAfterSave: redlines.map((r: any) => r.id),
        rawType: typeof rows[0].redlines,
      });
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
    await withTransaction(userId, userRole, async (client) => {
      // Fetch document and redlines in a single transaction
      const { rows } = await client.query("SELECT * FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("DOCUMENT_NOT_FOUND");

      const doc = rows[0];
      const redlines = parseRedlines(doc.redlines);

      console.log("[acceptRedline] lookup", {
        documentId: id,
        requestedRedlineId: redlineId,
        storedRedlineIds: redlines.map((r: any) => r.id),
        redlineCount: redlines.length,
      });

      const index = redlines.findIndex((r: any) => r.id === redlineId);
      if (index === -1) throw new Error("REDLINE_NOT_FOUND");

      const proposal = redlines[index];
      if (proposal.status === "accepted") {
        throw new Error("ALREADY_ACCEPTED");
      }

      // Decrypt current content
      const currentContent = doc.is_encrypted ? decrypt(doc.content) : doc.content;

      // Apply the clause replacement safely
      const finalContent = applyClauseReplacement(
        currentContent,
        proposal.originalText,
        proposal.proposedText
      );

      // Mark redline as accepted
      redlines[index].status = "accepted";
      redlines[index].acceptedAt = new Date().toISOString();
      redlines[index].acceptedBy = req.user!.email;

      // Encrypt updated content
      const encryptedFinal = encrypt(finalContent);

      // Update document with new content and redline status
      await client.query(
        "UPDATE files SET content = $1, redlines = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [encryptedFinal, JSON.stringify(redlines), id]
      );

      // Create new version
      const versionId = "ver_" + crypto.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, id, encryptedFinal]
      );

      // Insert audit log
      await client.query(
        `INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
         VALUES ($1, $2, $3)`,
        [userId, 'redline_accept', JSON.stringify({ 
          documentId: id, 
          redlineId,
          originalText: proposal.originalText.substring(0, 100),
          proposedText: proposal.proposedText.substring(0, 100)
        })]
      );
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Failed to accept redline:", err);
    
    if (err.message === "DOCUMENT_NOT_FOUND") {
      return res.status(404).json({ error: "Document not found" });
    }
    if (err.message === "REDLINE_NOT_FOUND") {
      return res.status(404).json({ error: "Redline not found" });
    }
    if (err.message === "ALREADY_ACCEPTED") {
      return res.status(400).json({ error: "This redline has already been accepted" });
    }
    if (err.message && err.message.startsWith("CLAUSE_")) {
      return res.status(400).json({ error: err.message.replace("CLAUSE_", "").replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase()) });
    }
    
    res.status(500).json({ error: "Internal error processing redline acceptance" });
  }
};

export const rejectRedline = async (req: Request, res: Response) => {
  const { id, redlineId } = req.params;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT redlines FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("DOCUMENT_NOT_FOUND");

      const redlines = parseRedlines(rows[0].redlines);
      const index = redlines.findIndex((r: any) => r.id === redlineId);
      if (index === -1) throw new Error("REDLINE_NOT_FOUND");

      redlines[index].status = "rejected";
      redlines[index].rejectedAt = new Date().toISOString();
      redlines[index].rejectedBy = req.user!.email;

      await client.query("UPDATE files SET redlines = $1 WHERE id = $2", [JSON.stringify(redlines), id]);

      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, 'redline_reject', JSON.stringify({ documentId: id, redlineId })]);
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Failed to reject redline:", err);

    if (err.message === "DOCUMENT_NOT_FOUND") {
      return res.status(404).json({ error: "Document not found" });
    }
    if (err.message === "REDLINE_NOT_FOUND") {
      return res.status(404).json({ error: "Redline not found" });
    }

    res.status(500).json({ error: "Internal error processing redline rejection" });
  }
};

/**
 * Safely applies a clause replacement to document content.
 *
 * Strategy:
 *   1. Exact match — if originalText appears exactly once, replace it.
 *   2. Normalized whitespace match — collapse runs of whitespace for comparison,
 *      find the one matching span in the original document, replace that span.
 *   3. Fail-safe — throw a typed error if the clause is not found or matches
 *      multiple locations, so the caller can return a clean 400.
 *
 * Throws with a "CLAUSE_*" prefix so acceptRedline() can detect and surface
 * these as 400 errors rather than 500s.
 */
function applyClauseReplacement(
  documentContent: string,
  originalText: string,
  proposedText: string
): string {
  // ── Step 1: Exact match ──────────────────────────────────────────────────
  const firstExact = documentContent.indexOf(originalText);
  if (firstExact !== -1) {
    const secondExact = documentContent.indexOf(originalText, firstExact + 1);
    if (secondExact !== -1) {
      throw new Error(
        "CLAUSE_Clause matched multiple locations in the current document. Redline cannot be safely applied."
      );
    }
    return (
      documentContent.substring(0, firstExact) +
      proposedText +
      documentContent.substring(firstExact + originalText.length)
    );
  }

  // ── Step 2: Normalized whitespace match ──────────────────────────────────
  // Collapse runs of whitespace in the document while building a char-offset
  // map back to the original, then search in the collapsed space.
  const normalizedTarget = originalText.replace(/\s+/g, " ").trim();
  if (normalizedTarget.length === 0) {
    throw new Error("CLAUSE_Could not locate the original clause in the current document state.");
  }

  const normChars: string[] = [];   // normalized document chars
  const normToOrig: number[] = [];  // normChars[i] → documentContent[normToOrig[i]]

  let prevWasSpace = false;
  for (let i = 0; i < documentContent.length; i++) {
    const ch = documentContent[i];
    if (/\s/.test(ch)) {
      if (!prevWasSpace) {
        normChars.push(" ");
        normToOrig.push(i);
        prevWasSpace = true;
      }
    } else {
      normChars.push(ch);
      normToOrig.push(i);
      prevWasSpace = false;
    }
  }

  const normalizedDoc = normChars.join("");
  const lowerDoc = normalizedDoc.toLowerCase();
  const lowerTarget = normalizedTarget.toLowerCase();

  const firstNorm = lowerDoc.indexOf(lowerTarget);
  if (firstNorm === -1) {
    throw new Error(
      "CLAUSE_Could not locate the original clause in the current document state."
    );
  }

  const secondNorm = lowerDoc.indexOf(lowerTarget, firstNorm + 1);
  if (secondNorm !== -1) {
    throw new Error(
      "CLAUSE_Clause matched multiple locations in the current document. Redline cannot be safely applied."
    );
  }

  // Map normalized match positions directly through normToOrig — no offset adjustment needed
  const origStart = normToOrig[firstNorm];
  const origEnd   = normToOrig[firstNorm + normalizedTarget.length - 1] + 1; // exclusive

  return (
    documentContent.substring(0, origStart) +
    proposedText +
    documentContent.substring(origEnd)
  );
}

export const exportDocument = async (req: Request, res: Response) => {
  const { title, format, contentType, content, documentId } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
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
