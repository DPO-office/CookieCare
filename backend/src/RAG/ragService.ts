import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { pool } from "../config/database.js";
import { withRetry } from "../utils/retry.js";
import crypto from "crypto";

console.log("⚠️ [RAG Service Bypass] Mocking Redis cache with an in-memory Map.");
const memoryCache = new Map<string, string>();

const redis = {
  get: async (key: string) => memoryCache.get(key) || null,
  set: async (key: string, value: string, mode?: string, duration?: number) => {
    memoryCache.set(key, value);
    return "OK";
  }
};

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

function sanitizeText(str: string): string {
  if (!str) return str;
  return str.replace(/\0/g, "");
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  // Simple Mocked Caching to avoid redundant API calls
  const cacheKey = `emb:${crypto.createHash('md5').update(text).digest('hex')}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await withRetry(() =>
      genAI.models.embedContent({
        model: "text-embedding-004",
        contents: [{ parts: [{ text }] }]
      })
    ) as any;

    let vector = null;
    if (result && result.embedding?.values) {
      vector = result.embedding.values;
    } else if (result && result.embeddings?.[0]?.values) {
      vector = result.embeddings[0].values;
    }

    if (vector) {
      await redis.set(cacheKey, JSON.stringify(vector), "EX", 3600 * 24 * 7); // Cache for 1 week
    }

    return vector;
  } catch (err) {
    console.error("getEmbedding failed:", err);
    return null;
  }
}

export async function chunkAndIndexDocument(fileId: string, content: string, userId: string) {
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    // System context for workers
    await client.query("SET LOCAL app.current_user_role = 'ADMIN'");
    
    const cleanedContent = sanitizeText(content);
    const chunks = splitIntoClauseAwareChunks(cleanedContent);
    const newChunks: any[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk || chunk.trim().length === 0) continue;

      const vector = await getEmbedding(chunk);
      if (!vector || !Array.isArray(vector)) continue;

      const vectorString = `[${vector.join(",")}]`;
      newChunks.push({
        index: i,
        content: sanitizeText(chunk),
        embedding: vectorString
      });
    }

    // Atomic Swap Strategy: Only delete and replace if embeddings were successful
    if (newChunks.length > 0) {
      await client.query("BEGIN");
      try {
        await client.query("DELETE FROM legal_document_chunks WHERE file_id = $1 AND user_id = $2;", [fileId, userId]);
        for (const chunk of newChunks) {
          await client.query(`
            INSERT INTO legal_document_chunks (file_id, user_id, chunk_index, content, embedding, metadata)
            VALUES ($1, $2, $3, $4, $5, $6);
          `, [fileId, userId, chunk.index, chunk.content, chunk.embedding, JSON.stringify({})]);
        }
        await client.query("COMMIT");
      } catch (atomicErr) {
        await client.query("ROLLBACK");
        throw atomicErr;
      }
    } else {
      await client.query("COMMIT");
    }
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error(`chunkAndIndexDocument failed for file ${fileId}:`, err);
  } finally {
    if (client) client.release();
  }
}

function splitIntoClauseAwareChunks(text: string, maxChars = 2000): string[] {
  if (!text) return [];

  // Improved regex to identify legal boundaries without losing the headers
  const clauseBoundaries = [
    /\n\s*(?=ARTICLE\s+[\d\.]+)/i,
    /\n\s*(?=SECTION\s+[\d\.]+)/i,
    /\n\s*(?=CLAUSE\s+[\d\.]+)/i,
    /\n\s*(?=\d+\.\s+[A-Z\s]{3,})/i
  ];

  let sections = [text];
  for (const regex of clauseBoundaries) {
    sections = sections.flatMap(s => s.split(regex));
  }

  const chunks: string[] = [];
  let currentChunk = "";

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    if ((currentChunk.length + trimmed.length) <= maxChars) {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    } else {
      if (currentChunk) chunks.push(currentChunk);

      if (trimmed.length > maxChars) {
        // Fallback: split by double newline if a single clause is too big
        const paragraphs = trimmed.split(/\n\s*\n/);
        let tempChunk = "";
        for (const para of paragraphs) {
          if ((tempChunk.length + para.length) <= maxChars) {
            tempChunk += (tempChunk ? "\n\n" : "") + para;
          } else {
            if (tempChunk) chunks.push(tempChunk);
            tempChunk = para;
          }
        }
        currentChunk = tempChunk;
      } else {
        currentChunk = trimmed;
      }
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

/**
 * Hybrid Search: Combines Vector Similarity with Keyword-based search + Metadata Filtering + Semantic Re-ranking.
 */
export async function hybridSearch(userId: string, query: string, limit = 5, folderId?: string): Promise<any[]> {
  const sanitizedQuery = sanitizeText(query);
  const vector = await getEmbedding(sanitizedQuery);

  let client;
  try {
    client = await pool.connect();

    let filterClause = "WHERE user_id = $1";
    const queryParams: any[] = [userId];

    if (folderId) {
      // Find files in this folder first
      const { rows: files } = await client.query("SELECT id FROM files WHERE folder_id = $1", [folderId]);
      const fileIds = files.map(f => f.id);
      if (fileIds.length > 0) {
        filterClause += " AND file_id = ANY($2)";
        queryParams.push(fileIds);
      } else {
        // Optimization: Early-exit if folder is empty to prevent global corpus leakage
        return [];
      }
    }

    if (!vector) {
      const { rows } = await client.query(`
        SELECT c.content, c.file_id, f.title
        FROM legal_document_chunks c
        JOIN files f ON c.file_id = f.id
        ${filterClause.replace(/user_id/g, 'c.user_id').replace(/file_id/g, 'c.file_id')} AND c.content ILIKE $${queryParams.length + 1}
        LIMIT $${queryParams.length + 2};
      `, [...queryParams, `%${sanitizedQuery}%`, limit]);
      return rows.map((r) => ({ content: r.content, file_id: r.file_id, title: r.title }));
    }

    const vectorString = `[${vector.join(",")}]`;
    const vecIdx = queryParams.length + 1;
    const kwIdx = queryParams.length + 2;
    const limitIdx = queryParams.length + 3;

    // Reciprocal Rank Fusion (simplified) or Weighted combination
    const { rows } = await client.query(`
      WITH vector_results AS (
        SELECT c.id, c.content, c.file_id, f.title, 1.0 / (1.0 + (c.embedding <=> $${vecIdx}::vector)) AS score
        FROM legal_document_chunks c
        JOIN files f ON c.file_id = f.id
        ${filterClause.replace(/user_id/g, 'c.user_id').replace(/file_id/g, 'c.file_id')} AND c.embedding IS NOT NULL
        ORDER BY score DESC
        LIMIT 30
      ),
      keyword_results AS (
        SELECT c.id, c.content, c.file_id, f.title, 1.0 AS score
        FROM legal_document_chunks c
        JOIN files f ON c.file_id = f.id
        ${filterClause.replace(/user_id/g, 'c.user_id').replace(/file_id/g, 'c.file_id')} AND c.content ILIKE ANY($${kwIdx})
        LIMIT 30
      )
      SELECT content, file_id, title FROM (
        SELECT id, content, file_id, title, score FROM vector_results
        UNION ALL
        SELECT id, content, file_id, title, score FROM keyword_results
      ) combined
      GROUP BY id, content, file_id, title
      ORDER BY SUM(score) DESC
      LIMIT 15;
    `, [...queryParams, vectorString, sanitizedQuery.split(/\s+/).filter(k => k.length >= 2).map(k => `%${k}%`)]);

    const initialResults = rows.map((r) => ({ content: r.content, file_id: r.file_id, title: r.title }));

    if (initialResults.length === 0) return [];

    // --- Semantic Re-ranking (Cross-Encoder Step) ---
    return await reRankResults(sanitizedQuery, initialResults, limit);
  } catch (err) {
    console.error("hybridSearch failed:", err);
    return [];
  } finally {
    if (client) client.release();
  }
}

async function reRankResults(query: string, documents: any[], limit: number): Promise<any[]> {
  try {
    const reRankPrompt = `You are a Legal Ranker.
Evaluate the relevance of the following document chunks to the user query.
Query: "${query}"

[CHUNKS]
${documents.map((doc, idx) => `ID ${idx}: ${doc.content.substring(0, 1000)}`).join("\n---\n")}

Return ONLY a comma-separated list of IDs in order of most relevant to least relevant.
Example: 2, 0, 1
If none are relevant, return an empty string.`;

    const result = await withRetry(() => genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ parts: [{ text: reRankPrompt }] }]
    })) as any;
    const text = result.text.trim();

    if (!text) return documents.slice(0, limit);

    const orderedIds = (text.match(/\d+/g) || [])
      .map(id => parseInt(id))
      .filter(id => id >= 0 && id < documents.length);

    const orderedDocs = orderedIds.map(id => documents[id]);
    documents.forEach((doc, idx) => {
      if (!orderedIds.includes(idx)) orderedDocs.push(doc);
    });

    return orderedDocs.slice(0, limit);
  } catch (err) {
    console.error("Semantic re-ranking failed, returning original order:", err);
    return documents.slice(0, limit);
  }
}

export async function semanticSearch(userId: string, query: string, limit = 5, folderId?: string): Promise<any[]> {
  return hybridSearch(userId, query, limit, folderId);
}