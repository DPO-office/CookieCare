  CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255),
        auth_provider VARCHAR(50) NOT NULL DEFAULT 'LOCAL',
        google_sub VARCHAR(255) UNIQUE,
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

      -- Drafting pipeline: clause catalog and template mappings
      CREATE TABLE IF NOT EXISTS clause_catalog (
        id VARCHAR(255) PRIMARY KEY,
        organization_id VARCHAR(255),
        clause_type VARCHAR(255) NOT NULL,
        contract_type VARCHAR(255),
        jurisdiction VARCHAR(255),
        industry VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        raw_text TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Vault template ingest (TemplateIngester) + TemplateRetriever
      CREATE TABLE IF NOT EXISTS contract_templates (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contract_type VARCHAR(255) NOT NULL,
        jurisdiction VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_contract_templates_type_status
        ON contract_templates (contract_type, status);

      -- Playbook PDF ingest (PlaybookIngester) + PlaybookRetriever
      CREATE TABLE IF NOT EXISTS playbook_rules (
        id VARCHAR(255) PRIMARY KEY,
        contract_type VARCHAR(255),
        topic VARCHAR(255) NOT NULL,
        risk_level VARCHAR(50),
        standard_position TEXT NOT NULL DEFAULT '',
        fallback_positions JSONB NOT NULL DEFAULT '[]'::jsonb,
        walk_away_condition TEXT NOT NULL DEFAULT '',
        trigger_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
        remediation_strategy TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_playbook_rules_contract_type
        ON playbook_rules (contract_type);

      -- Draft workflow save / refine (saveStep, drafting-handler, negotiate)
      CREATE TABLE IF NOT EXISTS draft_state_ledger (
        document_id VARCHAR(255) NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        state_snapshot_json JSONB NOT NULL,
        formatted_text TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (document_id, version)
      );

      CREATE TABLE IF NOT EXISTS template_clause_mappings (
        template_id VARCHAR(255) NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
        clause_id VARCHAR(255) NOT NULL REFERENCES clause_catalog(id) ON DELETE CASCADE,
        PRIMARY KEY (template_id, clause_id)
      );