import { pool } from "../config/database.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/index.js";
import { withRetry } from "../utils/retry.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey || "dummy");

/**
 * Enterprise Legal Semantic Chunking Strategy
 * Splitting by sections, paragraphs, and clauses (1.1, Article I, (a)).
 * Ensures legal document hierarchy is preserved for better RAG retrieval.
 */
function splitIntoClauseAwareChunks(content: string): string[] {
  // Regex to detect common legal numbering patterns
  // 1. Sections: Section 1, Article I
  // 2. Numbered: 1., 1.1, 1.1.1
  // 3. Alphabetical: (a), (b), (i), (ii)
  const legalMarkerRegex = /\n(?=(?:Section\s+\d+|Article\s+[IVXLCDM]+|(?:\d+\.)+\d*|\([a-z]\)|\([ivx]+\))\s+)/gi;

  // First split by double newlines for paragraphs
  const paragraphs = content.split(/\n\n+/);
  const chunks: string[] = [];

  for (const para of paragraphs) {
    if (para.trim().length < 50) {
      if (chunks.length > 0 && chunks[chunks.length - 1].length < 1500) {
        chunks[chunks.length - 1] += "\n\n" + para;
      } else {
        chunks.push(para);
      }
      continue;
    }

    // Within large paragraphs, split by legal markers
    const subChunks = para.split(legalMarkerRegex);
    for (const sub of subChunks) {
      const trimmed = sub.trim();
      if (trimmed.length > 10) {
        chunks.push(trimmed);
      }
    }
  }

  return chunks;
}

// Helper to clean text
function sanitizeText(text: string) {
  return text.replace(/\0/g, '');
}

/**
 * Embedding Model: text-embedding-004
 * Choice: Google's latest embedding model, optimized for long context and
 * high-dimensional semantic mapping (768 dimensions), well-suited for
 * complex legal terminology and cross-clause relationships.
 */
export async function embedText(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await withRetry(() => model.embedContent({
    content: { role: "user", parts: [{ text: sanitizeText(text) }] }
  })) as any;
  const vector = result.embedding?.values || result.embeddings?.[0]?.values;
  if (!vector) throw new Error("Failed to generate embedding.");
  return vector;
}

export async function chunkAndIndexDocument(fileId: string, content: string, userId: string) {
  const cleanedContent = sanitizeText(content);
  const chunks = splitIntoClauseAwareChunks(cleanedContent);
  const processedChunks: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const vector = await embedText(chunks[i]);
    processedChunks.push({
      index: i,
      content: chunks[i],
      embedding: `[${vector.join(",")}]`
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const chunk of processedChunks) {
      await client.query(
        "INSERT INTO legal_document_chunks (file_id, user_id, chunk_index, content, embedding) VALUES ($1, $2, $3, $4, $5)",
        [fileId, userId, chunk.index, chunk.content, chunk.embedding]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * AI-Powered Re-ranking
 * Uses the LLM as a Cross-Encoder to re-rank the top 20 vector search results.
 * This ensures the absolute best 3-5 chunks are used for context,
 * improving accuracy and reducing noise.
 */
async function rerankChunks(query: string, chunks: any[]): Promise<any[]> {
  if (chunks.length <= 5) return chunks;

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const chunksText = chunks.map((c, i) => `ID [${i}]: ${c.content}`).join("\n\n");

  const prompt = `You are an expert legal document classifier.
Query: ${query}

Below are several snippets from legal documents. Rank them by relevance to the query.
Return ONLY a comma-separated list of the top 5 ID numbers, from most relevant to least relevant.

[CHUNKS]
${chunksText}`;

  try {
    const result = await withRetry(() => model.generateContent(prompt)) as any;
    const rankingText = result.response.text().trim();
    const topIds = rankingText.split(",").map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n));

    const reranked = topIds.slice(0, 5).map((id: number) => chunks[id]).filter(Boolean);
    return reranked.length > 0 ? reranked : chunks.slice(0, 5);
  } catch (err) {
    console.error("Re-ranking failed, falling back to vector score:", err);
    return chunks.slice(0, 5);
  }
}

export async function searchHybrid(query: string, userId: string, fileIds?: string[], folderIds?: string[]) {
  const embedding = await embedText(query);
  const vectorStr = `[${embedding.join(",")}]`;

  let filterSql = "";
  const params: any[] = [userId, vectorStr];
  let pIdx = 3;

  if (fileIds && fileIds.length > 0) {
    filterSql += ` AND file_id = ANY($${pIdx++})`;
    params.push(fileIds);
  }
  if (folderIds && folderIds.length > 0) {
    filterSql += ` AND file_id IN (SELECT id FROM files WHERE folder_id = ANY($${pIdx++}))`;
    params.push(folderIds);
  }

  const { rows } = await pool.query(`
    SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title
    FROM legal_document_chunks
    WHERE user_id = $1
    ${filterSql}
    ORDER BY embedding <=> $2
    LIMIT 20
  `, params);

  if (rows.length === 0) return [];

  // Perform re-ranking on the top 20
  return await rerankChunks(query, rows);
}
