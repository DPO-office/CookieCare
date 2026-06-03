import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { pool } from "../config/database.js";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

function sanitizeText(str: string): string {
  if (!str) return str;
  return str.replace(/\0/g, "");
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const result = await genAI.models.embedContent({
      model: "gemini-embedding-2",
      contents: text,
    });

    if (result && (result as any).embedding?.values) {
      return (result as any).embedding.values;
    }

    if (result && (result as any).embeddings?.[0]?.values) {
      return (result as any).embeddings[0].values;
    }

    return null;
  } catch (err) {
    console.error("getEmbedding failed:", err);
    return null;
  }
}

export async function chunkAndIndexDocument(fileId: string, content: string, userId: string) {
  let client;
  try {
    client = await pool.connect();
    await client.query("DELETE FROM legal_document_chunks WHERE file_id = $1 AND user_id = $2;", [fileId, userId]);
    
    const cleanedContent = sanitizeText(content);
    const chunks = [cleanedContent];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk || chunk.trim().length === 0) continue;

      const vector = await getEmbedding(chunk);
      if (!vector || !Array.isArray(vector)) continue;

      const vectorString = `[${vector.join(",")}]`;

      await client.query(`
        INSERT INTO legal_document_chunks (file_id, user_id, chunk_index, content, embedding, metadata)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [fileId, userId, i, sanitizeText(chunk), vectorString, JSON.stringify({})]);
    }
  } catch (err) {
    console.error(`chunkAndIndexDocument failed for file ${fileId}:`, err);
  } finally {
    if (client) client.release();
  }
}

export async function semanticSearch(userId: string, query: string, limit = 5): Promise<string[]> {
  const sanitizedQuery = sanitizeText(query);
  const vector = await getEmbedding(sanitizedQuery);
  
  let client;
  try {
    client = await pool.connect();
    if (!vector) {
      const { rows } = await client.query(`
        SELECT content FROM legal_document_chunks
        WHERE user_id = $1
        LIMIT $2;
      `, [userId, limit]);
      return rows.map((r) => r.content);
    }

    const vectorString = `[${vector.join(",")}]`;
    const { rows } = await client.query(`
      SELECT content, (embedding <=> $1::vector) AS distance
      FROM legal_document_chunks
      WHERE user_id = $2 AND embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT $3;
    `, [vectorString, userId, limit]);

    return rows.map((r) => r.content);
  } catch (err) {
    console.error("semanticSearch failed:", err);
    return [];
  } finally {
    if (client) client.release();
  }
}
