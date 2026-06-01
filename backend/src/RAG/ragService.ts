import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { pool } from "../config/database.js";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!config.geminiApiKey || config.geminiApiKey === "dummy") {
    return null;
  }

  try {
    const result = await genAI.models.embedContent({
      model: "text-embedding-004",
      contents: [text]
    });
    return result.embeddings?.[0].values || null;
  } catch (err) {
    console.error("Embedding generation failed:", err);
    return null;
  }
}

export async function chunkAndIndexDocument(fileId: string, content: string, userId: string) {
  try {
    await pool.query("DELETE FROM legal_document_chunks WHERE file_id = $1 AND user_id = $2;", [fileId, userId]);
    // Simplified chunking for verification
    const chunks = [content];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = await getEmbedding(chunk);

      await pool.query(`
        INSERT INTO legal_document_chunks (file_id, user_id, chunk_index, content, embedding, metadata)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [
        fileId,
        userId,
        i,
        chunk,
        vector ? `[${vector.join(",")}]` : null,
        JSON.stringify({})
      ]);
    }
  } catch (err) {
    console.error(`Failed to index Document ${fileId}:`, err);
  }
}

export async function semanticSearch(userId: string, query: string, limit = 5): Promise<string[]> {
  const vector = await getEmbedding(query);
  if (!vector) {
    const { rows } = await pool.query(`
      SELECT content FROM legal_document_chunks
      WHERE user_id = $1
      LIMIT $2;
    `, [userId, limit]);
    return rows.map((r) => r.content);
  }

  try {
    const vectorString = `[${vector.join(",")}]`;
    const { rows } = await pool.query(`
      SELECT content, (embedding <=> $1::vector) AS distance
      FROM legal_document_chunks
      WHERE user_id = $2 AND embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT $3;
    `, [vectorString, userId, limit]);

    return rows.map((r) => r.content);
  } catch (err) {
    console.error("Semantic search failed:", err);
    return [];
  }
}
