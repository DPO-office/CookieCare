import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";
import { executeEmbedding } from "../llm/index.js";

// Helper to clean text
function sanitizeText(text: string) {
  return text.replace(/\0/g, '');
}

// Sliding window paragraph-aware chunking preserving clause integrity
function splitIntoClauseAwareChunks(content: string): string[] {
  const paragraphs = content.split(/\n\n+/);
  const chunks: string[] = [];
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

  return chunks.filter(c => c.trim().length > 15);
}

/**
 * Semantic Retrieval plan (R0) — routed through the Gemini embedding lane
 * (`executeEmbedding`, its own scheduler, separate from chat/JSON generation).
 * Returns null on failure so the RAG pipeline gracefully falls back to
 * lexical-only (FTS + ILIKE) search, already handled throughout searchHybrid().
 */
export async function embedText(text: string): Promise<number[] | null> {
  const [vector] = await executeEmbedding([text]);
  return vector ?? null;
}

export async function chunkAndIndexDocument(fileId: string, content: string, userId: string) {
  // 1. Prepare data
  const cleanedContent = sanitizeText(content);
  const chunks = splitIntoClauseAwareChunks(cleanedContent);
  const processedChunks: any[] = [];

  // 2. Generate embeddings BEFORE DB connection (avoids pool exhaustion)
  for (let i = 0; i < chunks.length; i++) {
    const vector = await embedText(chunks[i]);
    processedChunks.push({
      index: i,
      content: chunks[i],
      // null embedding stored as NULL — chunk is still searchable via lexical search
      embedding: vector ? `[${vector.join(",")}]` : null
    });
  }

  // 3. Perform atomic DB insert under RLS context
  await withTransaction(userId, 'USER', async (client) => {
    for (const chunk of processedChunks) {
      await client.query(
        "INSERT INTO legal_document_chunks (file_id, user_id, chunk_index, content, embedding) VALUES ($1, $2, $3, $4, $5)",
        [fileId, userId, chunk.index, chunk.content, chunk.embedding]
      );
    }
  });
}

export async function searchHybrid(query: string, userId: string, fileIds?: string[], folderIds?: string[]) {
  const embedding = await embedText(query);
  const hasEmbedding = embedding !== null;
  const vectorStr = hasEmbedding ? `[${embedding.join(",")}]` : null;

  // Normalise folderIds: strip the synthetic "root" sentinel the frontend sends for
  // documents with no folder_id, and track whether we need a NULL folder_id match.
  let resolvedFolderIds: string[] | undefined;
  let includeNullFolder = false;

  if (folderIds && folderIds.length > 0) {
    const realFolderIds = folderIds.filter(id => id !== "root");
    includeNullFolder = folderIds.includes("root");
    // Only set resolvedFolderIds if there are real (non-root) folder ids
    resolvedFolderIds = realFolderIds.length > 0 ? realFolderIds : undefined;
  }

  // Build the folder filter fragment used in both semantic and lexical queries.
  // Returns { sql: string, params: any[], nextIdx: number }
  const buildFolderFilter = (startIdx: number, params: any[]) => {
    const parts: string[] = [];
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

  return await withTransaction(userId, 'USER', async (client) => {
    // ── Debug: log what we're searching ────────────────────────────────────
    console.log(`[searchHybrid] userId=${userId} query="${query.substring(0, 80)}" folderIds=${JSON.stringify(folderIds)} resolvedFolderIds=${JSON.stringify(resolvedFolderIds)} includeNullFolder=${includeNullFolder}`);

    // ── 0. Sanity check: count available chunks for this user/folder combo ──
    try {
      let countSql = `SELECT COUNT(*) FROM legal_document_chunks WHERE user_id = $1`;
      const countParams: any[] = [userId];

      if (fileIds && fileIds.length > 0) {
        countSql += ` AND file_id = ANY($2)`;
        countParams.push(fileIds);
      } else if (resolvedFolderIds && resolvedFolderIds.length > 0) {
        // Use parentheses to correctly group the OR with the leading AND
        const folderParts: string[] = [
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
      console.warn("[searchHybrid] Count query failed:", (countErr as Error).message);
    }

    // 1. Semantic (Vector Distance) Query — skipped if embedding unavailable
    let semanticRows: any[] = [];
    if (hasEmbedding) {
      const semanticParams: any[] = [userId, vectorStr];
      let sIdx = 3;

      let fileFilterSql = "";
      if (fileIds && fileIds.length > 0) {
        fileFilterSql += ` AND file_id = ANY($${sIdx++})`;
        semanticParams.push(fileIds);
      }

      const folderFilter = buildFolderFilter(sIdx, semanticParams);
      sIdx = folderFilter.nextIdx;

      const semanticQuerySql = `
        SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title
        FROM legal_document_chunks
        WHERE user_id = $1
        ${fileFilterSql}
        ${folderFilter.sql}
        ORDER BY embedding <=> $2::vector
        LIMIT 20
      `;

      try {
        const result = await client.query(semanticQuerySql, folderFilter.params);
        semanticRows = result.rows;
      } catch (err) {
        console.warn("[RAG] Semantic search failed, falling back to lexical only:", (err as Error).message);
      }
    }

    // 2. Lexical (FTS Keyword) Query
    // Use the query both as a FTS match and a raw ILIKE fallback.
    // Also try a broader keyword scan to improve recall when the query is long/specific.
    const lexicalParams: any[] = [userId, query, `%${query}%`];
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

    let lexicalRows: any[] = [];
    try {
      const { rows } = await client.query(lexicalQuerySql, folderFilter.params);
      lexicalRows = rows;
    } catch (lexErr) {
      console.warn("[RAG] Lexical query failed:", (lexErr as Error).message);
    }

    // 3. Broad fallback: if both queries returned nothing, scan all chunks in scope
    //    with a simple ILIKE on common legal terms to get at least some context.
    if (semanticRows.length === 0 && lexicalRows.length === 0) {
      console.log("[searchHybrid] Primary queries returned 0 results — attempting broad fallback scan");

      const broadTerms = [
        "indemnity", "liability", "termination", "confidential",
        "intellectual property", "payment", "governing law", "compliance",
        "data protection", "obligation"
      ];
      const broadPattern = `%(${broadTerms.join("|")})%`;

      const broadParams: any[] = [userId];
      let bIdx = 2;

      let bFileFilterSql = "";
      if (fileIds && fileIds.length > 0) {
        bFileFilterSql += ` AND file_id = ANY($${bIdx++})`;
        broadParams.push(fileIds);
      }

      const bFolderFilter = buildFolderFilter(bIdx, broadParams);
      bIdx = bFolderFilter.nextIdx;
      // broadPattern is appended AFTER buildFolderFilter so bIdx is the correct placeholder index.
      // Do NOT push broadPattern into broadParams before this point — it's added via concat below.

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
          // Last resort: return any chunks in scope, no content filter
          console.log("[searchHybrid] Broad fallback also empty — returning any available chunks in scope");
          const anyParams: any[] = [userId];
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
        console.warn("[RAG] Broad fallback failed:", (broadErr as Error).message);
      }
    }

    console.log(`[searchHybrid] Final — semantic: ${semanticRows.length}, lexical: ${lexicalRows.length}`);

    // 4. Reciprocal Rank Fusion (RRF)
    const rrfMap = new Map<string, { doc: any; semanticRank: number; lexicalRank: number }>();

    semanticRows.forEach((row: any, index: number) => {
      const key = `${row.file_id}_${row.content.substring(0, 50)}`;
      rrfMap.set(key, { doc: row, semanticRank: index + 1, lexicalRank: Infinity });
    });

    lexicalRows.forEach((row: any, index: number) => {
      const key = `${row.file_id}_${row.content.substring(0, 50)}`;
      if (rrfMap.has(key)) {
        rrfMap.get(key)!.lexicalRank = index + 1;
      } else {
        rrfMap.set(key, { doc: row, semanticRank: Infinity, lexicalRank: index + 1 });
      }
    });

    const fusedResults = Array.from(rrfMap.values()).map(item => {
      const semScore = item.semanticRank === Infinity ? 0 : 1 / (60 + item.semanticRank);
      const lexScore = item.lexicalRank === Infinity ? 0 : 1 / (60 + item.lexicalRank);
      const rrfScore = (semScore * 0.7) + (lexScore * 0.3);
      return {
        ...item.doc,
        rrfScore
      };
    });

    fusedResults.sort((a, b) => b.rrfScore - a.rrfScore);
    const finalResults = fusedResults.slice(0, 5);

    console.log(`[searchHybrid] Returning ${finalResults.length} chunk(s): ${finalResults.map(r => r.title ?? r.file_id).join(", ")}`);
    return finalResults;
  });
}

/**
 * One-time backfill: find all files for a user that have no rows in
 * legal_document_chunks and re-index them.  Call this from an admin route
 * or on server startup if you suspect missing chunks.
 *
 * Only files whose decrypted content is non-empty are processed.
 * Encrypted content is decrypted inline using the crypto utility.
 */
export async function reindexUnchunkedDocuments(userId: string): Promise<{ indexed: number; skipped: number }> {
  // Dynamically import decrypt to avoid circular dependency at module load time.
  const { decrypt } = await import("../utils/crypto.js");

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
      const plaintext: string = file.is_encrypted ? decrypt(file.content) : file.content;
      if (!plaintext || plaintext.trim().length < 30) {
        skipped++;
        continue;
      }
      await chunkAndIndexDocument(file.id, plaintext, userId);
      indexed++;
      console.log(`[reindexUnchunkedDocuments] Indexed file ${file.id} for user ${userId}`);
    } catch (err) {
      console.warn(`[reindexUnchunkedDocuments] Failed for file ${file.id}:`, (err as Error).message);
      skipped++;
    }
  }

  console.log(`[reindexUnchunkedDocuments] Done — indexed: ${indexed}, skipped: ${skipped}`);
  return { indexed, skipped };
}
