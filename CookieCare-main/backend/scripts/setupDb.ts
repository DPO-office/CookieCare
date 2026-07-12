import { pool } from "../src/config/database.js";
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
        id SERIAL PRIMARY KEY,
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
        result JSONB DEFAULT NULL,
        error TEXT DEFAULT NULL,
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

    // Idempotent migrations for jobs table columns added post-initial-setup
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS result JSONB DEFAULT NULL;`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS error TEXT DEFAULT NULL;`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);

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

    // ── Seed Prompt & Question Library items (idempotent) ─────────────────
    // These are scoped to the admin user so they appear in the Vault Repository.
    // ON CONFLICT DO NOTHING means re-running setup never duplicates them.
    const adminId = "supreme_admin_id";

    const prompts = [
      ["lib_prompt_01", "Review Confidentiality Obligations",        "prompts", "Confidentiality", "Analyse all confidentiality and non-disclosure obligations in the agreement. Identify the scope, duration, permitted disclosures, and whether the obligations are mutual or one-sided. Flag any clause that is overly broad, missing a survival period, or lacks adequate remedies for breach."],
      ["lib_prompt_02", "Detect Liability Risks",                    "prompts", "Liability",       "Identify every clause that limits, excludes, or caps liability. Assess whether the liability cap is commercially reasonable, whether consequential loss exclusions are balanced, and whether any party bears disproportionate exposure. Highlight indemnification obligations and gross-negligence carve-outs."],
      ["lib_prompt_03", "Identify Missing Clauses",                  "prompts", "Completeness",    "Review the agreement and list standard clauses that are absent. Common missing clauses include: limitation of liability, force majeure, dispute resolution, governing law, entire agreement, data protection obligations, and anti-bribery provisions. For each missing clause, explain the risk it creates."],
      ["lib_prompt_04", "Review Payment Obligations",                "prompts", "Finance",         "Extract all payment terms: amounts, milestones, due dates, late-payment penalties, invoicing requirements, and currency. Identify clauses that allow unilateral fee changes, vague pricing, or unfair penalty structures. Assess whether payment terms are commercially balanced."],
      ["lib_prompt_05", "GDPR Compliance Review",                    "prompts", "GDPR",            "Analyse the agreement for GDPR compliance. Check for lawful basis of processing, data subject rights, processor obligations (Article 28), cross-border transfer mechanisms, data breach notification timelines, and retention policies. Identify gaps and recommend specific clause improvements."],
      ["lib_prompt_06", "Data Processing Review",                    "prompts", "Data",            "Examine all data processing provisions. Verify that the processor obligations are clearly defined, sub-processor approval mechanisms exist, data security standards are specified, audit rights are included, and deletion or return of data on termination is addressed."],
      ["lib_prompt_07", "Contract Inconsistency Detection",          "prompts", "Drafting",        "Scan the entire agreement for internal inconsistencies: conflicting definitions, cross-reference errors, contradictory obligations between clauses, inconsistent use of defined terms, and schedule conflicts with the main body. List every inconsistency with the relevant clause numbers."],
      ["lib_prompt_08", "Vendor Risk Review",                        "prompts", "Vendor",          "Assess the agreement from the perspective of vendor risk management. Examine subcontracting rights, service level commitments, step-in rights, business continuity obligations, insurance requirements, and exit provisions. Identify clauses that create excessive dependency on the vendor."],
      ["lib_prompt_09", "Termination Clause Review",                 "prompts", "Termination",     "Analyse all termination provisions: termination for cause, termination for convenience, notice periods, consequences of termination, survival clauses, and wind-down obligations. Flag clauses where one party has disproportionate termination rights or where termination triggers are vague."],
      ["lib_prompt_10", "Intellectual Property Rights Review",       "prompts", "IP",              "Identify and assess all intellectual property provisions. Clarify ownership of deliverables, background IP, foreground IP, licence grants, restrictions on use, moral rights waivers, and IP indemnification obligations. Flag any clause that inadvertently assigns IP to the counterparty."],
    ];

    const questions = [
      ["lib_ques_01", "What are the major legal risks?",                "questions", "Risk",           "What are the major legal risks in this agreement and which clauses create the most exposure?"],
      ["lib_ques_02", "Which clauses are missing?",                     "questions", "Completeness",   "Which standard clauses are missing from this agreement and what risk does each omission create?"],
      ["lib_ques_03", "Are liabilities balanced?",                      "questions", "Liability",      "Are the liability and indemnification obligations balanced between the parties, or does one party bear disproportionate exposure?"],
      ["lib_ques_04", "Is the agreement GDPR compliant?",               "questions", "GDPR",           "Does this agreement meet GDPR requirements? Identify any gaps in data protection obligations, processor clauses, or cross-border transfer mechanisms."],
      ["lib_ques_05", "What negotiation points exist?",                  "questions", "Negotiation",    "What are the most commercially important clauses to negotiate? Which provisions should be prioritised in a redline discussion?"],
      ["lib_ques_06", "Are termination clauses fair?",                   "questions", "Termination",    "Are the termination rights balanced? Does either party have unreasonably broad rights to terminate, and what are the financial consequences?"],
      ["lib_ques_07", "Does the agreement expose financial risk?",       "questions", "Finance",        "Does this agreement create unexpected financial exposure? Identify penalty clauses, unlimited liability provisions, payment obligations, and unfavourable pricing terms."],
      ["lib_ques_08", "Are confidentiality obligations sufficient?",     "questions", "Confidentiality","Are the confidentiality obligations adequate? Do they survive termination, cover all sensitive information, and provide proper remedies for breach?"],
      ["lib_ques_09", "Which clauses should be revised?",               "questions", "Drafting",       "Which clauses are ambiguous, poorly drafted, or likely to cause disputes? Provide specific redline suggestions for improvement."],
      ["lib_ques_10", "Summarise compliance concerns.",                 "questions", "Compliance",     "Provide a concise compliance summary: which regulations apply to this agreement, what obligations they impose, and where the agreement currently falls short."],
    ];

    for (const [id, name, type, tags, details] of prompts) {
      await client.query(
        `INSERT INTO library_items (id, user_id, type, name, description, tags, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [id, adminId, type, name, name, tags, details]
      );
    }

    for (const [id, name, type, tags, details] of questions) {
      await client.query(
        `INSERT INTO library_items (id, user_id, type, name, description, tags, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [id, adminId, type, name, name, tags, details]
      );
    }

    console.log("Prompt and Question library seeds applied.");

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
