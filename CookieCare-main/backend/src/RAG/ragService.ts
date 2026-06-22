import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";

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
 * Embedding is not available via OpenRouter (OpenRouter provides chat completions only).
 * This function returns null so the RAG pipeline gracefully falls back to lexical-only
 * (FTS + ILIKE) search, which is already handled throughout searchHybrid().
 * To restore vector search, configure a dedicated embeddings provider (e.g. OpenAI,
 * Cohere, or a self-hosted model) and replace this implementation.
 */
export async function embedText(_text: string): Promise<number[] | null> {
  return null;
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

  return await withTransaction(userId, 'USER', async (client) => {
    // 1. Semantic (Vector Distance) Query — skipped if embedding unavailable
    let semanticRows: any[] = [];
    if (hasEmbedding) {
      let semanticFilterSql = "";
      const semanticParams: any[] = [userId, vectorStr];
      let sIdx = 3;

      if (fileIds && fileIds.length > 0) {
        semanticFilterSql += ` AND file_id = ANY($${sIdx++})`;
        semanticParams.push(fileIds);
      }
      if (folderIds && folderIds.length > 0) {
        semanticFilterSql += ` AND file_id IN (SELECT id FROM files WHERE folder_id = ANY($${sIdx++}))`;
        semanticParams.push(folderIds);
      }

      const semanticQuerySql = `
        SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title
        FROM legal_document_chunks
        WHERE user_id = $1
        ${semanticFilterSql}
        ORDER BY embedding <=> $2::vector
        LIMIT 20
      `;

      try {
        const result = await client.query(semanticQuerySql, semanticParams);
        semanticRows = result.rows;
      } catch (err) {
        console.warn("[RAG] Semantic search failed, falling back to lexical only:", (err as Error).message);
      }
    }

    // 2. Lexical (FTS Keyword) Query
    let lexicalFilterSql = "";
    const lexicalParams: any[] = [userId, query, `%${query}%`];
    let lIdx = 4;

    if (fileIds && fileIds.length > 0) {
      lexicalFilterSql += ` AND file_id = ANY($${lIdx++})`;
      lexicalParams.push(fileIds);
    }
    if (folderIds && folderIds.length > 0) {
      lexicalFilterSql += ` AND file_id IN (SELECT id FROM files WHERE folder_id = ANY($${lIdx++}))`;
      lexicalParams.push(folderIds);
    }

    const lexicalQuerySql = `
      SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title,
             ts_rank(to_tsvector('english', content), plainto_tsquery('english', $2)) as fts_rank
      FROM legal_document_chunks
      WHERE user_id = $1
        AND (to_tsvector('english', content) @@ plainto_tsquery('english', $2) OR content ILIKE $3)
        ${lexicalFilterSql}
      ORDER BY fts_rank DESC, id
      LIMIT 20
    `;

    const { rows: lexicalRows } = await client.query(lexicalQuerySql, lexicalParams);

    // 3. Reciprocal Rank Fusion (RRF)
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
    return fusedResults.slice(0, 5);
  });
}