# LORA backend workflows

Mastra workflows live in the backend. The backend serves HTTP requests and resolves user access; the frontend owns the UI. Knowledge-base ingestion is the first workflow feature here. The other product features can move one at a time after their service contracts are stable.

```text
backend/
  src/mastra/
    index.ts                     # Register public workflows and agents
    knowledge-base/
      ingestion/
        workflows/               # Fixed sequences
        steps/                   # One operation per workflow step
        contracts/               # Step input and output schemas
        schemas/                 # KB record schemas
        storage/                 # PostgreSQL migrations and scoped source access
        worker.ts                # Durable job consumer
        evaluation/              # Cases and comparison runner
        tests/
      retrieval/                 # Add when retrieval is implemented
    analysis/                   # Add during analysis migration
    drafting/                   # Add during drafting migration
    legal-qa/                   # Add during lawyer Q&A migration
    orchestration/              # Add for cross-feature planning
```

Keep tools with their owning feature. Add `tools/`, `agents/` and `services/` inside a feature when needed. A shared folder is appropriate only for stable code actually used by multiple features. There is no global tool collection.

Use Mastra static workflows for fixed ingestion and approval gates. A future agent can choose a feature capability for analysis, drafting or legal Q&A without deciding whether ingestion may skip validation or review. [Mastra workflow control flow](https://mastra.ai/docs/workflows/control-flow).

Two static workflows are registered: `kb-source-intake-v1` classifies an already validated source/version pair, and `kb-process-ingestion-v1` re-verifies an uploaded original and records the intake decision. The latter runs from a leased PostgreSQL job; it does not parse provisions or publish knowledge.

Phase 1 adds PostgreSQL KB tables, versioned migrations and a server-side source access service. Set `DATABASE_URL` and run `npm run kb:migrate` from the repository root after the existing backend `users` table exists. The worker applies KB migrations before starting and stops if they fail. PostgreSQL must have the `vector` extension available. This does not create a DigitalOcean Space or upload objects; Phase 2 owns that integration.

Phase 2 adds authenticated backend routes under `/api/knowledge-base`, private Spaces uploads and a PostgreSQL worker queue. Configure `DATABASE_URL`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`, `DO_SPACES_KEY`, and `DO_SPACES_SECRET` for both backend and worker. Mastra uses PostgreSQL for workflow run storage when `DATABASE_URL` is present; the KB queue and checkpoints also live in PostgreSQL. Run `npm run kb:worker` from the repository root as a separate process on the same server as the API. The command applies KB migrations before starting. See [the ingestion guide](knowledge-base/ingestion/README.md) for the request sequence.

On a fresh checkout, run `npm ci` at the repository root. Then run `npm run lint:kb`, `npm run test:kb` and `npm run kb:evaluate`. With a configured database, `npm run dev:mastra` starts Mastra Studio for local workflow inspection.
