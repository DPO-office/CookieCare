import { pool } from "../backend/src/config/database.js";
import argon2 from "argon2";

async function connectWithRetry(retries = 5, delay = 2000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      return client;
    } catch (err: any) {
      const isLast = i === retries - 1;
      const message = err.message || "";
      const isRetryable =
        message.includes("ECONNRESET") ||
        message.includes("Connection terminated") ||
        message.includes("connection timeout") ||
        message.includes("ETIMEDOUT") ||
        message.includes("socket hang up");

      if (isLast || !isRetryable) {
        throw err;
      }

      console.warn(`Database connection attempt ${i + 1} failed: ${message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  throw new Error("Failed to connect to database after retries");
}

async function setupDb() {
  const client = await connectWithRetry();

  try {
    await client.query("BEGIN");
    console.log("Starting database setup...");

    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");

    // Tables Creation
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

      CREATE TABLE IF NOT EXISTS folders (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

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

      CREATE TABLE IF NOT EXISTS document_versions (
        id VARCHAR(255) PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS legal_document_chunks (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS library_items (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        tags JSONB DEFAULT '[]'::jsonb,
        details JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS website_scans (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        scan_type VARCHAR(50) NOT NULL,
        overall_score INTEGER,
        risk_level VARCHAR(50),
        payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        progress INTEGER DEFAULT 0,
        message TEXT,
        payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agent_execution_logs (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) REFERENCES files(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_name VARCHAR(255) NOT NULL,
        task_name VARCHAR(255) NOT NULL,
        execution_path JSONB DEFAULT '[]'::jsonb,
        decisions JSONB DEFAULT '[]'::jsonb,
        confidence_score FLOAT,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS compliance_audit_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action_type VARCHAR(255) NOT NULL,
        prompt TEXT,
        context_files JSONB DEFAULT '[]'::jsonb,
        ai_response TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Embedding column update (idempotent check)
    const embeddingTypeResult = await client.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'legal_document_chunks' AND column_name = 'embedding'
    `);
    if (embeddingTypeResult.rows.length === 0 || embeddingTypeResult.rows[0].data_type !== 'USER-DEFINED') {
      await client.query("ALTER TABLE legal_document_chunks ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768);");
    }

    // Seed Admin
    const hashedSeedPassword = await argon2.hash("MamuSecure2026!");
    await client.query(`
      INSERT INTO users (id, email, name, password_hash, status, role, approved_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `, ["supreme_admin_id", "swarnaaishwarya17@gmail.com", "Supreme Admin", hashedSeedPassword, "APPROVED", "ADMIN"]);

    // RLS Policy Setup
    const rlsTables = [
      'files', 'folders', 'library_items', 'legal_document_chunks',
      'website_scans', 'jobs', 'agent_execution_logs', 'compliance_audit_logs',
      'document_versions'
    ];
    for (const table of rlsTables) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table};`);

      let ownerColumn;
      if (table === 'files') {
        ownerColumn = 'creator_id';
      } else if (table === 'document_versions') {
        // Linked to files, which has creator_id
        await client.query(`
          CREATE POLICY ${table}_tenant_isolation ON ${table}
          USING (
            (EXISTS (SELECT 1 FROM files WHERE files.id = ${table}.file_id AND files.creator_id = current_setting('app.current_user_id', true))) OR
            (current_setting('app.current_user_role', true) = 'ADMIN')
          );
        `);
        continue;
      } else {
        ownerColumn = 'user_id';
      }

      await client.query(`
        CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (
          (${ownerColumn} = current_setting('app.current_user_id', true)) OR
          (current_setting('app.current_user_role', true) = 'ADMIN')
        );
      `);
    }

    await client.query("COMMIT");
    console.log("Database setup successful.");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Database setup failed, transaction rolled back:", err);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

setupDb();
