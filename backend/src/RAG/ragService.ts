import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { pool } from "../config/database.js";

const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

// Helper to remove any null bytes (\x00) that crash PostgreSQL
function sanitizeText(str: string): string {
  if (!str) return str;
  return str.replace(/\0/g, "");
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const result = await genAI.models.embedContent({
      model: "gemini-embedding-2", // Standard 3072 dimensional mapping
      contents: text,
    });

    if (result && (result as any).embedding?.values) {
      return (result as any).embedding.values;
    }

    if (result && (result as any).embeddings?.[0]?.values) {
      return (result as any).embeddings[0].values;
    }

    console.error("Embedding structure not matched:", result);
    return null;
  } catch (err) {
    console.error("Embedding generation failed:", err);
    return null;
  }
}

export async function chunkAndIndexDocument(fileId: string, content: string, userId: string) {
  try {
    // Purane items ko flush out karo safely
    await pool.query("DELETE FROM legal_document_chunks WHERE file_id = $1 AND user_id = $2;", [fileId, userId]);
    
    // Content ko clean aur chunk array set karo
    const cleanedContent = sanitizeText(content);
    const chunks = [cleanedContent];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Agar chunk khali hai toh skip karo
      if (!chunk || chunk.trim().length === 0) continue;

      const vector = await getEmbedding(chunk);

      if (!vector || !Array.isArray(vector)) {
        console.error(`Skipping chunk ${i} due to empty embedding array.`);
        continue;
      }

      // Safe bracket wrapper format pgvector ke liye
      const vectorString = `[${vector.join(",")}]`;

      await pool.query(`
        INSERT INTO legal_document_chunks (file_id, user_id, chunk_index, content, embedding, metadata)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [
        fileId,
        userId,
        i,
        chunk,         // Ab 100% sanitized text insertion direct parameter me ja raha hai
        vectorString,  // Clean dimensional float block
        JSON.stringify({})
      ]);
    }
  } catch (err) {
    console.error(`Failed to index Document ${fileId}:`, err);
  }
}

export async function semanticSearch(userId: string, query: string, limit = 5): Promise<string[]> {
  const sanitizedQuery = sanitizeText(query);
  const vector = await getEmbedding(sanitizedQuery);
  
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