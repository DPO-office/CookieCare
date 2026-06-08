import { pool } from "./database.js";
import argon2 from "argon2";

export async function dbInit() {
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS legal_document_chunks (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(3072),
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `);

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
        message TEXT,
        payload JSONB DEFAULT '{}'::jsonb,
        result JSONB,
        error TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE
      );
    `);

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_audit_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action_type VARCHAR(100) NOT NULL,
        prompt TEXT,
        context_files JSONB DEFAULT '[]'::jsonb,
        ai_response TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed default settings for AI Lawyer
    await client.query(`
      INSERT INTO system_settings (key, value)
      VALUES
        ('jurisdictions', '[
          {"key": "in_direct", "label": "India (Direct Taxes)"},
          {"key": "in_indirect", "label": "India (Indirect Taxes)"},
          {"key": "in_corp", "label": "India (Corporate Laws)"},
          {"key": "in_general", "label": "India (General Laws)"},
          {"key": "us_fed", "label": "United States (Federal Legal Research)"},
          {"key": "us_state", "label": "United States (State Legal Research)"}
        ]'::jsonb),
        ('web_discovery_sources', '[
          "https://mca.gov.in/content/mca/global/en/home.html",
          "https://www.sec.gov/news/pressreleases"
        ]'::jsonb)
      ON CONFLICT (key) DO NOTHING;
    `);

    const hashedSeedPassword = await argon2.hash("MamuSecure2026!");
    await client.query(`
      INSERT INTO users (id, email, name, password_hash, status, role, approved_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (email) DO NOTHING;
    `, ["supreme_admin_id", "swarnaaishwarya17@gmail.com", "Supreme Admin", hashedSeedPassword, "APPROVED", "ADMIN"]);

    // --- Enterprise Security: Row Level Security (RLS) ---
    const rlsTables = ['files', 'folders', 'library_items', 'legal_document_chunks', 'website_scans', 'jobs', 'agent_execution_logs', 'compliance_audit_logs'];
    for (const table of rlsTables) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);

      // Drop existing if any to avoid errors on re-run
      await client.query(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table};`);

      let ownerColumn = 'user_id';
      if (table === 'files') ownerColumn = 'creator_id';

      await client.query(`
        CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (${ownerColumn} = current_setting('app.current_user_id', true) OR current_setting('app.current_user_role', true) = 'ADMIN');
      `);
    }

    // System Settings RLS: Global Read for authenticated users, Admin Write
    await client.query(`ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;`);
    await client.query(`DROP POLICY IF EXISTS system_settings_read_policy ON system_settings;`);
    await client.query(`
      CREATE POLICY system_settings_read_policy ON system_settings
      FOR SELECT USING (current_setting('app.current_user_id', true) IS NOT NULL);
    `);

    // Performance Optimization: Indexes
    await client.query("CREATE INDEX IF NOT EXISTS idx_files_creator_id ON files(creator_id);");
    await client.query("CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id);");
    await client.query("CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);");
    await client.query("CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON legal_document_chunks(file_id);");
    await client.query("CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON legal_document_chunks USING hnsw (embedding vector_cosine_ops);");
    await client.query("CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);");
    await client.query("CREATE INDEX IF NOT EXISTS idx_agent_logs_user_id ON agent_execution_logs(user_id);");

    console.log("Database initialized with RLS and supreme admin seeded.");
  } catch (err) {
    console.error("Database initialization failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
