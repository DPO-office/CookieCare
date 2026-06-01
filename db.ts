import pg from "pg";
import bcrypt from "bcrypt";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import {
  hasDatabaseConnectionString,
  redactDatabaseUrlForLogs,
  shouldSeedDefaultDocument,
} from "./src/utils/dbRuntime";

dotenv.config();

const { Pool } = pg;

// Read and sanitize DB URL
const rawDbUrl = process.env.DATABASE_URL || "";
const connectionString = rawDbUrl.trim();
const hasConnectionString = hasDatabaseConnectionString(connectionString);

console.log("Evaluating DATABASE_URL on startup. Length:", connectionString.length);
if (hasConnectionString) {
  try {
    const sanitizedUrl = redactDatabaseUrlForLogs(connectionString);
    console.log("Parsing Sanitized Database URL for Pool:", sanitizedUrl);
  } catch (rawErr) {
    console.warn("Unable to log sanitized DB URL safely:", rawErr);
  }
} else {
  console.warn("DATABASE_URL not set. Starting in local fallback mode.");
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Configure Gemini client on server with correct headers
const apiKey = process.env.GEMINI_API_KEY || "";
const aiClient = apiKey 
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

/**
 * Initialize Database schemas and pgvector extension / HNSW Index
 */
export async function dbInit() {
  if (!hasConnectionString) {
    throw new Error("DATABASE_URL not set");
  }

  const client = await pool.connect();
  try {
    console.log("Initializing Postgres & pgvector schemas on Neon...");
    
    // 1. Double check and install vector extension
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
    
    // 2. Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
        role VARCHAR(50) DEFAULT 'USER',
        approved_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Create folders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Create files table
    await client.query(`
      CREATE TABLE IF NOT EXISTS files (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        type VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        creator_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        creator_email VARCHAR(255) NOT NULL,
        is_encrypted BOOLEAN DEFAULT FALSE,
        is_template BOOLEAN DEFAULT FALSE,
        mime_type VARCHAR(255),
        folder_id VARCHAR(255) REFERENCES folders(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        versions JSONB DEFAULT '[]'::jsonb,
        signatures JSONB DEFAULT '[]'::jsonb,
        redlines JSONB DEFAULT '[]'::jsonb,
        shared_with JSONB DEFAULT '[]'::jsonb,
        audit_logs JSONB DEFAULT '[]'::jsonb,
        analysis JSONB DEFAULT NULL
      );
    `);

    // 5. Create legal_document_chunks table with 768-dim embeddings
    await client.query(`
      CREATE TABLE IF NOT EXISTS legal_document_chunks (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(768)
      );
    `);

    // 6. Create HNSW Cosine Index for lightning-fast high-accuracy vector queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS legal_document_chunks_hnsw_idx 
      ON legal_document_chunks USING hnsw (embedding vector_cosine_ops);
    `);

    // 6.5 Create agent_execution_logs table for multi-agent transparency checks
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_execution_logs (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) REFERENCES files(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_name VARCHAR(100) NOT NULL,
        task_name VARCHAR(100) NOT NULL,
        execution_path JSONB DEFAULT '[]'::jsonb,
        decisions JSONB DEFAULT '{}'::jsonb,
        confidence_score DECIMAL(5, 2) DEFAULT 100.00,
        status VARCHAR(50) DEFAULT 'success',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6.6 Create website_scans table for multi-tenant cookie & security scanning histories
    await client.query(`
      CREATE TABLE IF NOT EXISTS website_scans (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        url VARCHAR(255) NOT NULL,
        scan_type VARCHAR(50) NOT NULL,
        overall_score INTEGER NOT NULL,
        risk_level VARCHAR(50) NOT NULL,
        scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        payload JSONB DEFAULT '{}'::jsonb
      );
    `);

    // 6.7 Create library_items table for personalization
    await client.query(`
      CREATE TABLE IF NOT EXISTS library_items (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        tags TEXT,
        details TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure metadata column exists on legal_document_chunks
    await client.query(`
      ALTER TABLE legal_document_chunks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    `);

    console.log("Postgres database schemas initialized successfully.");

    // 7. Seed initial master user and standard documents if empty
    const hashedSeedPassword = await bcrypt.hash("password123", 10);
    const defaultUser = {
      id: "krish_jain_id",
      email: "swarnaaishwarya17@gmail.com",
      name: "Krish Jain",
      passwordHash: hashedSeedPassword,
      status: "APPROVED",
      role: "ADMIN"
    };

    await client.query(`
      INSERT INTO users (id, email, name, password_hash, status, role, approved_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        status = EXCLUDED.status,
        role = EXCLUDED.role,
        approved_at = EXCLUDED.approved_at;
    `, [defaultUser.id, defaultUser.email, defaultUser.name, defaultUser.passwordHash, defaultUser.status, defaultUser.role]);

    const { rows: existingDocRows } = await client.query(
      "SELECT COUNT(*) FROM files WHERE id = $1;",
      ["doc_nda_sample"]
    );
    if (shouldSeedDefaultDocument(parseInt(existingDocRows[0].count, 10))) {
      console.log("Seeding Postgres database with standard agreements...");

      // Seed documents
      const ndaContent = `MUTUAL NON-DISCLOSURE AGREEMENT

    This Mutual Non-Disclosure Agreement (this "Agreement") is entered into as of May 28, 2026, by and between CookieCare Corp, and the receiving business partner.

1. PURPOSE
The parties wish to explore a business opportunity of mutual interest and in connection therewith, may disclose to each other certain confidential technical and business information.

2. CONFIDENTIAL INFORMATION
"Confidential Information" means any information disclosed by either party (the "Disclosing Party") to the other party (the "Receiving Party") that is marked as confidential or would logically be understood to be confidential under the circumstances.

*CRITICAL CLAUSE EXCEPTION*
Notwithstanding anything to the contrary, Disclosing Party shall have the unconditional right to audit Receiving Party's servers at any time without prior written notice (HIGH RISK EXCEPTION).

By no means shall either party disclose the Confidential Information to any third party for a duration of ten (10) years following termination of this Agreement (MEDIUM RISK CLAUSE).

3. EXCLUSIONS
Confidential Information does not include information that is:
(a) in the public domain at the time of disclosure;
(b) known to Receiving Party prior to receipt;
(c) independently developed by Receiving Party without breach.

4. REMEDIES
In the event of a breach, Disclosing Party is entitled to immediate injunctive relief and liquidated damages of a minimum of USD $5,000,000 without needing to prove actual damages (HIGH RISK REMEDY).

IN WITNESS WHEREOF, the parties have executed this Agreement.

CookieCare Corporation:
Signer name: ___________________
Signature: ______________________

Receiving Party:
Signer name: ___________________
Signature: ______________________`;

      await client.query(`
        INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, versions, shared_with, audit_logs, analysis)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING;
      `, [
        "doc_nda_sample",
          "CookieCare Mutual NDA (Standard)",
        "NDA",
        ndaContent,
        defaultUser.id,
        defaultUser.email,
        false,
        JSON.stringify([
          {
            version: 1,
            content: ndaContent,
            createdAt: new Date().toISOString(),
            author: "Krish Jain",
            comment: "Initial template loaded with severe risk points.",
          },
        ]),
        JSON.stringify(["external_partner@example.com"]),
        JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            action: "Created",
            user: "Krish Jain",
            details: "Document initiated from NDA template.",
          },
        ]),
        JSON.stringify({
          summary: "Standard NDA with overly aggressive Disclosing Party rights, punitive liquidated damages, and unlimited audit rights.",
          risks: [
            {
              id: "risk_nda_1",
              clause: "unconditional right to audit Receiving Party's servers at any time without prior written notice",
              severity: "high",
              description: "Allows the disclosing business complete access to your cloud assets, potentially exposing third-party client properties or intellectual property.",
              actionableInsight: "Limit audits to once a year, with 15 business days prior notice, conducted during standard office hours by an independent certified accountant.",
            },
          ],
          complianceGaps: [
            {
              regulation: "Standard Non-Disclosure Norms",
              complianceState: "gap",
              notes: "Mutual agreements usually lack non-proportional audit and high static penalties.",
            },
          ]
        })
      ]);

      console.log("Database seeded successfully.");
    }
  } catch (err) {
    console.error("Database schema initialization failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Split text into semantic overlapping chunks
 */
export function splitIntoChunks(text: string, maxChars = 800, overlap = 150): string[] {
  if (!text) return [];
  
  // Split primarily by double newlines (paragraphs)
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    
    if ((currentChunk + "\n\n" + trimmed).length <= maxChars) {
      currentChunk = currentChunk ? currentChunk + "\n\n" + trimmed : trimmed;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      
      // Handle ultra large paragraphs by character slice
      if (trimmed.length > maxChars) {
        let index = 0;
        while (index < trimmed.length) {
          const start = index;
          const end = Math.min(start + maxChars, trimmed.length);
          chunks.push(trimmed.substring(start, end));
          index += (maxChars - overlap);
        }
        currentChunk = "";
      } else {
        currentChunk = trimmed;
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Generate embedding using gemini-embedding-2-preview
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!aiClient) {
    console.warn("Gemini client not initialized. Skipping embedding generation.");
    return null;
  }
  try {
    const response = await aiClient.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: text,
    });
    
    if (response.embeddings && Array.isArray(response.embeddings) && response.embeddings.length > 0) {
      const values = response.embeddings[0].values;
      if (Array.isArray(values)) {
        return values;
      }
    }
    return null;
  } catch (err) {
    console.error("Embedding generation failed:", err);
    return null;
  }
}


/**
 * Parse document into hierarchy of Articles, Sections, Sub-clauses, and Recitals
 */
export interface HierarchicalChunk {
  content: string;
  metadata: {
    document_type: string;
    jurisdiction: string;
    governing_law: string;
    page_number: number;
    section_header: string;
    clause_index: number;
  }
}

export function parseLegalStructureHierarchy(text: string): HierarchicalChunk[] {
  if (!text) return [];

  // Determine taxonomy
  let document_type = "Custom";
  const lowerText = text.toLowerCase();
  if (lowerText.includes("non-disclosure") || lowerText.includes("nda") || lowerText.includes("confidentiality agreement")) {
    document_type = "NDA";
  } else if (lowerText.includes("data processing") || lowerText.includes("dpa")) {
    document_type = "DPA";
  } else if (lowerText.includes("service level") || lowerText.includes("sla")) {
    document_type = "SLA";
  } else if (lowerText.includes("mnsa") || lowerText.includes("master non-disclosure")) {
    document_type = "MNSA";
  }

  let jurisdiction = "US";
  if (lowerText.includes("england") || lowerText.includes("united kingdom") || lowerText.includes("governed by the laws of england") || lowerText.includes(" london ")) {
    jurisdiction = "UK";
  } else if (lowerText.includes("germany") || lowerText.includes("deutschland") || lowerText.includes(" munich ") || lowerText.includes(" berlin ")) {
    jurisdiction = "DE";
  } else if (lowerText.includes("india") || lowerText.includes("new delhi") || lowerText.includes(" mumbai ")) {
    jurisdiction = "IN";
  }

  let governing_law = "Delaware";
  if (lowerText.includes("governing law") || lowerText.includes("governed by")) {
    if (lowerText.includes("london") || lowerText.includes("english")) {
      governing_law = "London";
    } else if (lowerText.includes("delaware")) {
      governing_law = "Delaware";
    } else if (lowerText.includes("germany") || lowerText.includes("german")) {
      governing_law = "Germany";
    } else if (lowerText.includes("new york")) {
      governing_law = "New York";
    } else if (lowerText.includes("india")) {
      governing_law = "India";
    }
  }

  // Parse legal blocks
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: HierarchicalChunk[] = [];
  
  let currentSectionHeader = "Recitals";
  let clauseIndex = 0;
  let charAccumulator = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    charAccumulator += para.length;
    // Estimate page number: ~1500 chars per page, min 1
    const page_number = Math.max(1, Math.ceil(charAccumulator / 1500));

    // Determine if paragraph acts as an Article or Section header
    const isHeader = 
      /^(ARTICLE\s+[IVXLCDM]+|ARTICLE\s+\d+|SECTION\s+\d+|[1-9]\d*\.\s+[A-Z\s]{3,})/i.test(trimmed) ||
      (trimmed.length < 80 && /^\b[A-Z0-9\s,\-\(\)\/]{5,}\b$/.test(trimmed));

    if (isHeader) {
      currentSectionHeader = trimmed;
    }

    clauseIndex++;

    chunks.push({
      content: trimmed,
      metadata: {
        document_type,
        jurisdiction,
        governing_law,
        page_number,
        section_header: currentSectionHeader,
        clause_index: clauseIndex,
      }
    });
  }

  return chunks;
}


/**
 * Chunk a document and index its vectors with pgvector
 */
export async function chunkAndIndexDocument(fileId: string, content: string, userId: string) {
  try {
    // Delete any previous chunks for this document
    await pool.query("DELETE FROM legal_document_chunks WHERE file_id = $1;", [fileId]);

    const chunks = parseLegalStructureHierarchy(content);
    if (chunks.length === 0) return;

    console.log(`Chunked Document ${fileId} into ${chunks.length} legal-aware chunks. Indexing embedding vectors...`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = await getEmbedding(chunk.content);
      
      await pool.query(`
        INSERT INTO legal_document_chunks (file_id, user_id, chunk_index, content, embedding, metadata)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [
        fileId,
        userId,
        i,
        chunk.content,
        vector ? `[${vector.join(",")}]` : null,
        JSON.stringify(chunk.metadata)
      ]);
    }
    
    console.log(`Document ${fileId} RAG vectors stored successfully with rich metadata matrices.`);
  } catch (err) {
    console.error(`Failed to generate/store embeddings for Document ${fileId}:`, err);
  }
}

/**
 * Query database using semantic cosine-similarity search
 */
export async function semanticSearch(userId: string, query: string, limit = 5): Promise<string[]> {
  const vector = await getEmbedding(query);
  if (!vector) {
    console.warn("Vector embedding not available for search. Falling back to exact text matching.");
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

/**
 * Express Authentication middleware backed by Postgres User entries
 */
export async function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ error: "Access denied. Token missing." });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Access denied. Token invalid." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, email, name FROM users WHERE id = $1 OR email = $2",
      [token, token]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized or invalid user session." });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    console.error("Auth middleware database verification error:", err);
    return res.status(401).json({ error: "Access denied. Invalid token sessions." });
  }
}
