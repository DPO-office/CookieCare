# CookieCare Mastra

This project owns new agent and workflow code. The existing backend serves HTTP requests and resolves user access; the frontend owns the UI. Knowledge-base ingestion is the first feature here. The other product features can move one at a time after their service contracts are stable.

```text
mastra/
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

Phase 1 adds PostgreSQL KB tables, versioned migrations and a server-side source access service. Set `DATABASE_URL` and run `npm run kb:migrate` after the existing backend `users` table exists. `npm run dev` and `npm start` run this migration first and stop if it fails. PostgreSQL must have the `vector` extension available. This does not create an S3 bucket or upload objects; Phase 2 owns that integration.

Phase 2 adds authenticated backend routes under `/api/knowledge-base`, private S3 uploads and a PostgreSQL worker queue. Configure `DATABASE_URL`, `AWS_REGION`, `KB_S3_BUCKET` and AWS credentials for both backend and worker. Mastra uses PostgreSQL for workflow run storage when `DATABASE_URL` is present; the KB queue and checkpoints also live in PostgreSQL. Run `npm run kb:worker` from this folder as a separate process. The command applies KB migrations before starting. See [the ingestion guide](src/mastra/knowledge-base/ingestion/README.md) for the request sequence.

On a fresh checkout, run `npm install` in this folder. Then run `npm run typecheck`, `npm test` and `npm run kb:evaluate`. With a configured database, `npm run dev` starts Mastra Studio for local workflow inspection.
