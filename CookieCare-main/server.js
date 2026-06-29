var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// backend/src/config/index.ts
import dotenv from "dotenv";
var config, isProduction;
var init_config = __esm({
  "backend/src/config/index.ts"() {
    dotenv.config();
    config = {
      port: Number(process.env.PORT) || 3e3,
      nodeEnv: process.env.NODE_ENV || "development",
      databaseUrl: process.env.DATABASE_URL || "",
      // OpenRouter replaces Gemini as the AI provider
      openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
      // Kept for backward compatibility — no longer used for AI calls
      geminiApiKey: process.env.GEMINI_API_KEY || "",
      jwtSecret: process.env.JWT_SECRET || "privsec-ai-enterprise-secret-2026",
      // Fixed: Added the Render production URL as a default fallback
      corsOrigin: process.env.CORS_ORIGIN || "https://privlex-ai.onrender.com",
      vercelUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
      isVercel: !!process.env.VERCEL
    };
    isProduction = config.nodeEnv === "production";
  }
});

// backend/src/config/database.ts
import pg from "pg";
var Pool, rawConnectionString, isNeon, isPooler, connectionString, pool;
var init_database = __esm({
  "backend/src/config/database.ts"() {
    init_config();
    ({ Pool } = pg);
    rawConnectionString = config.databaseUrl.trim();
    isNeon = rawConnectionString.includes("neon.tech");
    isPooler = rawConnectionString.includes("-pooler.");
    connectionString = rawConnectionString;
    if (isNeon) {
      connectionString = rawConnectionString.replace(/[?&]sslmode=[^&]*/g, "").replace(/[?&]$/, "").replace(/\?$/, "");
      if (isPooler && !connectionString.includes("pgbouncer=true")) {
        connectionString += (connectionString.includes("?") ? "&" : "?") + "pgbouncer=true";
      }
    }
    pool = new Pool({
      connectionString,
      ssl: isNeon ? { rejectUnauthorized: false } : void 0,
      max: 20,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 6e4,
      keepAlive: true,
      keepAliveInitialDelayMillis: 0
    });
    pool.on("error", (err) => {
      console.error("Unexpected database pool error:", err);
    });
  }
});

// backend/src/utils/crypto.ts
var crypto_exports = {};
__export(crypto_exports, {
  decrypt: () => decrypt,
  decryptData: () => decryptData,
  encrypt: () => encrypt,
  encryptData: () => encryptData
});
import crypto3 from "crypto";
function encryptData(text) {
  if (!text) return "";
  if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes.");
  }
  const iv = crypto3.randomBytes(12);
  const cipher = crypto3.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `LEXGCM_${iv.toString("hex")}:${authTag}:${encrypted}`;
}
function decryptData(text) {
  if (!text) return "";
  if (text.startsWith("LEXGCM_")) {
    try {
      if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length !== 32) {
        throw new Error("ENCRYPTION_KEY must be 32 bytes.");
      }
      const payload = text.replace("LEXGCM_", "");
      const [ivHex, authTagHex, encryptedHex] = payload.split(":");
      if (!ivHex || !authTagHex || !encryptedHex) {
        return "[DECRYPTION_FORMAT_ERROR]";
      }
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const decipher = crypto3.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (err) {
      console.error("Decryption failed:", err);
      (async () => {
        let client;
        try {
          client = await pool.connect();
          await client.query("BEGIN");
          await client.query("SET LOCAL app.current_user_role = 'ADMIN'");
          await client.query(`
            INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
            VALUES ($1, $2, $3)
          `, [null, "decryption_failure", JSON.stringify({ error: err.message, timestamp: (/* @__PURE__ */ new Date()).toISOString() })]);
          await client.query("COMMIT");
        } catch (auditErr) {
          if (client) {
            try {
              await client.query("ROLLBACK");
            } catch (rollbackErr) {
            }
          }
          console.error("Failed to log decryption failure audit:", auditErr);
        } finally {
          if (client) client.release();
        }
      })();
      return "[DECRYPTION_FAILURE]";
    }
  }
  if (text.startsWith("LEXENC_")) {
    try {
      const rawBase64 = text.replace("LEXENC_", "");
      return Buffer.from(rawBase64, "base64").toString("utf-8");
    } catch (err) {
      return "[LEGACY_DECRYPTION_ERROR]";
    }
  }
  return text;
}
var ENCRYPTION_KEY, ALGORITHM, encrypt, decrypt;
var init_crypto = __esm({
  "backend/src/utils/crypto.ts"() {
    init_database();
    ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    ALGORITHM = "aes-256-gcm";
    if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length !== 32) {
      console.warn("\u26A0\uFE0F [SECURITY] ENCRYPTION_KEY is missing or invalid (must be 32 bytes). Encryption/Decryption features will fail.");
    }
    encrypt = encryptData;
    decrypt = decryptData;
  }
});

// server.ts
init_config();
import express from "express";
import http from "http";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// backend/src/config/validate.ts
init_config();
function validateEnv() {
  const required = [
    { key: "DATABASE_URL", value: config.databaseUrl },
    { key: "OPENROUTER_API_KEY", value: config.openRouterApiKey },
    { key: "ENCRYPTION_KEY", value: process.env.ENCRYPTION_KEY }
  ];
  const missing = required.filter((item) => !item.value || item.value.trim() === "");
  if (missing.length > 0) {
    if (process.env.NODE_ENV === "test") {
      console.warn("\u26A0\uFE0F Skipping env validation in test mode.");
      return;
    }
    console.error("\u274C [FATAL] Missing required environment variables:");
    missing.forEach((item) => console.error(`   - ${item.key}`));
    console.error("\nPlease ensure your .env file or environment settings are correct.");
    process.exit(1);
  }
  if (process.env.ENCRYPTION_KEY && Buffer.from(process.env.ENCRYPTION_KEY).length !== 32) {
    console.error("\u274C [FATAL] ENCRYPTION_KEY must be exactly 32 bytes.");
    process.exit(1);
  }
  console.log("\u2705 Environment validation successful.");
}

// backend/src/config/sentry.ts
import * as Sentry from "@sentry/node";
function initSentry(app2) {
  if (!process.env.SENTRY_DSN) {
    console.warn("\u26A0\uFE0F SENTRY_DSN not found. Sentry error tracking is disabled.");
    return;
  }
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Performance Monitoring
    tracesSampleRate: 1
  });
}
function initSentryErrorHandler(app2) {
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app2);
  }
}

// backend/src/routes/index.ts
init_database();
import { Router as Router14 } from "express";

// backend/src/routes/auth.ts
import { Router } from "express";

// backend/src/controllers/auth.ts
init_database();
init_config();
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto2 from "crypto";

// backend/src/utils/dbUtils.ts
init_database();
async function withTransaction(userId, userRole, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sanitizedId = userId.replace(/'/g, "''");
    const sanitizedRole = userRole.replace(/'/g, "''");
    await client.query(`SET LOCAL app.current_user_id = '${sanitizedId}'`);
    await client.query(`SET LOCAL app.current_user_role = '${sanitizedRole}'`);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// backend/src/controllers/folders.ts
import crypto from "crypto";
var DEFAULT_FOLDER_NAME = "Uploaded Documents";
async function getOrCreateDefaultFolder(userId, userRole = "USER") {
  return withTransaction(userId, userRole, async (client) => {
    const { rows } = await client.query(
      "SELECT id FROM folders WHERE user_id = $1 AND name = $2 LIMIT 1",
      [userId, DEFAULT_FOLDER_NAME]
    );
    if (rows.length > 0) {
      return rows[0].id;
    }
    const folderId = "fld_" + crypto.randomUUID();
    await client.query(
      "INSERT INTO folders (id, name, user_id) VALUES ($1, $2, $3)",
      [folderId, DEFAULT_FOLDER_NAME, userId]
    );
    console.log(`[defaultFolder] Created "${DEFAULT_FOLDER_NAME}" (${folderId}) for user ${userId}`);
    return folderId;
  });
}
async function migrateUnassignedDocuments(userId, defaultFolderId, userRole = "USER") {
  await withTransaction(userId, userRole, async (client) => {
    const result = await client.query(
      "UPDATE files SET folder_id = $1 WHERE creator_id = $2 AND folder_id IS NULL",
      [defaultFolderId, userId]
    );
    if ((result.rowCount ?? 0) > 0) {
      console.log(`[defaultFolder] Migrated ${result.rowCount} unassigned doc(s) for user ${userId} \u2192 folder ${defaultFolderId}`);
    }
  });
}
var getFolders = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const defaultFolderId = await getOrCreateDefaultFolder(userId, userRole);
    await migrateUnassignedDocuments(userId, defaultFolderId, userRole);
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows: rows2 } = await client.query(
        "SELECT * FROM folders WHERE user_id = current_setting('app.current_user_id', true) ORDER BY created_at DESC"
      );
      return rows2;
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var createFolder = async (req, res) => {
  const { name } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  if (!name) return res.status(400).json({ error: "Folder name is required." });
  try {
    const id = "fld_" + crypto.randomUUID();
    const row = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "INSERT INTO folders (id, name, user_id) VALUES ($1, $2, $3) RETURNING *",
        [id, name, userId]
      );
      return rows[0];
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var deleteFolder = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows: folderRows } = await client.query(
        "SELECT name FROM folders WHERE id = $1",
        [req.params.id]
      );
      if (folderRows.length > 0 && folderRows[0].name === DEFAULT_FOLDER_NAME) {
        throw new Error("DEFAULT_FOLDER_PROTECTED");
      }
      const result = await client.query(
        "DELETE FROM folders WHERE id = $1",
        [req.params.id]
      );
      if (result.rowCount === 0) throw new Error("Folder not found.");
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "folder_delete", JSON.stringify({ folderId: req.params.id })]);
    });
    res.json({ success: true });
  } catch (err) {
    if (err.message === "DEFAULT_FOLDER_PROTECTED") {
      return res.status(403).json({ error: "The 'Uploaded Documents' folder cannot be deleted." });
    }
    res.status(err.message === "Folder not found." ? 404 : 500).json({ error: err.message });
  }
};

// backend/src/controllers/auth.ts
var register = async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Please enter all required fields." });
  }
  const normalizedEmail = email.toLowerCase();
  const newUserId = "user_" + crypto2.randomUUID();
  try {
    const checkMail = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (checkMail.rows.length > 0) {
      return res.status(400).json({ error: "Email already exists." });
    }
    const passwordHash = await argon2.hash(password);
    await pool.query(
      "INSERT INTO users (id, email, name, password_hash, status, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [newUserId, normalizedEmail, name, passwordHash, "PENDING_APPROVAL", "USER"]
    );
    return res.status(201).json({ message: "Account created successfully. Awaiting administrator approval." });
  } catch (err) {
    console.error("Registration failed:", err);
    return res.status(500).json({ error: "Registration failed." });
  }
};
var login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing identity credentials" });
  }
  const normalizedEmail = email.toLowerCase();
  try {
    const { rows } = await pool.query(
      "SELECT id, email, name, password_hash, status, role FROM users WHERE email = $1",
      [normalizedEmail]
    ).catch((dbErr) => {
      console.error("Database query failed during login:", dbErr);
      throw new Error("DATABASE_ERROR");
    });
    if (rows.length > 0) {
      const user = rows[0];
      const isPasswordValid = await argon2.verify(user.password_hash, password);
      if (isPasswordValid) {
        if (user.status !== "APPROVED") {
          return res.status(403).json({ error: "Your account is awaiting admin approval." });
        }
        const token = jwt.sign(
          { id: user.id, email: user.email },
          config.jwtSecret,
          { expiresIn: "24h" }
        );
        getOrCreateDefaultFolder(user.id, user.role).then((folderId) => migrateUnassignedDocuments(user.id, folderId, user.role)).catch((err) => console.warn("[defaultFolder] Setup on login failed:", err));
        return res.json({
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            status: user.status,
            role: user.role
          }
        });
      }
    }
  } catch (err) {
    console.error("Login failed:", err);
    if (err.message === "DATABASE_ERROR") {
      return res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
    }
    return res.status(500).json({ error: "Login failed due to an internal server error." });
  }
  return res.status(401).json({ error: "Invalid email or password." });
};

// backend/src/routes/auth.ts
var router = Router();
router.post("/register", register);
router.post("/login", login);
var auth_default = router;

// backend/src/routes/admin.ts
import { Router as Router2 } from "express";

// backend/src/middleware/auth.ts
init_config();
init_database();
import jwt2 from "jsonwebtoken";
var authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const queryToken = req.query.token;
  let token;
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    } else {
      return res.status(401).json({ error: "Access denied. Token format must be Bearer <token>." });
    }
  } else if (queryToken && typeof queryToken === "string") {
    token = queryToken;
  }
  if (!token) {
    return res.status(401).json({ error: "Access denied. Token missing." });
  }
  if (token === "undefined" || token === "null") {
    return res.status(401).json({ error: "Access denied. Token is null or undefined." });
  }
  try {
    const decoded = jwt2.verify(token, config.jwtSecret);
    const { rows } = await pool.query(
      "SELECT id, email, name, status, role FROM users WHERE id = $1",
      [decoded.id]
    );
    if (rows.length === 0) {
      return res.status(403).json({ error: "Unauthorized or invalid user session." });
    }
    const user = rows[0];
    if (user.status !== "APPROVED") {
      return res.status(403).json({ error: "Your account is awaiting admin approval." });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(403).json({ error: "Invalid or malformed token." });
    }
    console.error("Authentication middleware unexpected error:", err);
    return res.status(500).json({ error: "Internal server error during authentication." });
  }
};
var isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Access denied. Admins only." });
  }
  next();
};

// backend/src/controllers/admin.ts
init_database();

// backend/src/RAG/ragService.ts
init_database();
function sanitizeText(text) {
  return text.replace(/\0/g, "");
}
function splitIntoClauseAwareChunks(content) {
  const paragraphs = content.split(/\n\n+/);
  const chunks = [];
  let currentChunk = "";
  const maxChunkLength = 800;
  const overlapLength = 150;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    if ((currentChunk + "\n\n" + trimmed).length <= maxChunkLength) {
      currentChunk = currentChunk ? currentChunk + "\n\n" + trimmed : trimmed;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      const lastPart = currentChunk.substring(Math.max(0, currentChunk.length - overlapLength));
      const overlapText = lastPart.includes("\n") ? lastPart.substring(lastPart.indexOf("\n") + 1) : lastPart;
      currentChunk = overlapText ? overlapText.trim() + "\n\n" + trimmed : trimmed;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks.filter((c) => c.trim().length > 15);
}
async function embedText(_text) {
  return null;
}
async function chunkAndIndexDocument(fileId, content, userId) {
  const cleanedContent = sanitizeText(content);
  const chunks = splitIntoClauseAwareChunks(cleanedContent);
  const processedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    const vector = await embedText(chunks[i]);
    processedChunks.push({
      index: i,
      content: chunks[i],
      // null embedding stored as NULL — chunk is still searchable via lexical search
      embedding: vector ? `[${vector.join(",")}]` : null
    });
  }
  await withTransaction(userId, "USER", async (client) => {
    for (const chunk of processedChunks) {
      await client.query(
        "INSERT INTO legal_document_chunks (file_id, user_id, chunk_index, content, embedding) VALUES ($1, $2, $3, $4, $5)",
        [fileId, userId, chunk.index, chunk.content, chunk.embedding]
      );
    }
  });
}
async function searchHybrid(query, userId, fileIds, folderIds) {
  const embedding = await embedText(query);
  const hasEmbedding = embedding !== null;
  const vectorStr = hasEmbedding ? `[${embedding.join(",")}]` : null;
  let resolvedFolderIds;
  let includeNullFolder = false;
  if (folderIds && folderIds.length > 0) {
    const realFolderIds = folderIds.filter((id) => id !== "root");
    includeNullFolder = folderIds.includes("root");
    resolvedFolderIds = realFolderIds.length > 0 ? realFolderIds : void 0;
  }
  const buildFolderFilter = (startIdx, params) => {
    const parts = [];
    let idx = startIdx;
    if (resolvedFolderIds && resolvedFolderIds.length > 0) {
      parts.push(`file_id IN (SELECT id FROM files WHERE folder_id = ANY($${idx++}))`);
      params.push(resolvedFolderIds);
    }
    if (includeNullFolder) {
      parts.push(`file_id IN (SELECT id FROM files WHERE folder_id IS NULL)`);
    }
    if (parts.length === 0) return { sql: "", params, nextIdx: idx };
    return { sql: ` AND (${parts.join(" OR ")})`, params, nextIdx: idx };
  };
  return await withTransaction(userId, "USER", async (client) => {
    console.log(`[searchHybrid] userId=${userId} query="${query.substring(0, 80)}" folderIds=${JSON.stringify(folderIds)} resolvedFolderIds=${JSON.stringify(resolvedFolderIds)} includeNullFolder=${includeNullFolder}`);
    try {
      let countSql = `SELECT COUNT(*) FROM legal_document_chunks WHERE user_id = $1`;
      const countParams = [userId];
      if (fileIds && fileIds.length > 0) {
        countSql += ` AND file_id = ANY($2)`;
        countParams.push(fileIds);
      } else if (resolvedFolderIds && resolvedFolderIds.length > 0) {
        const folderParts = [
          `file_id IN (SELECT id FROM files WHERE folder_id = ANY($2))`
        ];
        countParams.push(resolvedFolderIds);
        if (includeNullFolder) {
          folderParts.push(`file_id IN (SELECT id FROM files WHERE folder_id IS NULL)`);
        }
        countSql += ` AND (${folderParts.join(" OR ")})`;
      } else if (includeNullFolder) {
        countSql += ` AND file_id IN (SELECT id FROM files WHERE folder_id IS NULL)`;
      }
      const { rows: countRows } = await client.query(countSql, countParams);
      console.log(`[searchHybrid] Available chunks in scope: ${countRows[0]?.count ?? 0}`);
    } catch (countErr) {
      console.warn("[searchHybrid] Count query failed:", countErr.message);
    }
    let semanticRows = [];
    if (hasEmbedding) {
      const semanticParams = [userId, vectorStr];
      let sIdx = 3;
      let fileFilterSql2 = "";
      if (fileIds && fileIds.length > 0) {
        fileFilterSql2 += ` AND file_id = ANY($${sIdx++})`;
        semanticParams.push(fileIds);
      }
      const folderFilter2 = buildFolderFilter(sIdx, semanticParams);
      sIdx = folderFilter2.nextIdx;
      const semanticQuerySql = `
        SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title
        FROM legal_document_chunks
        WHERE user_id = $1
        ${fileFilterSql2}
        ${folderFilter2.sql}
        ORDER BY embedding <=> $2::vector
        LIMIT 20
      `;
      try {
        const result = await client.query(semanticQuerySql, folderFilter2.params);
        semanticRows = result.rows;
      } catch (err) {
        console.warn("[RAG] Semantic search failed, falling back to lexical only:", err.message);
      }
    }
    const lexicalParams = [userId, query, `%${query}%`];
    let lIdx = 4;
    let fileFilterSql = "";
    if (fileIds && fileIds.length > 0) {
      fileFilterSql += ` AND file_id = ANY($${lIdx++})`;
      lexicalParams.push(fileIds);
    }
    const folderFilter = buildFolderFilter(lIdx, lexicalParams);
    lIdx = folderFilter.nextIdx;
    const lexicalQuerySql = `
      SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title,
             ts_rank(to_tsvector('english', content), plainto_tsquery('english', $2)) as fts_rank
      FROM legal_document_chunks
      WHERE user_id = $1
        AND (to_tsvector('english', content) @@ plainto_tsquery('english', $2) OR content ILIKE $3)
        ${fileFilterSql}
        ${folderFilter.sql}
      ORDER BY fts_rank DESC, id
      LIMIT 20
    `;
    let lexicalRows = [];
    try {
      const { rows } = await client.query(lexicalQuerySql, folderFilter.params);
      lexicalRows = rows;
    } catch (lexErr) {
      console.warn("[RAG] Lexical query failed:", lexErr.message);
    }
    if (semanticRows.length === 0 && lexicalRows.length === 0) {
      console.log("[searchHybrid] Primary queries returned 0 results \u2014 attempting broad fallback scan");
      const broadTerms = [
        "indemnity",
        "liability",
        "termination",
        "confidential",
        "intellectual property",
        "payment",
        "governing law",
        "compliance",
        "data protection",
        "obligation"
      ];
      const broadPattern = `%(${broadTerms.join("|")})%`;
      const broadParams = [userId];
      let bIdx = 2;
      let bFileFilterSql = "";
      if (fileIds && fileIds.length > 0) {
        bFileFilterSql += ` AND file_id = ANY($${bIdx++})`;
        broadParams.push(fileIds);
      }
      const bFolderFilter = buildFolderFilter(bIdx, broadParams);
      bIdx = bFolderFilter.nextIdx;
      const broadSql = `
        SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title,
               1.0 as fts_rank
        FROM legal_document_chunks
        WHERE user_id = $1
          ${bFileFilterSql}
          ${bFolderFilter.sql}
          AND content ~* $${bIdx}
        LIMIT 20
      `;
      try {
        const { rows: broadRows } = await client.query(broadSql, bFolderFilter.params.concat([broadPattern]));
        if (broadRows.length > 0) {
          console.log(`[searchHybrid] Broad fallback returned ${broadRows.length} chunk(s)`);
          lexicalRows = broadRows;
        } else {
          console.log("[searchHybrid] Broad fallback also empty \u2014 returning any available chunks in scope");
          const anyParams = [userId];
          let aIdx = 2;
          let aFileFilterSql = "";
          if (fileIds && fileIds.length > 0) {
            aFileFilterSql += ` AND file_id = ANY($${aIdx++})`;
            anyParams.push(fileIds);
          }
          const aFolderFilter = buildFolderFilter(aIdx, anyParams);
          const anySql = `
            SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title,
                   0.5 as fts_rank
            FROM legal_document_chunks
            WHERE user_id = $1
              ${aFileFilterSql}
              ${aFolderFilter.sql}
            ORDER BY chunk_index ASC
            LIMIT 20
          `;
          const { rows: anyRows } = await client.query(anySql, aFolderFilter.params);
          console.log(`[searchHybrid] Last-resort scan returned ${anyRows.length} chunk(s)`);
          lexicalRows = anyRows;
        }
      } catch (broadErr) {
        console.warn("[RAG] Broad fallback failed:", broadErr.message);
      }
    }
    console.log(`[searchHybrid] Final \u2014 semantic: ${semanticRows.length}, lexical: ${lexicalRows.length}`);
    const rrfMap = /* @__PURE__ */ new Map();
    semanticRows.forEach((row, index) => {
      const key = `${row.file_id}_${row.content.substring(0, 50)}`;
      rrfMap.set(key, { doc: row, semanticRank: index + 1, lexicalRank: Infinity });
    });
    lexicalRows.forEach((row, index) => {
      const key = `${row.file_id}_${row.content.substring(0, 50)}`;
      if (rrfMap.has(key)) {
        rrfMap.get(key).lexicalRank = index + 1;
      } else {
        rrfMap.set(key, { doc: row, semanticRank: Infinity, lexicalRank: index + 1 });
      }
    });
    const fusedResults = Array.from(rrfMap.values()).map((item) => {
      const semScore = item.semanticRank === Infinity ? 0 : 1 / (60 + item.semanticRank);
      const lexScore = item.lexicalRank === Infinity ? 0 : 1 / (60 + item.lexicalRank);
      const rrfScore = semScore * 0.7 + lexScore * 0.3;
      return {
        ...item.doc,
        rrfScore
      };
    });
    fusedResults.sort((a, b) => b.rrfScore - a.rrfScore);
    const finalResults = fusedResults.slice(0, 5);
    console.log(`[searchHybrid] Returning ${finalResults.length} chunk(s): ${finalResults.map((r) => r.title ?? r.file_id).join(", ")}`);
    return finalResults;
  });
}
async function reindexUnchunkedDocuments(userId) {
  const { decrypt: decrypt2 } = await Promise.resolve().then(() => (init_crypto(), crypto_exports));
  const { rows: files } = await pool.query(
    `SELECT f.id, f.content, f.is_encrypted
     FROM files f
     WHERE f.creator_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM legal_document_chunks ldc WHERE ldc.file_id = f.id
       )
       AND f.content IS NOT NULL
       AND f.content <> ''`,
    [userId]
  );
  let indexed = 0;
  let skipped = 0;
  for (const file of files) {
    try {
      const plaintext = file.is_encrypted ? decrypt2(file.content) : file.content;
      if (!plaintext || plaintext.trim().length < 30) {
        skipped++;
        continue;
      }
      await chunkAndIndexDocument(file.id, plaintext, userId);
      indexed++;
      console.log(`[reindexUnchunkedDocuments] Indexed file ${file.id} for user ${userId}`);
    } catch (err) {
      console.warn(`[reindexUnchunkedDocuments] Failed for file ${file.id}:`, err.message);
      skipped++;
    }
  }
  console.log(`[reindexUnchunkedDocuments] Done \u2014 indexed: ${indexed}, skipped: ${skipped}`);
  return { indexed, skipped };
}

// backend/src/controllers/admin.ts
var approveUser = async (req, res) => {
  const { userId, role, status } = req.body;
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;
  if (!userId) {
    return res.status(400).json({ error: "userId is required." });
  }
  try {
    const finalRole = role || "USER";
    const finalStatus = status || "APPROVED";
    await withTransaction(currentUserId, currentUserRole, async (client) => {
      await client.query(
        "UPDATE users SET status = $1, role = $2, approved_at = CASE WHEN $1 = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE approved_at END WHERE id = $3",
        [finalStatus, finalRole, userId]
      );
    });
    res.json({ success: true, message: `User updated to ${finalStatus} with role ${finalRole}.` });
  } catch (error) {
    console.error("Admin user update failed:", error);
    res.status(500).json({ error: "Failed to update user." });
  }
};
var getAllUsers = async (req, res) => {
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;
  try {
    const rows = await withTransaction(currentUserId, currentUserRole, async (client) => {
      const { rows: rows2 } = await client.query(
        "SELECT id, email, name, status, role, created_at FROM users ORDER BY created_at DESC"
      );
      return rows2;
    });
    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch users:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
};
var getPendingUsers = async (req, res) => {
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;
  try {
    const rows = await withTransaction(currentUserId, currentUserRole, async (client) => {
      const { rows: rows2 } = await client.query(
        "SELECT id, email, name, status, role, created_at FROM users WHERE status = 'PENDING_APPROVAL' ORDER BY created_at DESC"
      );
      return rows2;
    });
    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch pending users:", err);
    res.status(500).json({ error: "Failed to fetch pending users." });
  }
};
var reindexChunks = async (req, res) => {
  const targetUserId = req.body?.userId;
  try {
    if (targetUserId) {
      const result = await reindexUnchunkedDocuments(targetUserId);
      return res.json({ success: true, userId: targetUserId, ...result });
    }
    const { rows: users } = await pool.query("SELECT id FROM users");
    let totalIndexed = 0;
    let totalSkipped = 0;
    for (const user of users) {
      const result = await reindexUnchunkedDocuments(user.id);
      totalIndexed += result.indexed;
      totalSkipped += result.skipped;
    }
    return res.json({ success: true, totalIndexed, totalSkipped });
  } catch (err) {
    console.error("[reindexChunks] Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// backend/src/routes/admin.ts
var router2 = Router2();
router2.patch("/users/update", authenticateToken, isAdmin, approveUser);
router2.get("/users", authenticateToken, isAdmin, getAllUsers);
router2.get("/pending-users", authenticateToken, isAdmin, getPendingUsers);
router2.post("/reindex-chunks", authenticateToken, isAdmin, reindexChunks);
var admin_default = router2;

// backend/src/routes/documents.ts
import { Router as Router3 } from "express";

// backend/src/controllers/documents.ts
init_database();

// backend/src/services/jobQueue.ts
init_database();

// backend/src/services/openRouterClient.ts
var OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
var DEFAULT_MODEL = "deepseek/deepseek-chat-v3-0324";
function getApiKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.trim() === "") {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Please add it to your environment variables."
    );
  }
  return key.trim();
}
async function openRouterChat(messages, options = {}) {
  const apiKey = getApiKey();
  const model = options.model ?? DEFAULT_MODEL;
  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.3
  };
  if (options.maxTokens) {
    body.max_tokens = options.maxTokens;
  }
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }
  let response;
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://cookiecare.app",
        "X-Title": "CookieCare Legal AI"
      },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    throw new Error(
      `OpenRouter network error: ${networkErr.message}`
    );
  }
  if (response.status === 429) {
    throw new Error(
      "OpenRouter rate limit exceeded (429). Please wait before retrying."
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `OpenRouter authentication failed (${response.status}). Check your OPENROUTER_API_KEY.`
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message ?? JSON.stringify(errBody);
    } catch {
      detail = await response.text();
    }
    throw new Error(`OpenRouter API error (${response.status}): ${detail}`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("OpenRouter returned a malformed JSON response.");
  }
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error(
      "OpenRouter response missing expected choices[0].message.content."
    );
  }
  return text;
}
async function openRouterComplete(systemPrompt, userPrompt, options = {}) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });
  return openRouterChat(messages, options);
}

// backend/src/agents/analysisAgent.ts
import { z } from "zod";
var FindingSchema = z.object({
  id: z.string(),
  clauseTitle: z.string(),
  clauseText: z.string().optional(),
  severity: z.enum(["low", "medium", "high"]),
  category: z.enum([
    "indemnity",
    "liability",
    "termination",
    "ip",
    "confidentiality",
    "payment",
    "compliance",
    "data_protection",
    "governing_law",
    "other"
  ]),
  issue: z.string(),
  whyItMatters: z.string(),
  recommendation: z.string(),
  fallbackPosition: z.string().optional(),
  sourceExcerpt: z.string().optional()
});
var RichAuditSchema = z.object({
  executiveSummary: z.string(),
  overallRisk: z.enum(["low", "medium", "high"]),
  documentType: z.string().optional(),
  keyTerms: z.object({
    parties: z.array(z.string()).default([]),
    governingLaw: z.string().optional(),
    liabilityCap: z.string().optional(),
    terminationNotice: z.string().optional(),
    paymentTerms: z.array(z.string()).default([]),
    indemnityScope: z.string().optional(),
    confidentialityTerm: z.string().optional()
  }),
  findings: z.array(FindingSchema),
  missingClauses: z.array(
    z.object({
      clauseName: z.string(),
      reason: z.string(),
      recommendation: z.string()
    })
  ),
  obligations: z.array(
    z.object({
      party: z.string().optional(),
      obligation: z.string(),
      deadline: z.string().optional(),
      trigger: z.string().optional()
    })
  ),
  complianceGaps: z.array(
    z.object({
      regulation: z.string(),
      issue: z.string(),
      severity: z.string(),
      remediation: z.string()
    })
  ),
  recommendedRedlines: z.array(
    z.object({
      clauseTitle: z.string(),
      currentIssue: z.string(),
      suggestedRevision: z.string()
    })
  )
});
function addLegacyAliases(audit) {
  return {
    ...audit,
    // Flat alias so existing consumers that read .summary don't break
    summary: audit.executiveSummary,
    // Map findings → risks so DashboardHome.tsx analysis.risks.length still works
    risks: audit.findings.map((f) => ({
      id: f.id,
      clause: f.clauseText ?? f.clauseTitle,
      severity: f.severity,
      risk_level: f.category,
      reasons: [f.whyItMatters],
      description: f.issue,
      actionableInsight: f.recommendation,
      remediation: f.fallbackPosition ?? f.recommendation
    }))
  };
}
var AnalysisAgent = class {
  // ── Keep intact: used by interactAnalyze ──────────────────────────────────
  async analyzeDocuments(contents, prompt) {
    const combinedContent = contents.join("\n\n---\n\n");
    const systemPrompt = `You are a Senior Compliance Officer.

Identify:
- Critical liability risks
- Compliance gaps
- Regulatory concerns
- Suggested remediation actions

IMPORTANT:
Return your response in clean, well-structured Markdown format.
Use headers, bullet points, and bold text for readability.`;
    const userPrompt = `Analyze the following document(s) and address this query:

${prompt}

[DOCUMENTS]
${combinedContent}`;
    try {
      return await openRouterComplete(systemPrompt, userPrompt);
    } catch (err) {
      console.error("AnalysisAgent.analyzeDocuments error:", err);
      throw err;
    }
  }
  // ── Primary audit method ──────────────────────────────────────────────────
  async runAudit(params) {
    const { content, type, referenceContext } = params;
    const referenceSection = referenceContext ? `

[REFERENCE CONTEXT FROM RELATED DOCUMENTS]
${referenceContext}
` : "";
    const systemPrompt = `You are an expert Legal Counsel and Risk Assessment Agent specialising in commercial contract review.

Perform a thorough legal audit for a ${type} document. Your output must be a practical legal review grounded in the actual document text.

Instructions:
- Ground every finding in actual clauses or text present in the document
- Include the verbatim clause text or a short source excerpt wherever possible
- Identify missing standard protections that a commercial agreement of this type should contain
- Provide practical recommendations AND a fallback negotiation position for each finding
- Do not hallucinate clauses, facts, or parties that are not present in the document
- If you cannot determine a value (e.g. governing law not stated), mark it as null or omit it
- Return ONLY a valid JSON object \u2014 absolutely no markdown fences, no commentary, no preamble

The JSON must exactly match this schema:
{
  "executiveSummary": "2-4 sentence plain English summary of the document and its key risks",
  "overallRisk": "low | medium | high",
  "documentType": "type of legal document, e.g. NDA, SLA, MSA, Employment Agreement",
  "keyTerms": {
    "parties": ["Party A name", "Party B name"],
    "governingLaw": "jurisdiction or null",
    "liabilityCap": "cap amount/formula or null",
    "terminationNotice": "notice period or null",
    "paymentTerms": ["payment term 1", "payment term 2"],
    "indemnityScope": "brief description or null",
    "confidentialityTerm": "duration or null"
  },
  "findings": [
    {
      "id": "finding_1",
      "clauseTitle": "Short clause name",
      "clauseText": "Verbatim or paraphrased clause text",
      "severity": "low | medium | high",
      "category": "indemnity | liability | termination | ip | confidentiality | payment | compliance | data_protection | governing_law | other",
      "issue": "Specific legal problem with this clause",
      "whyItMatters": "Business/legal consequences if unaddressed",
      "recommendation": "Concrete suggested change",
      "fallbackPosition": "Minimum acceptable negotiation position",
      "sourceExcerpt": "Exact quote from document supporting this finding"
    }
  ],
  "missingClauses": [
    {
      "clauseName": "Name of missing clause",
      "reason": "Why this clause is normally expected in this document type",
      "recommendation": "What to add"
    }
  ],
  "obligations": [
    {
      "party": "Party name or 'Both parties'",
      "obligation": "Description of the obligation",
      "deadline": "Deadline or timeframe if specified",
      "trigger": "Event that triggers the obligation"
    }
  ],
  "complianceGaps": [
    {
      "regulation": "GDPR / CCPA / DPDPA / etc",
      "issue": "Specific gap",
      "severity": "RED | YELLOW | GREEN",
      "remediation": "How to resolve"
    }
  ],
  "recommendedRedlines": [
    {
      "clauseTitle": "Clause to redline",
      "currentIssue": "What is wrong",
      "suggestedRevision": "Proposed replacement language"
    }
  ]
}`;
    const userPrompt = `Document Type Context: ${type}
${referenceSection}
[DOCUMENT TO AUDIT]
${content.substring(0, 14e3)}`;
    try {
      console.log(`[AnalysisAgent] Running rich audit via OpenRouter (type: ${type}, refContext: ${referenceContext ? "yes" : "no"})`);
      let responseText = await openRouterComplete(systemPrompt, userPrompt, {
        jsonMode: true
      });
      responseText = responseText.trim();
      if (responseText.startsWith("```")) {
        responseText = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      }
      const parsed = JSON.parse(responseText);
      parsed.keyTerms = parsed.keyTerms ?? {};
      parsed.keyTerms.parties = Array.isArray(parsed.keyTerms?.parties) ? parsed.keyTerms.parties : [];
      parsed.keyTerms.paymentTerms = Array.isArray(parsed.keyTerms?.paymentTerms) ? parsed.keyTerms.paymentTerms : [];
      parsed.findings = Array.isArray(parsed.findings) ? parsed.findings : [];
      parsed.missingClauses = Array.isArray(parsed.missingClauses) ? parsed.missingClauses : [];
      parsed.obligations = Array.isArray(parsed.obligations) ? parsed.obligations : [];
      parsed.complianceGaps = Array.isArray(parsed.complianceGaps) ? parsed.complianceGaps : [];
      parsed.recommendedRedlines = Array.isArray(parsed.recommendedRedlines) ? parsed.recommendedRedlines : [];
      parsed.findings = parsed.findings.map((f, i) => ({
        ...f,
        id: f.id || `finding_${i + 1}`
      }));
      const validated = RichAuditSchema.parse(parsed);
      return addLegacyAliases(validated);
    } catch (err) {
      console.warn(
        "[AnalysisAgent] AI audit failed or schema validation error. Falling back to heuristics.",
        err
      );
      return this.heuristicAudit(content, type);
    }
  }
  // ── Heuristic fallback — returns the full richer shape ───────────────────
  heuristicAudit(content, type) {
    const findings = [];
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes("liquidated damages")) {
      findings.push({
        id: "h_finding_1",
        clauseTitle: "Liquidated Damages",
        clauseText: "Liquidated damages clause detected",
        severity: "high",
        category: "liability",
        issue: "Liquidated damages clauses can become punitive if not reasonably linked to actual loss.",
        whyItMatters: "Uncapped liability may expose a party to excessive financial penalties disproportionate to actual loss.",
        recommendation: "Negotiate for actual proven damages and establish a reasonable liability cap.",
        fallbackPosition: "Accept liquidated damages only if capped at total contract value.",
        sourceExcerpt: "Liquidated damages clause detected in document."
      });
    }
    if (lowerContent.includes("all intellectual property") || lowerContent.includes("exclusive ownership")) {
      findings.push({
        id: "h_finding_2",
        clauseTitle: "Broad IP Ownership",
        clauseText: "Broad intellectual property ownership language detected",
        severity: "medium",
        category: "ip",
        issue: "The clause may transfer ownership of pre-existing intellectual property without limitation.",
        whyItMatters: "Ambiguous IP assignment can result in loss of background IP and pre-existing technology.",
        recommendation: "Clearly distinguish background IP from newly created deliverables.",
        fallbackPosition: "Limit assignment to project-specific deliverables only.",
        sourceExcerpt: "All intellectual property / exclusive ownership language detected."
      });
    }
    if (lowerContent.includes("terminate immediately") && !lowerContent.includes("notice")) {
      findings.push({
        id: "h_finding_3",
        clauseTitle: "Immediate Termination Without Notice",
        clauseText: "Terminate immediately clause with no notice period detected",
        severity: "medium",
        category: "termination",
        issue: "Immediate termination rights without a notice or cure period create operational disruption risk.",
        whyItMatters: "A party may lose all contractual benefits without an opportunity to remedy a breach.",
        recommendation: "Add a minimum notice period and a cure window before termination becomes effective.",
        fallbackPosition: "Accept 15-day notice minimum with a 10-day cure period.",
        sourceExcerpt: "Terminate immediately language detected without accompanying notice provision."
      });
    }
    const richResult = {
      executiveSummary: `Heuristic audit completed for document type: ${type}. ${findings.length} potential risk indicator(s) were detected based on keyword analysis. A full AI-powered review is recommended.`,
      overallRisk: findings.some((f) => f.severity === "high") ? "high" : findings.some((f) => f.severity === "medium") ? "medium" : "low",
      documentType: type,
      keyTerms: {
        parties: [],
        paymentTerms: []
      },
      findings,
      missingClauses: [],
      obligations: [],
      complianceGaps: [],
      recommendedRedlines: []
    };
    return addLegacyAliases(richResult);
  }
};

// backend/src/agents/draftingAgent.ts
var DraftingAgent = class {
  async generateDraft(prompt) {
    const systemPrompt = "You are an expert Legal Draftsman. Generate a professional legal document based on the user's instruction. Return only the document content in Markdown format. Do not include any preamble or notes.";
    const userPrompt = prompt;
    try {
      return await openRouterComplete(systemPrompt, userPrompt);
    } catch (err) {
      console.error("DraftingAgent error:", err);
      throw err;
    }
  }
};

// backend/src/agents/negotiationAgent.ts
var NegotiationAgent = class {
  async negotiate(documentContent, playbooks, instructions) {
    const playbookText = playbooks.join("\n\n---\n\n");
    const systemPrompt = `You are an expert Legal Counsel specializing in contract negotiation.
Your goal is to suggest redlines and improvements for the provided document based on the company's playbooks and specific user instructions.
Return the output in Markdown format with a summary of changes and the proposed redlines.`;
    const userPrompt = `[DOCUMENT CONTENT]
${documentContent}

[NEGOTIATION PLAYBOOKS]
${playbookText}

[USER INSTRUCTIONS]
${instructions}

Provide detailed negotiation advice and specific clause redlines.`;
    try {
      return await openRouterComplete(systemPrompt, userPrompt);
    } catch (err) {
      console.error("NegotiationAgent error:", err);
      throw err;
    }
  }
  async draftRedline(documentContent, playbooks, instructions) {
    return await this.negotiate(documentContent, playbooks, instructions);
  }
};

// backend/src/agents/askLawyerAgent.ts
var AskLawyerAgent = class {
  /**
   * Upgraded Ask AI Lawyer agent with jurisdiction awareness, output format control,
   * and document-grounded structured analysis.
   */
  async getAdvice(options) {
    const {
      prompt,
      context,
      jurisdictions = [],
      outputFormat = "Full IRAC",
      sources = []
    } = options;
    const jurisdictionClause = jurisdictions.length > 0 ? `

**JURISDICTIONAL SCOPE:** Your analysis must prioritize and reference legal principles, statutes, and case law from the following jurisdictions: ${jurisdictions.join(", ")}. Where the retrieved documents or general principles do not clearly cover these jurisdictions, state that assumption explicitly and recommend jurisdiction-specific counsel.` : "";
    const formatInstructions = this.getFormatInstructions(outputFormat);
    const systemPrompt = `You are a Senior Legal Counsel specializing in commercial contract law, regulatory compliance, and risk assessment.

Your task is to provide **document-grounded, jurisdiction-aware, structured legal analysis** based on the retrieved document context provided below.${jurisdictionClause}

${formatInstructions}

**CRITICAL RULES:**
1. **Ground your analysis in the retrieved document context wherever possible.** Quote or paraphrase relevant clauses. If the context does not support a point, clearly state: "The retrieved documents do not address this issue \u2014 the following is based on general legal principles."
2. **Clearly separate:**
   - Conclusions grounded in the provided documents
   - General legal principles applied when context is insufficient
3. **Provide practical, actionable legal analysis** \u2014 not vague generic advice.
4. **Identify risks, ambiguities, and assumptions** where the documents are unclear or incomplete.
5. **Include practical recommendations / next steps** at the end.
6. **Return clean, well-structured Markdown** with headers, bullet points, and bold text for readability.

If the retrieved document context is weak or empty, you must still provide a structured answer using general legal principles, but clearly label it as such and recommend that the user consult jurisdiction-specific counsel or provide more specific documents.`;
    const userPrompt = `[RETRIEVED DOCUMENT CONTEXT]
${context || "\u26A0\uFE0F No document chunks were retrieved. You must rely on general legal principles and clearly state where assumptions are made."}

[USER QUERY]
${prompt}

Provide your analysis using the required ${outputFormat} structure.`;
    try {
      const result = await openRouterComplete(systemPrompt, userPrompt);
      const text = result || "I cannot answer this query right now.";
      const sourcesMetadata = sources.length > 0 ? sources.map((s, idx) => ({
        id: `src_${idx + 1}`,
        title: s.title || "Untitled Document",
        file_id: s.file_id,
        excerpt: s.content.substring(0, 200) + (s.content.length > 200 ? "..." : "")
      })) : void 0;
      return { text, sources: sourcesMetadata };
    } catch (err) {
      console.error("AskLawyerAgent error:", err);
      throw err;
    }
  }
  getFormatInstructions(format) {
    switch (format) {
      case "Brief Summary":
        return `**OUTPUT FORMAT: Brief Summary**

Structure your answer as follows:
1. **Executive Summary** (2-4 sentences): Concise answer to the user's query.
2. **Key Points** (3-5 bullet points): Core legal principles or document findings.
3. **Risks / Ambiguities** (2-3 bullet points): Gaps, assumptions, or areas of concern.
4. **Practical Recommendation** (1-2 sentences): Clear next step or actionable advice.

Keep the answer **concise and practical** \u2014 no more than 300-400 words total.`;
      case "Full IRAC":
        return `**OUTPUT FORMAT: Full IRAC (Issue, Rule, Application, Conclusion)**

Structure your answer as follows:

### ISSUE
State the legal question or problem clearly in 1-2 sentences.

### RULE
Explain the relevant legal principles, statutes, or contract provisions that apply. If grounded in the retrieved documents, quote or cite the specific clause/section. If based on general legal principles, state that explicitly.

### APPLICATION
Apply the rule to the facts or document provisions retrieved. Analyze how the rule interacts with the user's situation. Identify risks, ambiguities, or gaps in the documents.

### CONCLUSION
Provide a clear conclusion that answers the user's query. Include:
- The likely legal outcome or interpretation
- Practical next steps or recommendations
- Any disclaimers about jurisdiction or missing information

Use **clear headers** for each section and bullet points where appropriate.`;
      case "CREAC":
        return `**OUTPUT FORMAT: CREAC (Conclusion, Rule, Explanation, Application, Conclusion)**

Structure your answer as follows:

### CONCLUSION (Short Answer)
Provide a direct, concise answer to the user's query in 2-3 sentences.

### RULE
Explain the relevant legal principles, statutes, or contract provisions. If grounded in the retrieved documents, quote or cite the specific clause. If based on general legal principles, state that explicitly.

### EXPLANATION OF RULE
Elaborate on how the rule works, its purpose, and any relevant nuances or exceptions. Reference case law, regulatory guidance, or contract interpretation principles where applicable.

### APPLICATION
Apply the rule to the facts or document provisions. Analyze the interaction between the rule and the user's situation. Highlight risks, ambiguities, or missing protections.

### CONCLUSION (Full Answer)
Restate and expand on the conclusion. Include:
- Detailed legal outcome or interpretation
- Practical recommendations / next steps
- Disclaimers about jurisdiction, assumptions, or areas requiring further research

Use **clear headers** and bullet points for readability.`;
      default:
        return "";
    }
  }
};

// backend/src/agents/legalAgent.ts
init_database();
var REFERENCE_RETRIEVAL_QUERY = "indemnity liability limitation of liability termination IP confidentiality data protection governing law payment obligations compliance missing clauses";
var AgentOrchestrator = class {
  constructor() {
    this.analysisAgent = new AnalysisAgent();
    this.draftingAgent = new DraftingAgent();
    this.negotiationAgent = new NegotiationAgent();
    this.askLawyerAgent = new AskLawyerAgent();
  }
  async runAnalysis(documentId, content, userId, folderIds, userRole = "USER") {
    let referenceContext;
    if (Array.isArray(folderIds) && folderIds.length > 0) {
      try {
        const chunks = await searchHybrid(
          REFERENCE_RETRIEVAL_QUERY,
          userId,
          void 0,
          // fileIds
          folderIds
        );
        if (chunks.length > 0) {
          referenceContext = chunks.map((c) => `[Reference: ${c.title ?? "Untitled"}]
${c.content}`).join("\n\n");
          console.log(
            `[runAnalysis] Retrieved ${chunks.length} reference chunk(s) from ${folderIds.length} folder(s)`
          );
        }
      } catch (refErr) {
        console.warn(
          "[runAnalysis] Reference context retrieval failed, continuing without it:",
          refErr.message
        );
      }
    }
    const audit = await this.analysisAgent.runAudit({
      content,
      type: "legal",
      referenceContext
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.current_user_id = $1", [userId]);
      await client.query("SET LOCAL app.current_user_role = $2", [userRole]);
      await client.query("UPDATE files SET analysis = $1 WHERE id = $2", [
        JSON.stringify(audit),
        documentId
      ]);
      await client.query(
        `INSERT INTO agent_execution_logs
           (file_id, user_id, agent_name, task_name, decisions, confidence_score)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          documentId,
          userId,
          "AnalysisAgent",
          "Legal Audit",
          JSON.stringify({
            executiveSummary: audit.executiveSummary,
            overallRisk: audit.overallRisk,
            findingsCount: audit.findings.length
          }),
          95
        ]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return audit;
  }
  async runDrafting(params) {
    const prompt = `Mode: ${params.mode}, Level: ${params.detailLevel}, Instructions: ${params.instructions}`;
    return await this.draftingAgent.generateDraft(prompt);
  }
  async runNegotiation(documentContent, playbooks, instructions) {
    return await this.negotiationAgent.negotiate(
      documentContent,
      playbooks,
      instructions
    );
  }
  async askLawyer(prompt, userId, documentIds, jurisdictions, outputFormat) {
    const context = await searchHybrid(prompt, userId, documentIds);
    const contextText = context.map((c) => `[Source: ${c.title}]
${c.content}`).join("\n\n");
    const result = await this.askLawyerAgent.getAdvice({
      prompt,
      context: contextText,
      jurisdictions,
      outputFormat,
      sources: context.map((c) => ({ title: c.title, file_id: c.file_id, content: c.content }))
    });
    return result;
  }
  async remediate(documentId, content, userId, userRole = "USER") {
    return await this.runAnalysis(
      documentId,
      content,
      userId,
      void 0,
      userRole
    );
  }
  async interactAnalyze(folderIds, prompt, userId, _documentMode, answerStyle, history, _folderId, _userRole = "USER") {
    const LEGAL_SEED_TERMS = "indemnity liability limitation termination confidentiality intellectual property payment governing law compliance data protection liquidated damages audit rights obligations warranties representations";
    const retrievalQuery = `${LEGAL_SEED_TERMS} ${prompt.substring(0, 120)}`.trim();
    console.log(`[interactAnalyze] userId=${userId} folderIds=${JSON.stringify(folderIds)}`);
    console.log(`[interactAnalyze] userPrompt(100)="${prompt.substring(0, 100)}"`);
    console.log(`[interactAnalyze] retrievalQuery(120)="${retrievalQuery.substring(0, 120)}"`);
    const context = await searchHybrid(retrievalQuery, userId, void 0, folderIds);
    console.log(
      `[interactAnalyze] Retrieved ${context.length} chunk(s): ` + context.map((c) => `"${c.title ?? c.file_id}"`).join(", ")
    );
    const contextText = context.map((c) => `[File: ${c.title ?? "Untitled"}]
${c.content}`).join("\n\n");
    const systemPrompt = `You are a Senior Legal Counsel and Compliance Analyst.

Your task is to review the provided document context and answer the user's query as a structured legal review report, not as a generic essay.

You must ground your answer in the retrieved document context wherever possible. If the context does not support a point, explicitly say that the reviewed material does not clearly show it. Do not invent clauses, parties, or facts.

Answer Style: ${answerStyle}
${history.length > 0 ? `Prior conversation context:
${JSON.stringify(history)}
` : ""}

CRITICAL OUTPUT RULES:
1. Return the answer in exactly the Markdown structure below.
2. Use all section headings below in the same order.
3. If a section has no strong support in the document context, write "Not clearly identified in the reviewed material." under that section instead of omitting it.
4. Do NOT write a generic legal explainer or general best-practices essay.
5. Tie findings to the uploaded/retrieved document context wherever possible.
6. Under "Key Findings", each finding must follow the exact mini-template shown below.
7. If the user's query is broad, still convert it into a document-focused legal review instead of answering abstractly.
8. Do not add a closing question like "Would you like a deeper dive?".
9. Do not add any extra sections outside the required structure.

Return your answer in this exact format:

# Executive Summary
Write a 2-4 sentence summary of the document risk picture relevant to the user's query.

# Overall Risk Assessment
- **Risk Level:** Low / Medium / High
- **Why:** 2-4 bullets explaining the basis for the rating.

# Key Findings
For each finding, use this exact structure:

## Finding 1: <short finding title>
- **Severity:** Low / Medium / High
- **Relevant Clause / Evidence:** Quote or paraphrase the relevant clause, sentence, or retrieved evidence.
- **Issue:** Explain the legal/commercial problem.
- **Why It Matters:** Explain the consequence or risk if unaddressed.
- **Recommendation:** Give a concrete recommended change.
- **Fallback Position:** Give a minimum acceptable negotiation fallback.

Add as many findings as are genuinely supported by the document context.

# Missing or Weak Clauses
For each missing or weak clause:
- **Clause / Protection:** <name>
- **Why It Matters:** <brief explanation>
- **Recommendation:** <what should be added or strengthened>

If nothing specific can be identified, write:
- Not clearly identified in the reviewed material.

# Compliance Gaps
For each compliance gap:
- **Regulation / Framework:** GDPR / CCPA / DPDPA / other
- **Severity:** RED / YELLOW / GREEN
- **Gap:** <issue>
- **Remediation:** <fix>

If no clear compliance gap is visible from the reviewed material, say so explicitly.

# Recommended Redlines
For each clause that should be revised:
- **Clause:** <name>
- **Current Issue:** <problem>
- **Suggested Revision:** <replacement language or revision direction>

If no specific redline can be proposed from the reviewed material, say so explicitly.

# Obligations & Deadlines
List obligations in this format:
- **Party:** <party or "Not specified">
- **Obligation:** <obligation>
- **Trigger:** <trigger event or "Not specified">
- **Deadline:** <deadline or "Not specified">

If none are identifiable, say:
- Not clearly identifiable from the reviewed material.

IMPORTANT:
- Prefer document-grounded analysis over generic legal advice.
- If the context retrieved is weak or incomplete, say that clearly in the relevant sections.
- Do not add any extra sections outside the required structure.`;
    const userPrompt = `[DOCUMENT CONTEXT]
${contextText || "No document chunks were retrieved from the selected folders. You must still use the required report structure, but clearly state where the reviewed material is insufficient."}

[USER TASK]
User request: ${prompt}

Convert the request into a document-focused legal review report using the required structure. If the request asks about specific risks or clauses, analyze those risks against the reviewed material instead of giving a generic how-to explanation.`;
    try {
      return await openRouterComplete(systemPrompt, userPrompt);
    } catch (err) {
      console.error("interactAnalyze error:", err);
      throw err;
    }
  }
};

// backend/src/services/scannerService.ts
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// backend/src/utils/browserManager.ts
import { chromium } from "playwright";
var BrowserManager = class _BrowserManager {
  constructor() {
    this.browser = null;
    this.launchPromise = null;
    // Track whether we're using a remote endpoint or local launch
    this.usingRemote = false;
  }
  static getInstance() {
    if (!_BrowserManager.instance) {
      _BrowserManager.instance = new _BrowserManager();
    }
    return _BrowserManager.instance;
  }
  async launchLocal() {
    console.log("[BrowserManager] Launching local Chromium browser.");
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });
    this.usingRemote = false;
    return browser;
  }
  async connectRemote(endpoint) {
    console.log("[BrowserManager] Connecting to remote browser endpoint.");
    const browser = await chromium.connectOverCDP(endpoint);
    this.usingRemote = true;
    return browser;
  }
  async getBrowser() {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }
    if (this.launchPromise) {
      return this.launchPromise;
    }
    const endpoint = process.env.BROWSER_ENDPOINT;
    this.launchPromise = (async () => {
      let browser;
      if (endpoint && !endpoint.includes("YOUR_TOKEN_HERE")) {
        try {
          browser = await this.connectRemote(endpoint);
        } catch (remoteErr) {
          console.warn("[BrowserManager] Remote browser failed, falling back to local launch:", remoteErr.message);
          browser = await this.launchLocal();
        }
      } else {
        browser = await this.launchLocal();
      }
      this.browser = browser;
      this.launchPromise = null;
      browser.on("disconnected", () => {
        console.warn("[BrowserManager] Browser disconnected. Will relaunch on next request.");
        this.browser = null;
      });
      return browser;
    })().catch((err) => {
      this.launchPromise = null;
      console.error("[BrowserManager] Failed to start browser:", err);
      throw err;
    });
    return this.launchPromise;
  }
  /**
   * Creates a new browser context. Automatically reconnects if the browser
   * has gone away since the last call.
   */
  async newContext(options) {
    let browser;
    try {
      browser = await this.getBrowser();
    } catch (err) {
      this.browser = null;
      this.launchPromise = null;
      browser = await this.getBrowser();
    }
    if (!browser.isConnected()) {
      this.browser = null;
      browser = await this.launchLocal();
      this.browser = browser;
      browser.on("disconnected", () => {
        console.warn("[BrowserManager] Browser disconnected. Will relaunch on next request.");
        this.browser = null;
      });
    }
    const context = await browser.newContext({
      // Reasonable defaults to avoid detection and reduce resource usage
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      ignoreHTTPSErrors: true,
      ...options
    });
    if (options?.optimizeForScanning) {
      await context.route("**/*", (route) => {
        const resourceType = route.request().resourceType();
        if (["image", "font", "media"].includes(resourceType)) {
          return route.abort();
        }
        return route.continue();
      });
    }
    return context;
  }
  async newPage(options) {
    const context = await this.newContext(options);
    return context.newPage();
  }
  async cleanup() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (_) {
      }
      this.browser = null;
    }
  }
};
var browserManager = BrowserManager.getInstance();

// backend/src/services/scannerService.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var ScannerService = class {
  constructor() {
    this.cookieDb = null;
  }
  async loadCookieDb() {
    if (this.cookieDb) return this.cookieDb;
    try {
      const isProd = process.env.NODE_ENV === "production";
      const dbPath = isProd ? path.resolve(process.cwd(), "dist/backend/src/config/open-cookie-database.json") : path.resolve(__dirname, "../config/open-cookie-database.json");
      const data = await fs.readFile(dbPath, "utf-8");
      this.cookieDb = JSON.parse(data);
      return this.cookieDb;
    } catch (err) {
      console.error("Failed to load cookie database:", err);
      return {};
    }
  }
  validateUrl(url) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const blockedHosts = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "169.254.169.254",
        "::1",
        "::ffff:127.0.0.1",
        "localhost.localdomain"
      ];
      if (blockedHosts.includes(hostname)) {
        return { valid: false, reason: `Blocked hostname: ${hostname}` };
      }
      const privateIPPatterns = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^127\./,
        /^169\.254\./,
        /^fc[0-9a-f]{2}:/i,
        /^fe[89ab][0-9a-f]:/i
      ];
      for (const pattern of privateIPPatterns) {
        if (pattern.test(hostname)) {
          return { valid: false, reason: `Private IP range blocked: ${hostname}` };
        }
      }
      const blockedPorts = ["25", "587", "465"];
      if (blockedPorts.includes(parsed.port)) {
        return { valid: false, reason: `Blocked port: ${parsed.port}` };
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: `Invalid URL format: ${err.message}` };
    }
  }
  async handleConsentBanner(page, action) {
    const acceptSelectors = [
      "#onetrust-accept-btn-handler",
      "#wt-cli-accept-all-btn",
      "#accept-cookies",
      'button:has-text("Accept All")',
      'button:has-text("Allow All")',
      'button:has-text("I Accept")',
      'button:has-text("Agree")',
      '[aria-label*="Accept all"]',
      ".js-accept-all"
    ];
    const rejectSelectors = [
      "#onetrust-reject-all-handler",
      "#wt-cli-reject-all-btn",
      'button:has-text("Reject All")',
      'button:has-text("Decline All")',
      'button:has-text("Only Necessary")',
      'button:has-text("Dismiss")',
      '[aria-label*="Reject all"]',
      ".js-reject-all"
    ];
    const selectors = action === "accept" ? acceptSelectors : rejectSelectors;
    for (const selector of selectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 2e3 })) {
          await button.click();
          await page.waitForLoadState("networkidle", { timeout: 5e3 }).catch(() => {
          });
          return true;
        }
      } catch (e) {
      }
    }
    return false;
  }
  async capturePageState(page) {
    const cdp = await page.context().newCDPSession(page);
    const { cookies } = await cdp.send("Network.getAllCookies");
    await cdp.detach();
    const storage = await page.evaluate(() => {
      return {
        localStorage: { ...localStorage },
        sessionStorage: { ...sessionStorage }
      };
    });
    return { cookies, storage };
  }
  async discoverUrls(rootUrl, limit = 20) {
    const urls = /* @__PURE__ */ new Set([rootUrl]);
    const domain = new URL(rootUrl).hostname;
    const sitemapUrl = new URL("/sitemap.xml", rootUrl).toString();
    if (this.validateUrl(sitemapUrl).valid) {
      try {
        const resp = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5e3) });
        if (resp.ok) {
          const text = await resp.text();
          const matches = text.match(/<loc>(.*?)<\/loc>/g);
          if (matches) {
            for (const m of matches) {
              const loc = m.replace(/<\/?loc>/g, "").trim();
              if (loc && urls.size < limit) {
                try {
                  const u = new URL(loc);
                  if (u.hostname === domain) urls.add(loc);
                } catch (e) {
                }
              }
            }
          }
        }
      } catch (e) {
      }
    }
    if (urls.size >= limit) return Array.from(urls).slice(0, limit);
    let context;
    try {
      context = await browserManager.newContext({ optimizeForScanning: true });
      const page = await context.newPage();
      try {
        await page.goto(rootUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
        const links = await page.evaluate((domain2) => {
          return Array.from(document.querySelectorAll("a")).map((a) => a.href).filter((href) => {
            try {
              const u = new URL(href);
              return u.hostname === domain2 && (u.protocol === "http:" || u.protocol === "https:") && !u.hash;
            } catch (e) {
              return false;
            }
          });
        }, domain);
        for (const link of links) {
          if (urls.size >= limit) break;
          if (this.validateUrl(link).valid) {
            urls.add(link);
          }
        }
      } catch (e) {
        console.warn("[Scanner] discoverUrls page navigation failed, continuing with root URL only:", e.message);
      } finally {
        await page.close().catch(() => {
        });
      }
    } catch (e) {
      console.warn("[Scanner] discoverUrls browser context failed, continuing with root URL only:", e.message);
    } finally {
      if (context) await context.close().catch(() => {
      });
    }
    return Array.from(urls).slice(0, limit);
  }
  async analyzeTrackersWithAI(trackers, url) {
    const trackerSummary = trackers.map((t) => ({
      name: t.name,
      domain: t.domain,
      description: t.description,
      currentCategory: t.category
    }));
    const systemPrompt = `You are a Privacy Engineer. Analyze the provided trackers and categorize them into: 'Necessary', 'Functional', 'Analytics', or 'Marketing'.
Also identify potential compliance risks and provide remediation steps.

CRITICAL: Return ONLY a valid JSON object \u2014 no markdown fences, no commentary \u2014 matching this exact schema:
{
  "categorizedTrackers": [
    {
      "name": "string",
      "category": "Necessary | Functional | Analytics | Marketing",
      "riskLevel": "LOW | MEDIUM | HIGH",
      "explanation": "string",
      "remediation": "string"
    }
  ],
  "overallComplianceRating": "A | B | C | D | F",
  "summary": "string"
}`;
    const userPrompt = `Trackers detected on ${url}:
${JSON.stringify(trackerSummary, null, 2)}`;
    try {
      let responseText = await openRouterComplete(systemPrompt, userPrompt, { jsonMode: true });
      responseText = responseText.trim();
      if (responseText.startsWith("```")) {
        responseText = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      }
      return JSON.parse(responseText);
    } catch (err) {
      console.error("[Scanner] AI analysis failed:", err);
      return null;
    }
  }
  async scanCookie(url, userId, scanDepth = "Deep") {
    try {
      const targetUrl = url.startsWith("http") ? url : `https://${url}`;
      const urlValidation = this.validateUrl(targetUrl);
      if (!urlValidation.valid) {
        return {
          scanSummary: {
            url: targetUrl,
            level: scanDepth,
            overallScore: 0,
            riskLevel: "ERROR",
            error: `URL validation failed: ${urlValidation.reason}`,
            scannedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          cookiesDetected: [],
          complianceGaps: [
            {
              regulation: "SSRF_PROTECTION",
              severity: "RED",
              issue: `Blocked attempt to scan internal/private domain: ${urlValidation.reason}`,
              remediation: "Only scan public URLs (e.g., https://example.com)."
            }
          ]
        };
      }
      const depthLimit = scanDepth === "Lite" ? 1 : scanDepth === "Medium" ? 5 : scanDepth === "Enterprise" ? 15 : 10;
      const urlsToScan = scanDepth === "Lite" ? [targetUrl] : await this.discoverUrls(targetUrl, depthLimit);
      const globalAggregatedCookies = /* @__PURE__ */ new Map();
      const globalAggregatedStorage = { localStorage: {}, sessionStorage: {} };
      let hasConsentBannerGlobal = false;
      const preConsentCookiesGlobal = /* @__PURE__ */ new Map();
      for (const currentUrl of urlsToScan) {
        let preContext;
        try {
          preContext = await browserManager.newContext({ optimizeForScanning: true });
          const prePage = await preContext.newPage();
          try {
            await prePage.goto(currentUrl, { waitUntil: "networkidle", timeout: 3e4 });
            const preState = await this.capturePageState(prePage);
            preState.cookies.forEach((c) => {
              preConsentCookiesGlobal.set(c.name, c);
              globalAggregatedCookies.set(c.name, c);
            });
            Object.assign(globalAggregatedStorage.localStorage, preState.storage.localStorage);
          } catch (e) {
            console.error(`[Scanner] Pre-consent capture failed for ${currentUrl}:`, e.message);
          } finally {
            await prePage.close().catch(() => {
            });
          }
        } catch (e) {
          console.error(`[Scanner] Pre-consent context failed for ${currentUrl}:`, e.message);
        } finally {
          if (preContext) await preContext.close().catch(() => {
          });
        }
      }
      for (let i = 0; i < urlsToScan.length; i++) {
        const currentUrl = urlsToScan[i];
        const isRoot = i === 0;
        let rejectContext;
        try {
          rejectContext = await browserManager.newContext({ optimizeForScanning: true });
          const rejectPage = await rejectContext.newPage();
          try {
            await rejectPage.goto(currentUrl, { waitUntil: "networkidle", timeout: 3e4 });
            if (isRoot) {
              const rejected = await this.handleConsentBanner(rejectPage, "reject");
              if (rejected) hasConsentBannerGlobal = true;
            }
            const postRejectState = await this.capturePageState(rejectPage);
            postRejectState.cookies.forEach((c) => globalAggregatedCookies.set(c.name, c));
          } catch (e) {
            console.error(`[Scanner] Reject flow failed for ${currentUrl}:`, e.message);
          } finally {
            await rejectPage.close().catch(() => {
            });
          }
        } catch (e) {
          console.error(`[Scanner] Reject context failed for ${currentUrl}:`, e.message);
        } finally {
          if (rejectContext) await rejectContext.close().catch(() => {
          });
        }
        let acceptContext;
        try {
          acceptContext = await browserManager.newContext({ optimizeForScanning: true });
          const acceptPage = await acceptContext.newPage();
          try {
            await acceptPage.goto(currentUrl, { waitUntil: "networkidle", timeout: 3e4 });
            if (isRoot) {
              const accepted = await this.handleConsentBanner(acceptPage, "accept");
              if (accepted) hasConsentBannerGlobal = true;
            }
            const postAcceptState = await this.capturePageState(acceptPage);
            postAcceptState.cookies.forEach((c) => globalAggregatedCookies.set(c.name, c));
            Object.assign(globalAggregatedStorage.localStorage, postAcceptState.storage.localStorage);
          } catch (e) {
            console.error(`[Scanner] Accept flow failed for ${currentUrl}:`, e.message);
          } finally {
            await acceptPage.close().catch(() => {
            });
          }
        } catch (e) {
          console.error(`[Scanner] Accept context failed for ${currentUrl}:`, e.message);
        } finally {
          if (acceptContext) await acceptContext.close().catch(() => {
          });
        }
      }
      const allCookies = Array.from(globalAggregatedCookies.values());
      const db = await this.loadCookieDb();
      const detectedCookies = [];
      for (const cookie of allCookies) {
        let matched = false;
        for (const [provider, cookies] of Object.entries(db)) {
          const match = cookies.find((c) => c.cookie?.toLowerCase() === cookie.name.toLowerCase());
          if (match) {
            detectedCookies.push({
              name: cookie.name,
              category: match.category,
              domain: provider,
              description: match.description,
              retention: match.retentionPeriod || "Persistent",
              severity: match.category === "Marketing" || match.category === "Analytics" ? "HIGH" : "LOW"
            });
            matched = true;
            break;
          }
        }
        if (!matched) {
          detectedCookies.push({
            name: cookie.name,
            category: "Unclassified",
            domain: cookie.domain,
            description: "Dynamic JavaScript-set tracker detected via CDP.",
            retention: "Session",
            severity: "MEDIUM"
          });
        }
      }
      const aiAnalysis = await this.analyzeTrackersWithAI(detectedCookies, targetUrl);
      if (aiAnalysis) {
        detectedCookies.forEach((cookie) => {
          const aiMatch = aiAnalysis.categorizedTrackers.find((t) => t.name === cookie.name);
          if (aiMatch) {
            cookie.category = aiMatch.category;
            cookie.severity = aiMatch.riskLevel;
            cookie.description = aiMatch.explanation;
            cookie.remediation = aiMatch.remediation;
          }
        });
      }
      const highRiskCount = detectedCookies.filter((c) => c.severity === "HIGH").length;
      const baseScore = aiAnalysis ? aiAnalysis.overallComplianceRating === "A" ? 95 : aiAnalysis.overallComplianceRating === "B" ? 80 : aiAnalysis.overallComplianceRating === "C" ? 60 : 40 : 100;
      const score = Math.max(0, baseScore - highRiskCount * 5 - detectedCookies.length * 1);
      const risk = score > 75 ? "Low" : score > 45 ? "Medium" : "High";
      const result = {
        scanSummary: {
          url: targetUrl,
          level: scanDepth,
          overallScore: score,
          riskLevel: risk,
          hasConsentBanner: hasConsentBannerGlobal,
          loadsBeforeConsent: preConsentCookiesGlobal.size > 0,
          totalCookiesCount: detectedCookies.length,
          scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
          pagesScanned: urlsToScan.length,
          aiSummary: aiAnalysis?.summary,
          storageDetected: globalAggregatedStorage
        },
        cookiesDetected: detectedCookies,
        complianceGaps: [
          {
            regulation: "GDPR",
            severity: preConsentCookiesGlobal.size > 0 ? "RED" : "GREEN",
            issue: "Trackers firing before user consent across scanned pages.",
            remediation: "Implement a strict 'hold-back' mechanism for all non-essential scripts until explicit consent is given."
          },
          {
            regulation: "Cookie Law",
            severity: !hasConsentBannerGlobal ? "RED" : "GREEN",
            issue: !hasConsentBannerGlobal ? "No visible cookie consent banner detected." : "Consent banner present.",
            remediation: "Deploy a compliant CMP (Consent Management Platform) to manage user preferences."
          }
        ]
      };
      await this.saveScanResult(userId, url, "cookie", score, risk, result);
      return result;
    } catch (err) {
      console.error("3-Stage Cookie scan failed:", err);
      return {
        scanSummary: { url, level: scanDepth, overallScore: 0, riskLevel: "ERROR", error: err.message },
        cookiesDetected: [],
        complianceGaps: [{ regulation: "SCAN_ERROR", severity: "RED", issue: err.message, remediation: "Check destination endpoint." }]
      };
    }
  }
  async scanVulnerability(url, userId) {
    const findings = [];
    try {
      const targetUrl = url.startsWith("http") ? url : `https://${url}`;
      const urlValidation = this.validateUrl(targetUrl);
      if (!urlValidation.valid) {
        return {
          overallRisk: "HIGH",
          securityScore: 0,
          findings: [
            {
              name: "SSRF Protection",
              vector: `Blocked target: ${urlValidation.reason}`,
              severity: "HIGH",
              remediation: "Scan a publicly accessible HTTP or HTTPS URL."
            }
          ]
        };
      }
      const response = await fetch(targetUrl, { method: "GET" });
      const headers = response.headers;
      if (!headers.get("content-security-policy")) {
        findings.push({
          name: "Missing Content-Security-Policy",
          vector: "HTTP response headers",
          severity: "HIGH",
          remediation: "Add a Content-Security-Policy response header that only permits trusted content sources."
        });
      }
      if (!headers.get("strict-transport-security")) {
        findings.push({
          name: "Missing Strict-Transport-Security",
          vector: "HTTPS response headers",
          severity: "MEDIUM",
          remediation: "Add Strict-Transport-Security with an appropriate max-age and includeSubDomains policy."
        });
      }
      if (!headers.get("x-content-type-options") || headers.get("x-content-type-options")?.toLowerCase() !== "nosniff") {
        findings.push({
          name: "Missing X-Content-Type-Options",
          vector: "HTTP response headers",
          severity: "LOW",
          remediation: "Set the X-Content-Type-Options response header to nosniff."
        });
      }
      const score = Math.max(0, 100 - findings.length * 20);
      const risk = score > 80 ? "LOW" : score > 50 ? "MEDIUM" : "HIGH";
      const result = {
        overallRisk: risk,
        securityScore: score,
        findings
      };
      await this.saveScanResult(userId, url, "vulnerability", score, risk, result);
      return result;
    } catch (err) {
      console.error("Vulnerability endpoint scan failed:", err);
      throw err;
    }
  }
  async saveScanResult(userId, url, type, score, risk, payload) {
    await withTransaction(userId, "USER", async (client) => {
      await client.query(
        "INSERT INTO website_scans (user_id, url, scan_type, overall_score, risk_level, payload) VALUES ($1, $2, $3, $4, $5, $6)",
        [userId, url, type, score, risk, JSON.stringify(payload)]
      );
    });
  }
};

// backend/src/services/jobQueue.ts
init_crypto();

// backend/src/utils/retry.ts
async function withRetry(fn, retries = 3, delay = 1e3) {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    const isTransient = error.message?.includes("fetch failed") || error.message?.includes("socket hang up") || error.message?.includes("ECONNRESET") || error.message?.includes("Connection terminated") || error.message?.includes("connection timeout") || error.message?.includes("503") || error.message?.includes("504") || error.message?.includes("429");
    if (!isTransient) throw error;
    console.warn(`Retry attempt remaining: ${retries}. Error: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

// backend/src/services/jobQueue.ts
import crypto4 from "crypto";
import pdf from "pdf-parse-fork";
import mammoth from "mammoth";
async function updateJobProgress(jobId, userId, progress, message) {
  await withTransaction(userId, "USER", async (client) => {
    await client.query(
      "UPDATE jobs SET progress = $1, message = $2 WHERE id = $3",
      [progress, message, jobId]
    );
  });
  jobRegistry.broadcast(userId, { id: jobId, progress, message });
}
async function updateJobState(jobId, userId, updates) {
  const columnMap = {
    userId: "user_id",
    createdAt: "created_at",
    completedAt: "completed_at"
    // result, error, status, progress, message, type all match DB column names directly
  };
  const fields = Object.keys(updates).map((k, i) => `${columnMap[k] ?? k} = $${i + 1}`).join(", ");
  const values = Object.values(updates).map(
    (v) => v !== null && typeof v === "object" ? JSON.stringify(v) : v
  );
  await withTransaction(userId, "USER", async (client) => {
    await client.query(
      `UPDATE jobs SET ${fields} WHERE id = $${values.length + 1}`,
      [...values, jobId]
    );
  });
}
async function addJobToQueue(userId, type, payload) {
  const jobId = crypto4.randomUUID();
  await withTransaction(userId, "USER", async (client) => {
    await client.query(
      `INSERT INTO jobs (id, user_id, type, status, progress, payload)
       VALUES ($1, $2, $3, 'queued', 0, $4)`,
      [jobId, userId, type, JSON.stringify(payload)]
    );
  });
  (async () => {
    try {
      await updateJobState(jobId, userId, { status: "processing", progress: 5 });
      jobRegistry.broadcast(userId, { id: jobId, status: "processing", progress: 5 });
      let result;
      switch (type) {
        case "file_processing":
          result = await executeFileProcessing(jobId, userId, payload);
          break;
        case "document_analysis":
          result = await executeDocumentAnalysis(jobId, userId, payload);
          break;
        case "privacy_scanning":
          result = await executePrivacyScanning(jobId, userId, payload);
          break;
        case "vulnerability_scanning":
          result = await executeVulnerabilityScanning(jobId, userId, payload);
          break;
        case "template_drafting":
          result = await executeTemplateDrafting(jobId, userId, payload);
          break;
        default:
          throw new Error(`Unhandled job type: ${type}`);
      }
      await updateJobState(jobId, userId, {
        status: "completed",
        progress: 100,
        result: JSON.stringify(result)
      });
      jobRegistry.broadcast(userId, {
        id: jobId,
        userId,
        status: "completed",
        progress: 100,
        result
      });
    } catch (err) {
      console.error(`[JobRunner] Job ${jobId} failed:`, err);
      jobRegistry.broadcast(userId, {
        id: jobId,
        userId,
        status: "failed",
        error: err.message
      });
      await updateJobState(jobId, userId, {
        status: "failed",
        error: err.message
      }).catch((dbErr) => console.error(`[JobRunner] Failed to persist error state for job ${jobId}:`, dbErr));
    }
  })();
  return { id: jobId };
}
var BackgroundJobRegistry = class {
  constructor() {
    this.clients = /* @__PURE__ */ new Set();
    this.orchestrator = new AgentOrchestrator();
    this.scanner = new ScannerService();
  }
  broadcast(userId, job) {
    const payloadStr = JSON.stringify({ event: "job_update", job });
    for (const client of this.clients) {
      if (client.userId === userId) {
        client.send(`data: ${payloadStr}

`);
      }
    }
  }
  addClient(userId, res) {
    const id = "client_" + crypto4.randomUUID();
    res.write(`data: ${JSON.stringify({ event: "ping", timestamp: (/* @__PURE__ */ new Date()).toISOString() })}

`);
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`:ping

`);
      } catch (err) {
        clearInterval(heartbeatInterval);
      }
    }, 15e3);
    const client = {
      id,
      userId,
      send: (data) => {
        try {
          res.write(data);
        } catch (err) {
          console.warn("[JobRegistry SSE] Failed to push data for client:", id);
        }
      }
    };
    this.clients.add(client);
    return id;
  }
  removeClient(id) {
    for (const client of this.clients) {
      if (client.id === id) {
        this.clients.delete(client);
        break;
      }
    }
  }
  async getJob(id) {
    const { rows } = await pool.query("SELECT * FROM jobs WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    return this.mapDbJobToJob(rows[0]);
  }
  async getUserJobs(userId) {
    const { rows } = await pool.query(
      "SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return rows.map((r) => this.mapDbJobToJob(r));
  }
  mapDbJobToJob(row) {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      status: row.status,
      progress: row.progress,
      message: row.message,
      payload: row.payload,
      result: row.result,
      error: row.error,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at ? row.completed_at.toISOString() : void 0
    };
  }
};
var jobRegistry = new BackgroundJobRegistry();
async function executeFileProcessing(jobId, userId, payload) {
  const { fileId, fileBufferBase64, mimeType } = payload;
  await updateJobProgress(jobId, userId, 15, "Extracting text from document...");
  const buffer = Buffer.from(fileBufferBase64, "base64");
  let content = "";
  if (mimeType === "application/pdf") {
    const data = await pdf(buffer);
    content = data.text;
  } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const data = await mammoth.extractRawText({ buffer });
    content = data.value;
  } else if (mimeType.startsWith("text/")) {
    content = buffer.toString("utf-8");
  } else {
    content = buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
  }
  content = content.replace(/\0/g, "");
  const encryptedContent = encryptData(content);
  await updateJobProgress(jobId, userId, 50, "Updating database and indexing for search...");
  const rowCount = await withTransaction(userId, "USER", async (client) => {
    const result = await client.query(
      `UPDATE files SET content = $1, is_encrypted = $2 WHERE id = $3`,
      [encryptedContent, true, fileId]
    );
    const versionId = "ver_" + crypto4.randomUUID();
    await client.query(
      `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
      [versionId, fileId, encryptedContent]
    );
    return result.rowCount;
  });
  if (rowCount === 0) throw new Error(`File record ${fileId} not found.`);
  await chunkAndIndexDocument(fileId, content, userId);
  return { fileId, content };
}
async function executeDocumentAnalysis(jobId, userId, payload) {
  const userRole = await withTransaction(userId, "USER", async (client) => {
    const { rows } = await client.query("SELECT role FROM users WHERE id = $1", [userId]);
    return rows[0]?.role || "USER";
  });
  if (payload.type === "legal_ask") {
    const { prompt, documents, jurisdiction, outputFormat } = payload;
    await updateJobProgress(jobId, userId, 30, "Searching knowledge base and synthesizing advice...");
    console.log(`[JobRunner/legal_ask] Calling askLawyer via OpenRouter`);
    console.log(`  prompt: "${String(prompt).substring(0, 80)}..."`);
    console.log(`  jurisdictions: ${JSON.stringify(jurisdiction || [])}`);
    console.log(`  outputFormat: ${outputFormat || "Full IRAC"}`);
    const result2 = await jobRegistry.orchestrator.askLawyer(
      prompt,
      userId,
      documents,
      jurisdiction,
      outputFormat
    );
    return {
      text: result2.text || result2,
      sources: result2.sources || []
    };
  }
  if (payload.prompt && payload.folderIds) {
    const { folderIds: folderIds2, prompt, documentMode, answerStyle, history } = payload;
    await updateJobProgress(jobId, userId, 30, "Analyzing documents in selected folders...");
    const result2 = await jobRegistry.orchestrator.interactAnalyze(
      folderIds2,
      prompt,
      userId,
      documentMode,
      answerStyle,
      history,
      void 0,
      userRole
    );
    return { analysis: result2, clauses: [] };
  }
  const { documentId, content, folderIds } = payload;
  await updateJobProgress(jobId, userId, 30, "AI agents performing legal audit...");
  const result = await jobRegistry.orchestrator.runAnalysis(
    documentId,
    content,
    userId,
    Array.isArray(folderIds) ? folderIds : void 0,
    userRole
  );
  return result;
}
async function executeTemplateDrafting(jobId, userId, payload) {
  if (payload.type === "refine") {
    const { text, refineType, param } = payload;
    let instruction = "";
    if (refineType === "tone") instruction = `Rewrite the following legal text in a ${param} tone.`;
    else if (refineType === "grammar") instruction = `Fix the spelling and grammar in the following legal text while preserving legal meaning.`;
    else if (refineType === "extend") instruction = `Expand the following legal clause with more comprehensive protections.`;
    else if (refineType === "reduce") instruction = `Shorten the following legal clause to its core obligation.`;
    else if (refineType === "simplify") instruction = `Rewrite the following legal text in plain English for a non-lawyer.`;
    else if (refineType === "complete") instruction = `Complete the following sentence or clause in a professional legal manner.`;
    else if (refineType === "ask") instruction = `Follow this custom instruction: ${param}`;
    const prompt = `${instruction}

Text:
${text}

IMPORTANT: Return only the rewritten text without any quotes or preamble.`;
    const content = await withRetry(() => openRouterComplete("", prompt));
    const docId2 = "doc_" + crypto4.randomUUID();
    const title2 = `Refined Text - ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`;
    const { email: creatorEmail2 } = await withTransaction(userId, "USER", async (client) => {
      const { rows } = await client.query("SELECT email FROM users WHERE id = $1", [userId]);
      return { email: rows[0]?.email || "" };
    });
    const encryptedContent2 = encryptData(content);
    await withTransaction(userId, "USER", async (client) => {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [docId2, title2, "draft", encryptedContent2, userId, creatorEmail2, true, JSON.stringify([]), JSON.stringify([])]
      );
      const versionId = "ver_" + crypto4.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, docId2, encryptedContent2]
      );
    });
    chunkAndIndexDocument(docId2, content, userId).catch(
      (err) => console.warn(`[executeTemplateDrafting/refine] Chunk indexing failed for ${docId2}:`, err)
    );
    return { data: content, file_id: docId2 };
  }
  const { mode, outputLevel, instructions, formFields, templateId, sourceText, playbookText } = payload;
  await updateJobProgress(jobId, userId, 20, "Synthesizing legal document...");
  const result = await jobRegistry.orchestrator.runDrafting({
    mode,
    detailLevel: outputLevel,
    instructions,
    formFields,
    templateId,
    sourceText,
    playbookText
  });
  const docId = "doc_" + crypto4.randomUUID();
  const title = `AI Draft - ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`;
  const { email: creatorEmail } = await withTransaction(userId, "USER", async (client) => {
    const { rows } = await client.query("SELECT email FROM users WHERE id = $1", [userId]);
    return { email: rows[0]?.email || "" };
  });
  const encryptedContent = encryptData(result);
  await withTransaction(userId, "USER", async (client) => {
    await client.query(
      `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [docId, title, "draft", encryptedContent, userId, creatorEmail, true, JSON.stringify([]), JSON.stringify([])]
    );
    const versionId = "ver_" + crypto4.randomUUID();
    await client.query(
      `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
      [versionId, docId, encryptedContent]
    );
  });
  chunkAndIndexDocument(docId, result, userId).catch(
    (err) => console.warn(`[executeTemplateDrafting] Chunk indexing failed for ${docId}:`, err)
  );
  return { content: result, file_id: docId };
}
async function executePrivacyScanning(jobId, userId, payload) {
  await updateJobProgress(jobId, userId, 20, "Scanning website for privacy compliance...");
  const result = await jobRegistry.scanner.scanCookie(payload.url, userId, payload.scanDepth);
  return result;
}
async function executeVulnerabilityScanning(jobId, userId, payload) {
  await updateJobProgress(jobId, userId, 20, "Performing vulnerability assessment...");
  const result = await jobRegistry.scanner.scanVulnerability(payload.url, userId);
  return result;
}

// backend/src/services/exportService.ts
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TableRow,
  TableCell,
  Table,
  WidthType,
  BorderStyle
} from "docx";
import MarkdownIt from "markdown-it";
var md = new MarkdownIt({ html: false, linkify: true, typographer: true });
function isHtmlContent(content) {
  return /<[a-z][\s\S]*>/i.test(content.trim());
}
function contentToHtml(content) {
  return isHtmlContent(content) ? content : md.render(content);
}
function contentToTokens(content) {
  if (isHtmlContent(content)) {
    const asMarkdown = content.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, inner) => `# ${stripTags(inner)}

`).replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, inner) => `## ${stripTags(inner)}

`).replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, inner) => `### ${stripTags(inner)}

`).replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_m, inner) => `#### ${stripTags(inner)}

`).replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_m, inner) => `##### ${stripTags(inner)}

`).replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_m, inner) => `###### ${stripTags(inner)}

`).replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_m, inner) => `**${inner}**`).replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_m, inner) => `_${inner}_`).replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, (_m, inner) => inner).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<p[^>]*>/gi, "").replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => `- ${stripTags(inner)}
`).replace(/<\/?[uo]l[^>]*>/gi, "\n").replace(/<hr\s*\/?>/gi, "\n---\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return md.parse(asMarkdown, {});
  }
  return md.parse(content, {});
}
function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").trim();
}
var buildPdfBuffer = async (title, contentType, content) => {
  const page = await browserManager.newPage();
  const context = page.context();
  try {
    const renderedContent = contentToHtml(content);
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #111827; line-height: 1.6; }
    h1 { font-size: 24px; color: #000; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-transform: uppercase; }
    h2 { font-size: 18px; margin-top: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
    h3 { font-size: 16px; margin-top: 20px; font-weight: bold; }
    p  { margin-bottom: 15px; text-align: justify; }
    ul, ol { margin-bottom: 15px; padding-left: 20px; }
    li { margin-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 12px; }
    th { background-color: #f9fafb; font-weight: bold; }
    .header { color: #6b7280; font-size: 12px; margin-bottom: 40px; }
    .footer { margin-top: 50px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    .content-area { font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    Lexify Digital Asset Vault \u2022 ${contentType.toUpperCase().replace("_", " ")}
    <br>Generated on ${(/* @__PURE__ */ new Date()).toLocaleString()}
  </div>
  <h1>${title}</h1>
  <div class="content-area">${renderedContent}</div>
  <div class="footer">Confidential Document \u2022 Powered by Lexify Multi-Agent Legal Engine</div>
</body>
</html>`;
    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
      printBackground: true
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
    await context.close();
  }
};
function inlineTokensToRuns(tokens) {
  const runs = [];
  let bold = false;
  let italic = false;
  let underline = false;
  for (const token of tokens) {
    if (token.type === "strong_open") {
      bold = true;
      continue;
    }
    if (token.type === "strong_close") {
      bold = false;
      continue;
    }
    if (token.type === "em_open") {
      italic = true;
      continue;
    }
    if (token.type === "em_close") {
      italic = false;
      continue;
    }
    if (token.type === "s_open") {
      underline = true;
      continue;
    }
    if (token.type === "s_close") {
      underline = false;
      continue;
    }
    if (token.type === "softbreak" || token.type === "hardbreak") {
      runs.push(new TextRun({ text: " " }));
      continue;
    }
    if (token.type === "text" || token.type === "code_inline") {
      const text = token.content ?? "";
      if (text) {
        runs.push(
          new TextRun({
            text,
            bold: bold || void 0,
            italics: italic || void 0,
            underline: underline ? { type: "single" } : void 0
          })
        );
      }
      continue;
    }
    if (token.type === "link_open") continue;
    if (token.type === "link_close") continue;
    if (token.content) {
      runs.push(new TextRun({ text: token.content, bold: bold || void 0, italics: italic || void 0 }));
    }
  }
  if (runs.length === 0) runs.push(new TextRun({ text: "" }));
  return runs;
}
function tokensToDocxChildren(tokens) {
  const children = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.type === "heading_open") {
      const level = parseInt(token.tag.replace("h", ""), 10);
      const inlineToken = tokens[i + 1];
      const headingMap = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6
      };
      const runs = inlineToken?.children ? inlineTokensToRuns(inlineToken.children) : [new TextRun({ text: inlineToken?.content ?? "" })];
      children.push(
        new Paragraph({
          heading: headingMap[level] ?? HeadingLevel.HEADING_1,
          children: runs,
          spacing: { before: 240, after: 120 }
        })
      );
      i += 3;
      continue;
    }
    if (token.type === "paragraph_open") {
      const inlineToken = tokens[i + 1];
      const runs = inlineToken?.children ? inlineTokensToRuns(inlineToken.children) : [new TextRun({ text: inlineToken?.content ?? "" })];
      children.push(
        new Paragraph({
          children: runs,
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 80, after: 120 }
        })
      );
      i += 3;
      continue;
    }
    if (token.type === "bullet_list_open") {
      i++;
      while (i < tokens.length && tokens[i].type !== "bullet_list_close") {
        if (tokens[i].type === "list_item_open") {
          i++;
          while (i < tokens.length && tokens[i].type !== "list_item_close") {
            if (tokens[i].type === "paragraph_open" || tokens[i].type === "inline") {
              const inlineTok = tokens[i].type === "inline" ? tokens[i] : tokens[i + 1];
              const runs = inlineTok?.children ? inlineTokensToRuns(inlineTok.children) : [new TextRun({ text: inlineTok?.content ?? "" })];
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: "\u2022 " }), ...runs],
                  indent: { left: 360 },
                  spacing: { before: 40, after: 40 }
                })
              );
              if (tokens[i].type === "paragraph_open") i += 3;
              else i++;
              continue;
            }
            i++;
          }
        }
        i++;
      }
      i++;
      continue;
    }
    if (token.type === "ordered_list_open") {
      let listCounter = parseInt(token.attrGet("start") ?? "1", 10);
      i++;
      while (i < tokens.length && tokens[i].type !== "ordered_list_close") {
        if (tokens[i].type === "list_item_open") {
          const num = listCounter++;
          i++;
          while (i < tokens.length && tokens[i].type !== "list_item_close") {
            if (tokens[i].type === "paragraph_open" || tokens[i].type === "inline") {
              const inlineTok = tokens[i].type === "inline" ? tokens[i] : tokens[i + 1];
              const runs = inlineTok?.children ? inlineTokensToRuns(inlineTok.children) : [new TextRun({ text: inlineTok?.content ?? "" })];
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: `${num}. ` }), ...runs],
                  indent: { left: 360 },
                  spacing: { before: 40, after: 40 }
                })
              );
              if (tokens[i].type === "paragraph_open") i += 3;
              else i++;
              continue;
            }
            i++;
          }
        }
        i++;
      }
      i++;
      continue;
    }
    if (token.type === "code_block" || token.type === "fence") {
      const lines = (token.content ?? "").split("\n");
      for (const line of lines) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, font: "Courier New", size: 18 })],
            spacing: { before: 40, after: 40 },
            indent: { left: 360 }
          })
        );
      }
      i++;
      continue;
    }
    if (token.type === "hr") {
      children.push(new Paragraph({ text: "", spacing: { before: 120, after: 120 } }));
      i++;
      continue;
    }
    if (token.type === "table_open") {
      const rows = [];
      i++;
      while (i < tokens.length && tokens[i].type !== "table_close") {
        if (tokens[i].type === "tr_open") {
          const cells = [];
          i++;
          while (i < tokens.length && tokens[i].type !== "tr_close") {
            if (tokens[i].type === "th_open" || tokens[i].type === "td_open") {
              const isHeader = tokens[i].type === "th_open";
              i++;
              const inlineTok = tokens[i];
              const runs = inlineTok?.children ? inlineTokensToRuns(inlineTok.children) : [new TextRun({ text: inlineTok?.content ?? "" })];
              if (isHeader) runs.forEach((r) => {
                r._data.bold = true;
              });
              cells.push(
                new TableCell({
                  children: [new Paragraph({ children: runs })],
                  width: { size: 20, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1 },
                    bottom: { style: BorderStyle.SINGLE, size: 1 },
                    left: { style: BorderStyle.SINGLE, size: 1 },
                    right: { style: BorderStyle.SINGLE, size: 1 }
                  }
                })
              );
              i += 2;
              continue;
            }
            i++;
          }
          if (cells.length > 0) rows.push(new TableRow({ children: cells }));
        }
        i++;
      }
      if (rows.length > 0) {
        children.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
      }
      i++;
      continue;
    }
    if (token.type === "blockquote_open") {
      i++;
      while (i < tokens.length && tokens[i].type !== "blockquote_close") {
        if (tokens[i].type === "inline") {
          const runs = inlineTokensToRuns(tokens[i].children ?? []);
          children.push(
            new Paragraph({
              children: runs,
              indent: { left: 720 },
              spacing: { before: 80, after: 80 }
            })
          );
        }
        i++;
      }
      i++;
      continue;
    }
    i++;
  }
  return children;
}
var buildDocxBuffer = async (title, _contentType, content) => {
  const tokens = contentToTokens(content);
  const bodyChildren = tokensToDocxChildren(tokens);
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 24 },
          paragraph: { spacing: { line: 276 } }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }
            // ~2cm
          }
        },
        children: [
          // Document title
          new Paragraph({
            text: title,
            heading: HeadingLevel.TITLE,
            spacing: { before: 0, after: 480 }
          }),
          // Separator
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated by Lexify \u2022 ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`,
                size: 18,
                color: "888888"
              })
            ],
            spacing: { before: 0, after: 480 }
          }),
          // Body
          ...bodyChildren,
          // Footer paragraph
          new Paragraph({
            children: [
              new TextRun({
                text: "Confidential Document \u2022 Powered by Lexify Multi-Agent Legal Engine",
                size: 16,
                color: "9CA3AF"
              })
            ],
            spacing: { before: 480, after: 0 }
          })
        ]
      }
    ]
  });
  return await Packer.toBuffer(doc);
};

// backend/src/controllers/documents.ts
init_crypto();
import crypto5 from "crypto";
import { fileTypeFromBuffer } from "file-type";
var getDocuments = async (req, res) => {
  const userEmail = req.user.email.toLowerCase();
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const docs = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM files WHERE creator_id = current_setting('app.current_user_id', true) OR shared_with::jsonb @> $1::jsonb OR shared_with::jsonb @> $2::jsonb ORDER BY created_at DESC",
        [JSON.stringify([userEmail]), JSON.stringify([{ email: userEmail }])]
      );
      return rows;
    }).catch((e) => {
      console.error("Failed to fetch documents from DB:", e);
      throw new Error("DB_FETCH_FAILED");
    });
    const formattedDocs = docs.map((r) => ({
      ...r,
      content: r.is_encrypted ? decrypt(r.content) : r.content,
      isEncrypted: r.is_encrypted,
      signatures: r.signatures || [],
      redlines: r.redlines || [],
      sharedWith: r.shared_with || [],
      auditLogs: r.audit_logs || []
    }));
    return res.json(formattedDocs);
  } catch (err) {
    const message = err.message === "DB_FETCH_FAILED" ? "Security enclave database unreachable." : "Internal error fetching document repository.";
    res.status(500).json({ error: message });
  }
};
var getDocumentById = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
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
        versions: versionRows.map((v) => ({
          id: v.id,
          content: decrypt(v.content),
          createdAt: v.created_at
        })),
        signatures: r.signatures || [],
        redlines: r.redlines || [],
        sharedWith: r.shared_with || [],
        auditLogs: r.audit_logs || []
      };
    });
    if (doc) {
      return res.json(doc);
    }
    res.status(404).json({ error: "Document not found." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var createDocument = async (req, res) => {
  const { title, type, content } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  const email = req.user.email;
  const id = "doc_" + crypto5.randomUUID();
  const encryptedContent = encrypt(content || "");
  try {
    await withTransaction(userId, userRole, async (client) => {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, title, type, encryptedContent, userId, email, true, JSON.stringify([]), JSON.stringify([])]
      );
      const versionId = "ver_" + crypto5.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, id, encryptedContent]
      );
    });
    if (content && content.trim().length > 0) {
      chunkAndIndexDocument(id, content, userId).catch(
        (err) => console.warn(`[createDocument] Chunk indexing failed for ${id}:`, err)
      );
    }
    res.status(201).json({ id, title, type });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var uploadDocument = async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded. Verify multipart/form-data boundary." });
  const allowedMimeTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "application/msword"
  ];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return res.status(400).json({ error: "Unsupported file type. Only PDF, DOCX, and TXT are permitted for legal indexing." });
  }
  if (file.size > 25 * 1024 * 1024) {
    return res.status(400).json({ error: "File size exceeds 25MB security threshold." });
  }
  const type = await fileTypeFromBuffer(file.buffer);
  const detectedMime = type?.mime || file.mimetype;
  if (!allowedMimeTypes.includes(detectedMime)) {
    return res.status(400).json({ error: "File signature mismatch. Extension does not match content magic bytes." });
  }
  const { title, folder_id } = req.body;
  const fileId = "doc_" + crypto5.randomUUID();
  const fileTitle = title || file.originalname;
  const userId = req.user.id;
  const userRole = req.user.role;
  let resolvedFolderId;
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
        [fileId, fileTitle, "upload", "", req.user.id, req.user.email, file.mimetype, resolvedFolderId]
      );
    }).catch((e) => {
      console.error("Database insert failed during upload:", e);
      throw new Error("DB_UPLOAD_FAILED");
    });
    const job = await addJobToQueue(req.user.id, "file_processing", {
      fileId,
      fileTitle,
      fileBufferBase64: file.buffer.toString("base64"),
      mimeType: file.mimetype,
      folder_id: resolvedFolderId,
      creatorEmail: req.user.email
    });
    res.status(202).json({ success: true, job_id: job.id, file_id: fileId });
  } catch (err) {
    console.error("Document upload route crash:", err);
    const message = err.message === "DB_UPLOAD_FAILED" ? "Failed to register upload in security log." : "Internal error during background job queueing.";
    res.status(500).json({ error: message });
  }
};
var updateDocument = async (req, res) => {
  const { id } = req.params;
  const { title, content, folder_id } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
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
      const versionId = "ver_" + crypto5.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, id, encryptedContent]
      );
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "document_update", JSON.stringify({ documentId: id, title })]);
    });
    if (content && content.trim().length > 0) {
      pool.query(
        "DELETE FROM legal_document_chunks WHERE file_id = $1 AND user_id = $2",
        [id, userId]
      ).then(() => chunkAndIndexDocument(id, content, userId)).catch((err) => console.warn(`[updateDocument] Re-indexing failed for ${id}:`, err));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
var deleteDocument = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rowCount } = await client.query("DELETE FROM files WHERE id = $1", [id]);
      if (rowCount === 0) throw new Error("Document not found");
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "document_delete", JSON.stringify({ documentId: id })]);
    });
    res.json({ success: true });
  } catch (err) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
var shareDocument = async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const sharedWith = await withTransaction(userId, userRole, async (client) => {
      const { rows: userRows } = await client.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
      if (userRows.length === 0) throw new Error("USER_NOT_FOUND");
      const { rows } = await client.query("SELECT shared_with FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      const sharedWith2 = rows[0].shared_with || [];
      if (!sharedWith2.includes(email.toLowerCase())) {
        sharedWith2.push(email.toLowerCase());
      }
      await client.query("UPDATE files SET shared_with = $1 WHERE id = $2", [JSON.stringify(sharedWith2), id]);
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "document_share", JSON.stringify({ documentId: id, sharedWith: email })]);
      return sharedWith2;
    });
    res.json({ success: true, sharedWith });
  } catch (err) {
    if (err.message === "USER_NOT_FOUND") return res.status(404).json({ error: "User with this email not found." });
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
var requestSignature = async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const signatures = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT signatures FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "signature_request", JSON.stringify({ documentId: id, requestedFrom: email })]);
      return rows[0].signatures || [];
    });
    res.json({ success: true, signatures });
  } catch (err) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
var signDocument = async (req, res) => {
  const { id } = req.params;
  const signatureData = req.body.signatureData ?? req.body.fullName;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT signatures, content, is_encrypted FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      const signatures = rows[0].signatures || [];
      const plaintext = rows[0].is_encrypted ? decrypt(rows[0].content) : rows[0].content;
      const contentHash = crypto5.createHash("sha256").update(plaintext, "utf8").digest("hex");
      const newSignature = {
        id: crypto5.randomUUID(),
        userId,
        userEmail: req.user.email,
        signedAt: (/* @__PURE__ */ new Date()).toISOString(),
        contentHash,
        signatureData
      };
      signatures.push(newSignature);
      await client.query("UPDATE files SET signatures = $1 WHERE id = $2", [JSON.stringify(signatures), id]);
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "document_sign", JSON.stringify({ documentId: id, signatureId: newSignature.id })]);
    });
    res.json({ success: true });
  } catch (err) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
function parseRedlines(raw) {
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
    }
  }
  return [];
}
var createRedline = async (req, res) => {
  const { id } = req.params;
  const { originalText, proposedText, comment } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const newRedline = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT redlines FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      const redlines = parseRedlines(rows[0].redlines);
      const redline = { id: crypto5.randomUUID(), originalText, proposedText, comment, proposedByEmail: req.user.email, proposedAt: (/* @__PURE__ */ new Date()).toISOString(), status: "pending" };
      redlines.push(redline);
      await client.query("UPDATE files SET redlines = $1 WHERE id = $2", [JSON.stringify(redlines), id]);
      console.log("[createRedline] persisted redline", {
        documentId: id,
        createdRedlineId: redline.id,
        redlineIdsAfterSave: redlines.map((r) => r.id),
        rawType: typeof rows[0].redlines
      });
      return redline;
    });
    res.status(201).json(newRedline);
  } catch (err) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
var acceptRedline = async (req, res) => {
  const { id, redlineId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT * FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("DOCUMENT_NOT_FOUND");
      const doc = rows[0];
      const redlines = parseRedlines(doc.redlines);
      console.log("[acceptRedline] lookup", {
        documentId: id,
        requestedRedlineId: redlineId,
        storedRedlineIds: redlines.map((r) => r.id),
        redlineCount: redlines.length
      });
      const index = redlines.findIndex((r) => r.id === redlineId);
      if (index === -1) throw new Error("REDLINE_NOT_FOUND");
      const proposal = redlines[index];
      if (proposal.status === "accepted") {
        throw new Error("ALREADY_ACCEPTED");
      }
      const currentContent = doc.is_encrypted ? decrypt(doc.content) : doc.content;
      const finalContent = applyClauseReplacement(
        currentContent,
        proposal.originalText,
        proposal.proposedText
      );
      redlines[index].status = "accepted";
      redlines[index].acceptedAt = (/* @__PURE__ */ new Date()).toISOString();
      redlines[index].acceptedBy = req.user.email;
      const encryptedFinal = encrypt(finalContent);
      await client.query(
        "UPDATE files SET content = $1, redlines = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [encryptedFinal, JSON.stringify(redlines), id]
      );
      const versionId = "ver_" + crypto5.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, id, encryptedFinal]
      );
      await client.query(
        `INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
         VALUES ($1, $2, $3)`,
        [userId, "redline_accept", JSON.stringify({
          documentId: id,
          redlineId,
          originalText: proposal.originalText.substring(0, 100),
          proposedText: proposal.proposedText.substring(0, 100)
        })]
      );
    });
    res.json({ success: true });
  } catch (err) {
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
      return res.status(400).json({ error: err.message.replace("CLAUSE_", "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) });
    }
    res.status(500).json({ error: "Internal error processing redline acceptance" });
  }
};
var rejectRedline = async (req, res) => {
  const { id, redlineId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT redlines FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("DOCUMENT_NOT_FOUND");
      const redlines = parseRedlines(rows[0].redlines);
      const index = redlines.findIndex((r) => r.id === redlineId);
      if (index === -1) throw new Error("REDLINE_NOT_FOUND");
      redlines[index].status = "rejected";
      redlines[index].rejectedAt = (/* @__PURE__ */ new Date()).toISOString();
      redlines[index].rejectedBy = req.user.email;
      await client.query("UPDATE files SET redlines = $1 WHERE id = $2", [JSON.stringify(redlines), id]);
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "redline_reject", JSON.stringify({ documentId: id, redlineId })]);
    });
    res.json({ success: true });
  } catch (err) {
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
function applyClauseReplacement(documentContent, originalText, proposedText) {
  const firstExact = documentContent.indexOf(originalText);
  if (firstExact !== -1) {
    const secondExact = documentContent.indexOf(originalText, firstExact + 1);
    if (secondExact !== -1) {
      throw new Error(
        "CLAUSE_Clause matched multiple locations in the current document. Redline cannot be safely applied."
      );
    }
    return documentContent.substring(0, firstExact) + proposedText + documentContent.substring(firstExact + originalText.length);
  }
  const normalizedTarget = originalText.replace(/\s+/g, " ").trim();
  if (normalizedTarget.length === 0) {
    throw new Error("CLAUSE_Could not locate the original clause in the current document state.");
  }
  const normChars = [];
  const normToOrig = [];
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
  const origStart = normToOrig[firstNorm];
  const origEnd = normToOrig[firstNorm + normalizedTarget.length - 1] + 1;
  return documentContent.substring(0, origStart) + proposedText + documentContent.substring(origEnd);
}
var exportDocument = async (req, res) => {
  const { title, format, contentType, content, documentId } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    if (documentId) {
      await withTransaction(userId, userRole, async (client) => {
        await client.query(`
          INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
          VALUES ($1, $2, $3)
        `, [userId, "document_export", JSON.stringify({ documentId, format, title })]);
      });
    }
    let buffer;
    let mimeType;
    let filename;
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// backend/src/routes/documents.ts
import multer from "multer";
var router3 = Router3();
var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 75 * 1024 * 1024 } });
router3.get("/", authenticateToken, getDocuments);
router3.get("/:id", authenticateToken, getDocumentById);
router3.post("/", authenticateToken, createDocument);
router3.put("/:id", authenticateToken, updateDocument);
router3.delete("/:id", authenticateToken, deleteDocument);
router3.post("/upload", authenticateToken, upload.single("file"), uploadDocument);
router3.post("/export", authenticateToken, exportDocument);
router3.post("/:id/share", authenticateToken, shareDocument);
router3.post("/:id/request-signature", authenticateToken, requestSignature);
router3.post("/:id/sign", authenticateToken, signDocument);
router3.post("/:id/redline", authenticateToken, createRedline);
router3.post("/:id/redline/:redlineId/accept", authenticateToken, acceptRedline);
router3.post("/:id/redline/:redlineId/reject", authenticateToken, rejectRedline);
var documents_default = router3;

// backend/src/routes/folders.ts
import { Router as Router4 } from "express";
var router4 = Router4();
router4.get("/", authenticateToken, getFolders);
router4.post("/", authenticateToken, createFolder);
router4.delete("/:id", authenticateToken, deleteFolder);
var folders_default = router4;

// backend/src/routes/libraryItems.ts
import { Router as Router5 } from "express";

// backend/src/controllers/libraryItems.ts
import crypto6 from "crypto";
var getLibraryItems = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows: rows2 } = await client.query(
        "SELECT * FROM library_items WHERE user_id = current_setting('app.current_user_id', true) ORDER BY created_at DESC"
      );
      return rows2;
    }).catch((e) => {
      console.error("Vault retrieval failed:", e);
      throw new Error("VAULT_READ_ERROR");
    });
    res.json(rows);
  } catch (err) {
    const message = err.message === "VAULT_READ_ERROR" ? "Cryptographic vault index unreachable." : "Internal vault error.";
    res.status(500).json({ error: message });
  }
};
var createLibraryItem = async (req, res) => {
  const { type, name, description, tags, details } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  const id = "lib_" + crypto6.randomUUID();
  try {
    const row = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "INSERT INTO library_items (id, user_id, type, name, description, tags, details) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [id, userId, type, name, description, tags, details]
      );
      return rows[0];
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var deleteLibraryItem = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const result = await client.query(
        "DELETE FROM library_items WHERE id = $1",
        [req.params.id]
      );
      if (result.rowCount === 0) throw new Error("Item not found.");
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "library_item_delete", JSON.stringify({ itemId: req.params.id })]);
    });
    res.json({ success: true });
  } catch (err) {
    res.status(err.message === "Item not found." ? 404 : 500).json({ error: err.message });
  }
};

// backend/src/routes/libraryItems.ts
var router5 = Router5();
router5.get("/", authenticateToken, getLibraryItems);
router5.post("/", authenticateToken, createLibraryItem);
router5.delete("/:id", authenticateToken, deleteLibraryItem);
var libraryItems_default = router5;

// backend/src/routes/jobs.ts
import { Router as Router6 } from "express";

// backend/src/controllers/jobs.ts
var getJobs = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows: rows2 } = await client.query(
        "SELECT * FROM jobs WHERE user_id = current_setting('app.current_user_id', true) ORDER BY created_at DESC"
      );
      return rows2;
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};
var getJobById = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows: rows2 } = await client.query("SELECT * FROM jobs WHERE id = $1", [req.params.id]);
      return rows2;
    });
    if (rows.length === 0) {
      return res.status(404).json({ error: "Background task not found." });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch job details" });
  }
};
var streamJobs = (req, res) => {
  const userId = req.user.id;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const clientId = jobRegistry.addClient(userId, res);
  req.on("close", () => {
    jobRegistry.removeClient(clientId);
  });
  res.write(`data: ${JSON.stringify({ event: "handshake", status: "online" })}

`);
};

// backend/src/routes/jobs.ts
var router6 = Router6();
router6.get("/", authenticateToken, getJobs);
router6.get("/stream", authenticateToken, streamJobs);
router6.get("/sse", authenticateToken, streamJobs);
router6.get("/:id", authenticateToken, getJobById);
var jobs_default = router6;

// backend/src/routes/analyze.ts
import { Router as Router7 } from "express";
var router7 = Router7();
var orchestrator = new AgentOrchestrator();
router7.post("/interact", authenticateToken, async (req, res) => {
  try {
    const { folderIds, prompt, documentMode, answerStyle, history } = req.body;
    const job = await addJobToQueue(req.user.id, "document_analysis", {
      folderIds: Array.isArray(folderIds) ? folderIds : [],
      prompt,
      documentMode,
      answerStyle,
      history: Array.isArray(history) ? history : []
    });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router7.post("/remediate", authenticateToken, async (req, res) => {
  try {
    const { documentId, content } = req.body;
    const result = await orchestrator.remediate(documentId, content, req.user.id, req.user.role);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var analyze_default = router7;

// backend/src/routes/drafting.ts
import { Router as Router8 } from "express";
var router8 = Router8();
var orchestrator2 = new AgentOrchestrator();
router8.post("/generate", authenticateToken, async (req, res) => {
  try {
    const { mode, detailLevel, instructions, formFields, templateId, sourceText, playbookText } = req.body;
    const result = await orchestrator2.runDrafting({
      mode,
      detailLevel,
      instructions,
      formFields,
      templateId,
      sourceText,
      playbookText
    });
    res.json({ content: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router8.post("/generate-stream", authenticateToken, async (req, res) => {
  try {
    const job = await addJobToQueue(req.user.id, "template_drafting", req.body);
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router8.post("/refine", authenticateToken, async (req, res) => {
  try {
    const { text, type, param } = req.body;
    const job = await addJobToQueue(req.user.id, "template_drafting", {
      type: "refine",
      text,
      refineType: type,
      param
    });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router8.post("/process-uploaded-template", authenticateToken, async (req, res) => {
  const templateText = typeof req.body.templateText === "string" ? req.body.templateText : "";
  if (!templateText.trim()) {
    return res.status(400).json({ error: "Template text is required" });
  }
  const placeholders = Array.from(templateText.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g));
  const fields = placeholders.map((match, index) => ({
    id: match[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || `field_${index + 1}`,
    name: match[1].trim(),
    defaultValue: "",
    description: "Template field"
  }));
  res.json({ data: { redactedText: templateText, fields } });
});
var drafting_default = router8;

// backend/src/routes/lawyer.ts
import { Router as Router9 } from "express";
var router9 = Router9();
router9.post("/ask", authenticateToken, async (req, res) => {
  try {
    const { prompt, jurisdiction, outputFormat, webContext, documents, documentIds } = req.body;
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "prompt is required." });
    }
    console.log(`[lawyer/ask] Queuing legal_ask job for user ${req.user.id}, prompt: "${prompt.substring(0, 80)}..."`);
    const job = await addJobToQueue(req.user.id, "document_analysis", {
      type: "legal_ask",
      prompt,
      jurisdiction,
      outputFormat,
      webContext,
      documents: documentIds || documents || []
    });
    return res.status(202).json({ success: true, job_id: job.id });
  } catch (err) {
    console.error("[lawyer/ask] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
var lawyer_default = router9;

// backend/src/routes/negotiate.ts
import { Router as Router10 } from "express";
var router10 = Router10();
var orchestrator3 = new AgentOrchestrator();
router10.post("/run", authenticateToken, async (req, res) => {
  try {
    const { documentContent, playbooks, instructions } = req.body;
    const result = await orchestrator3.runNegotiation(documentContent, playbooks, instructions);
    res.json({ redlines: result });
  } catch (err) {
    console.error("[negotiate/run] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
router10.post("/evaluate", authenticateToken, async (req, res) => {
  const { content, documentTitle = "Contract", documentType = "Agreement" } = req.body;
  if (!content || typeof content !== "string" || content.trim().length < 20) {
    return res.status(400).json({ error: "Document content is required for evaluation." });
  }
  const systemPrompt = `You are a Multi-Agent Contract Risk Evaluator.
Analyze the provided contract and identify clauses that carry legal risk.
Return ONLY a valid JSON object \u2014 no markdown fences, no commentary.

Use this exact schema:
{
  "markups": [
    {
      "clauseId": "clause_1",
      "original": "exact verbatim text from the document (min 15 chars)",
      "replacement": "safer alternative clause text",
      "reasoning": "explanation of why this clause is risky",
      "riskLevel": "RED | YELLOW | GREEN"
    }
  ]
}

Rules:
- Extract between 2 and 6 high-value risk clauses
- "original" MUST be verbatim text that appears in the document
- "original" must be at least 15 characters
- Focus on: indemnity, IP ownership, termination rights, liability caps, data protection
- If no significant risks exist, return { "markups": [] }`;
  const userPrompt = `Document Title: ${documentTitle}
Document Type: ${documentType}

[CONTRACT CONTENT]
${content.substring(0, 12e3)}`;
  try {
    console.log(`[negotiate/evaluate] Running AI evaluation for "${documentTitle}" via OpenRouter`);
    let responseText = await openRouterComplete(systemPrompt, userPrompt, { jsonMode: true });
    responseText = responseText.trim();
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    }
    const parsed = JSON.parse(responseText);
    const markups = Array.isArray(parsed.markups) ? parsed.markups : [];
    console.log(`[negotiate/evaluate] Returned ${markups.length} markup(s)`);
    return res.json({ data: { markups } });
  } catch (err) {
    console.error("[negotiate/evaluate] AI error:", err.message);
    return res.json({ data: { markups: [] }, warning: err.message });
  }
});
router10.post("/compromise", authenticateToken, async (req, res) => {
  const { originalText, riskExplanation, userPrompt: customPrompt, playbookPreferred } = req.body;
  if (!originalText || typeof originalText !== "string") {
    return res.status(400).json({ error: "originalText is required." });
  }
  const systemPrompt = `You are Lumi, an expert AI negotiation counsel.
Your task is to draft an improved replacement for a risky contract clause.
${playbookPreferred ? "Favour the client's position strongly \u2014 prioritise their protections." : "Draft a balanced, commercially fair compromise that both parties can accept."}

Return ONLY the replacement clause text \u2014 no preamble, no explanation, no quotes.`;
  const userPrompt = `Original risky clause:
"${originalText}"

Risk analysis: ${riskExplanation || "General clause risk detected."}
${customPrompt ? `
Additional instruction: ${customPrompt}` : ""}

Draft the improved replacement clause:`;
  try {
    console.log(`[negotiate/compromise] Drafting ${playbookPreferred ? "playbook-preferred" : "balanced"} compromise via OpenRouter`);
    const result = await openRouterComplete(systemPrompt, userPrompt, { temperature: 0.4 });
    return res.json({ result: result.trim() });
  } catch (err) {
    console.error("[negotiate/compromise] AI error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
var negotiate_default = router10;

// backend/src/routes/vulnerabilities.ts
import { Router as Router11 } from "express";
var router11 = Router11();
router11.post("/scan-cookie", authenticateToken, async (req, res) => {
  try {
    const { url, scanDepth } = req.body;
    const job = await addJobToQueue(req.user.id, "privacy_scanning", { url, scanDepth });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (error) {
    console.error("Cookie scan queueing failed:", error);
    res.status(500).json({ success: false, error: "Failed to queue cookie scan" });
  }
});
router11.post("/scan-vulnerability", authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    const job = await addJobToQueue(req.user.id, "vulnerability_scanning", { url });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (error) {
    console.error("Vulnerability scan queueing failed:", error);
    res.status(500).json({ success: false, error: "Failed to queue vulnerability scan" });
  }
});
var vulnerabilities_default = router11;

// backend/src/routes/reports.ts
import { Router as Router12 } from "express";

// backend/src/controllers/reports.ts
import nodemailer from "nodemailer";
var shareReportEmail = async (req, res) => {
  const { recipientEmail, subject, reportTitle, contentType, content, format } = req.body;
  if (!recipientEmail || !content) {
    return res.status(400).json({ error: "Recipient email and report content are required." });
  }
  try {
    await withTransaction(req.user.id, req.user.role, async (client) => {
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [req.user.id, "report_share", JSON.stringify({ recipientEmail, reportTitle, format })]);
    });
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.example.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    if (!process.env.SMTP_USER) {
      console.log(`[STUB]: Sending report "${reportTitle}" to ${recipientEmail} in ${format} format.`);
      return res.json({ success: true, message: `[DEMO MODE] Report successfully dispatched to ${recipientEmail}.` });
    }
    await transporter.sendMail({
      from: '"Lexify Audits" <noreply@Lexify.cloud>',
      to: recipientEmail,
      subject: subject || `Lexify Report: ${reportTitle}`,
      text: content
    });
    res.json({ success: true, message: `Report successfully dispatched to ${recipientEmail}.` });
  } catch (err) {
    console.error("Failed to share report via email:", err);
    res.status(500).json({ error: "Internal server error during report dispatch." });
  }
};

// backend/src/routes/reports.ts
var router12 = Router12();
router12.post("/share-email", authenticateToken, shareReportEmail);
var reports_default = router12;

// backend/src/routes/settings.ts
import { Router as Router13 } from "express";
init_database();
var router13 = Router13();
router13.get("/:key", authenticateToken, async (req, res) => {
  const { key } = req.params;
  const client = req.dbClient || pool;
  try {
    const { rows } = await client.query("SELECT value FROM system_settings WHERE key = $1", [key]);
    if (rows.length === 0) return res.status(404).json({ error: "Setting not found" });
    res.json(rows[0].value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var settings_default = router13;

// backend/src/routes/index.ts
var router14 = Router14();
router14.get("/health", async (req, res) => {
  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    const latency = Date.now() - start;
    res.json({
      status: "UP",
      database: "CONNECTED",
      latency: `${latency}ms`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: "DOWN",
      database: "DISCONNECTED",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
router14.use("/auth", auth_default);
router14.use("/admin", admin_default);
router14.use("/documents", documents_default);
router14.use("/folders", folders_default);
router14.use("/library-items", libraryItems_default);
router14.use("/jobs", jobs_default);
router14.use("/analyze", analyze_default);
router14.use("/drafting", drafting_default);
router14.use("/lawyer", lawyer_default);
router14.use("/negotiate", negotiate_default);
router14.use("/vulnerabilities", vulnerabilities_default);
router14.use("/reports", reports_default);
router14.use("/settings", settings_default);
var routes_default = router14;

// backend/src/middleware/cors.ts
init_config();
import cors from "cors";
var corsOrigins = new Set(
  [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://privlex-ai.onrender.com",
    // Added explicit production URL
    config.corsOrigin,
    config.vercelUrl
  ].flatMap((origin) => origin ? origin.split(",") : []).map((origin) => origin.trim()).filter(Boolean)
);
var corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (corsOrigins.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || /^https?:\/\/[a-z0-9-]+\.app\.github\.dev(:\d+)?$/i.test(origin) || /^https?:\/\/[a-z0-9-]+\.github\.dev(:\d+)?$/i.test(origin) || /^https?:\/\/[a-z0-9-]+\.vercel\.app(:\d+)?$/i.test(origin) || // Explicitly allow all Render domains
    /^https?:\/\/[a-z0-9-]+\.onrender\.com(:\d+)?$/i.test(origin) || // Firebase/Cloud Workstations
    /^https?:\/\/([a-z0-9-]+\.)?firebase\.google\.com(:\d+)?$/i.test(origin) || /^https?:\/\/[a-z0-9-]+\.cluster-[a-z0-9]+\.cloudworkstations\.dev(:\d+)?$/i.test(origin) || /cloudworkstations\.dev$/i.test(origin) || process.env.NODE_ENV !== "production") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
});

// backend/src/middleware/error.ts
import * as Sentry2 from "@sentry/node";

// backend/src/utils/logger.ts
import pino from "pino";
var isProduction2 = process.env.NODE_ENV === "production";
var logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isProduction2 ? void 0 : {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "SYS:standard"
    }
  },
  base: {
    env: process.env.NODE_ENV
  }
});

// backend/src/middleware/error.ts
var errorHandler = (err, req, res, next) => {
  const alreadyEnded = res.writableEnded || res.headersSent;
  if (alreadyEnded) {
    return;
  }
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  const code = err.code || "INTERNAL_ERROR";
  logger.error({
    err: {
      message: err.message,
      stack: err.stack,
      code: err.code
    },
    status,
    url: req.url,
    method: req.method,
    user: req.user?.id
  }, "API Error occurred");
  if (status >= 500) {
    Sentry2.captureException(err, {
      extra: {
        url: req.url,
        method: req.method,
        user: req.user?.id
      }
    });
  }
  res.status(status).json({
    success: false,
    error: message,
    code,
    details: process.env.NODE_ENV === "development" ? err.details : void 0
  });
};

// backend/src/middleware/queryLogger.ts
init_database();
var isPatched = false;
var initQueryLogger = () => {
  if (isPatched) return;
  const originalQuery = pool.query.bind(pool);
  pool.query = (...args) => {
    const start = Date.now();
    const query = typeof args[0] === "string" ? args[0] : args[0].text;
    const params = args[1] || [];
    return originalQuery(...args).then((result) => {
      const duration = Date.now() - start;
      if (process.env.NODE_ENV !== "production" || duration > 100) {
        console.log(`[QueryLogger] ${duration}ms | ${query.substring(0, 200)}${query.length > 200 ? "..." : ""}`);
      }
      return result;
    }).catch((err) => {
      const duration = Date.now() - start;
      console.error(`[QueryLogger] FAILED ${duration}ms | ${query} | Error: ${err.message}`);
      throw err;
    });
  };
  isPatched = true;
};

// server.ts
var app = express();
var httpServer = http.createServer(app);
initSentry(app);
app.use(corsMiddleware);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
initQueryLogger();
app.use("/api", routes_default);
if (config.nodeEnv === "production") {
  const distPath = path2.resolve(process.cwd(), "dist", "client");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path2.join(distPath, "index.html"));
  });
}
initSentryErrorHandler(app);
app.use(errorHandler);
async function startServer() {
  validateEnv();
  if (config.nodeEnv !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  const port = config.port;
  httpServer.listen(port, "0.0.0.0", () => {
    logger.info(`Server running on http://localhost:${port} [${config.nodeEnv}]`);
  });
}
if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
  startServer();
}
var server_default = app;
export {
  server_default as default
};
