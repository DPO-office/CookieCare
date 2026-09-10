# LORA — Module Architecture (Developer Detail)  
**Audience:** Developers onboarding to non-PAC modules  
**Companion docs:**  
- `PAC-Analysis-Drafting.md` — Drafting & Analysis (PAC)  
- `LORA-overview.md` — product map, tech stack, maturity overview  

**Scope:** How each **non-PAC** module works **today**. All are **early-stage static pipelines** unless noted. PAC migration is planned; not implemented for these modules.

---

## 0. Shared patterns (read first)

### Job queue + SSE

Most async features use the same contract:

1. Route validates input → `addJobToQueue(userId, jobType, payload)` → **202** `{ job_id }`
2. Background IIFE in `services/jobQueue.ts` runs the handler
3. Progress via `updateJobProgress` → `jobs` table + SSE broadcast
4. Client polls `GET /api/jobs/:id` or subscribes `GET /api/jobs/sse`

```typescript
// jobQueue.ts — dispatch switch
case "privacy_scanning":   → executePrivacyScanning
case "dpa_review":         → executeDPAReview
case "vendor_review":      → executeVendorReview
case "contract_comparison":→ executeContractComparison
case "document_analysis":  → executeDocumentAnalysis (includes legal_ask)
case "file_processing":    → executeFileProcessing
```

**Limitation:** In-process async — not a durable external queue (no Redis/Bull). Jobs lost if process crashes mid-run.

### RAG (used by Lawyer, DPA, Vendor)

- Chunks stored in `legal_document_chunks` after vault upload (`chunkAndIndexDocument`)
- Search: `RAG/ragService.ts` → `searchHybrid(query, userId, fileIds?, folderIds?)`
- **Embeddings currently disabled** (`embedText` returns null) — lexical FTS + ILIKE only
- Chunking: paragraph-aware sliding window (~800 chars, 150 overlap)

### LLM paths (dual during migration)

| Path | Used by |
|------|---------|
| `backend/src/llm` (task-typed, Gemini/OpenRouter) | Negotiate `/evaluate`, `/compromise`, Compare steps |
| `openRouterClient` + agents | DPA, Vendor, AI Ethics, legacy analyze |

---

## 1. Vault

**Pattern:** CRUD + background indexing — not an agent module  
**Frontend:** `frontend/src/features/vault`  
**Backend:** `routes/documents.ts`, `folders.ts`, `libraryItems.ts` · `controllers/documents.ts`, `folders.ts`, `libraryItems.ts`

### Purpose

Central document store for the product. Uploads feed RAG indexing. Optional ingest paths populate clause catalog, templates, and playbook rules used by Drafting and Negotiate.

### API surface

| Method | Route | Handler |
|--------|-------|---------|
| GET | `/api/documents` | List user + shared docs |
| GET | `/api/documents/:id` | Doc + version history |
| POST | `/api/documents/upload` | Multipart upload → jobs |
| POST/PUT/DELETE | `/api/documents/*` | CRUD, export, share, sign, redlines |
| GET/POST/DELETE | `/api/folders` | Folder tree |
| GET/POST/DELETE | `/api/library-items` | Library UI rows (templates/clauses/playbooks) |

### Upload flow (developer view)

```
POST /api/documents/upload
  multipart: file + optional systemFileType, contractType, jurisdiction

1. Validate MIME (PDF/DOCX/TXT/CSV/JSON/MD) + magic bytes, max 25MB
2. INSERT files row (empty content placeholder, folder_id)
3. Branch on systemFileType:
     playbooks  → PLAYBOOK_INGEST job + library_items row
     templates  → TEMPLATE_INGEST job + library_items row
     clauses    → CLAUSE_INGEST job + library_items row
4. Always queue file_processing job (extract + encrypt + index)
5. Return 202 { job_id, file_id, library_item_id?, ingest_job_id?, file_job_id }
```

### file_processing job

```
executeFileProcessing(jobId, userId, payload)
  → extractText(buffer, mimeType)
  → encrypt → UPDATE files.content
  → INSERT document_versions
  → chunkAndIndexDocument(fileId, content, userId)
     → legal_document_chunks rows (lexical search ready)
```

### Data model (key tables)

| Table | Role |
|-------|------|
| `files` | Document body (encrypted), metadata, redlines, signatures, sharing |
| `folders` | User folder hierarchy |
| `document_versions` | Append-only content snapshots |
| `legal_document_chunks` | RAG chunks linked to file_id |
| `library_items` | UI-facing library entries (processing status in `details` JSON) |
| `clause_catalog` | Structured clauses from CLAUSE_INGEST |
| `contract_templates` | Templates from TEMPLATE_INGEST |
| `playbook_rules` | Negotiation positions from PLAYBOOK_INGEST |

### Security notes

- Row-level access via Postgres session vars (`app.current_user_id`) in `withTransaction`
- Content encrypted at rest (`encrypt`/`decrypt` in controllers)
- Shared docs matched via `shared_with` JSONB on `files`

### Downstream consumers

- **Ask AI Lawyer** — `searchHybrid` over `documentIds`
- **Drafting** — templates, playbooks, clause catalog via retrieval capabilities
- **Legacy analyze** — folder/file scoped RAG
- **Negotiate save-step** — writes back to `files` + `draft_state_ledger`

---

## 2. Compare

**Pattern:** Static ordered pipeline (6 steps) — **not PAC**  
**Frontend:** `frontend/src/features/analyze/compare`  
**Backend:** `modules/compare`  
**Job type:** `contract_comparison`

### Purpose

Compare two agreement versions (original vs revised): extract structure, align clauses, detect semantic diffs, score risks, produce executive summary. Optional follow-up Q&A without re-running the pipeline.

### API

| Method | Route | Behavior |
|--------|-------|----------|
| POST | `/api/compare/start` | Multipart `original` + `revised` files → queue job |
| POST | `/api/compare/chat` | Follow-up Q&A on completed comparison |
| GET | `/api/compare/health` | Liveness |

**Request validation:** `CompareStartRequestSchema` (Zod) + MIME magic-byte checks, max size from `COMPARE_MAX_FILE_SIZE_BYTES`.

### End-to-end flow

```
POST /compare/start
  → compareStartController
  → addJobToQueue("contract_comparison", { title, original: base64..., revised: base64... })
  → 202 { job_id }

executeContractComparison (compare-handler.ts)
  → rebuild buffers from Base64
  → CompareWorkflowOrchestrator.execute(initialState)
  → strip buffers from result
  → compareSessionStore.set(jobId, artifacts)  // for /chat
  → return serializable payload as job.result
```

### Pipeline steps (`CompareWorkflowOrchestrator`)

Each step: `(CompareState) => CompareState` — immutable spread, no in-place mutation.

| Step | File | LLM? | What it does |
|------|------|------|--------------|
| 1 parse | `steps/parse.ts` | No | `extractText` both docs, normalise, reject if <150 chars |
| 2 structureExtract | `steps/structure-extract.ts` | Yes | Split into `ExtractedClause[]` per doc (headings, paths, offsets) |
| 3 clauseAlign | `steps/clause-align.ts` | Hybrid | Deterministic match first; LLM semantic batch for residuals |
| 4 diffDetect | `steps/diff-detect.ts` | Yes | Per aligned pair: material vs cosmetic change |
| 5 riskAnalysis | `steps/risk-analysis.ts` | Yes | Commercial/legal risk per diff + knowledge rules |
| 6 executiveSummary | `steps/executive-summary.ts` | Yes | Top-N summary from risks (Flash-tier model) |

**Progress:** `onProgress` callback → `updateJobProgress` (10% → 100% with stage messages).

**Metrics:** `pipelineMetrics` + `geminiScheduler` track wall time, LLM retries, rate limits per stage.

### CompareState (central object)

Defined in `models/compare-state.ts`. Key fields accumulated across steps:

```
files          → upload buffers (stripped before persist)
parsed         → { textA, textB, metaA, metaB }
structure      → { clausesA[], clausesB[] }
alignment      → AlignedPair[] (exact | semantic | unmatched)
differences    → per-pair change records
risks          → risk items linked to diffs
executiveSummary → markdown/string summary
metadata       → timestamps, stepTimings[]
```

### Clause alignment detail

`clause-align.ts` strategy:
1. **Deterministic** — exact text, title, numeric label, normalised heading (`deterministic-matcher.ts`)
2. **LLM semantic** — batches of up to 40 unmatched clauses; knowledge from `knowledge/` markdown via `knowledge-loader.ts`
3. **Fallback** — low confidence (<0.50) → `unmatched`; pipeline never hard-fails on LLM error

### Follow-up chat

```
POST /compare/chat { sessionId: job_id, question, history? }
  → compareSessionStore.get(sessionId)  // in-memory, not DB
  → auth: session.userId must match req.user
  → compareChatAgent.answer(session, question, history)
  → { answer: markdown }
```

Session holds: texts, clause lists, alignment, diffs, risks, summary — **no pipeline re-run**.

**Caveat:** Sessions are in-memory; lost on server restart.

### Job result shape (what frontend receives)

```json
{
  "title": "...",
  "parsed": { "metaA", "metaB", "textA", "textB" },
  "structure": { "clausesA", "clausesB" },
  "alignment": [...],
  "differences": [...],
  "risks": [...],
  "executiveSummary": "...",
  "metadata": { "stepTimings": [...] }
}
```

### Migration note

Structured pipeline with deterministic pre-pass — good candidate for PAC **Act** graph later, but no `PacController`, no ASK, no critique loop today.

---

## 3. Negotiate

**Pattern:** Static synchronous LLM — **not PAC**, mostly **not queued**  
**Frontend:** `frontend/src/features/negotiate`  
**Backend:** `routes/negotiate.ts` · `agents/negotiationAgent.ts` · `agents/legalAgent.ts`

### Purpose

Review contract text against playbooks; produce redlines, risk-graded markups, or single-clause compromise drafts. Optional persistence back to vault/draft ledger.

### API endpoints

| Route | Sync? | Input | Output |
|-------|-------|-------|--------|
| `POST /negotiate/run` | Yes | `{ documentContent, playbooks[], instructions }` | `{ redlines: markdown string }` |
| `POST /negotiate/evaluate` | Yes | `{ content, documentTitle?, documentType? }` | `{ data: { markups[] } }` |
| `POST /negotiate/compromise` | Yes | `{ originalText, riskExplanation?, userPrompt?, playbookPreferred? }` | `{ result: clause text }` |
| `POST /negotiate/save-step` | Yes | `{ documentId, content, version? }` | `{ success, savedState }` |

### /run — full negotiation report

```
AgentOrchestrator.runNegotiation
  → NegotiationAgent.negotiate()
  → executeCompletion(..., LLMTask.COMPLEX_DRAFT, GEMINI)
  → Markdown report:
       Executive Risk Summary
       Recommended Redline Adjustments (table)
       Tactical Negotiation Scripting
```

Playbooks joined as text blocks; default playbook string if empty.

### /evaluate — structured clause markups

Single JSON completion (`LLMTask.STRUCTURAL_JSON`, Gemini):
- Focus vectors: indemnity, IP, liability cap, termination, governing law
- Each markup: `clauseId`, verbatim `original`, `replacement`, `reasoning`, `riskLevel` (RED/YELLOW/GREEN)
- Content truncated to 12k chars
- On error: returns empty markups + warning (does not 500)

### /compromise — single clause rewrite

`LLMTask.REFINEMENT` — returns raw clause text only (no markdown fences). Mode: playbook-preferred (defensive) vs balanced compromise.

### /save-step — persistence bridge to Drafting ledger

```
1. Load latest draft_state_ledger snapshot for documentId (or seed empty DraftState)
2. Set draft.formattedDocument = content
3. saveStep(state)  // modules/drafting/capabilities/persist/save.js
4. UPDATE files.content (encrypted) + INSERT document_versions
```

This is the only Negotiate path that touches PAC drafting persistence — still not a PAC loop.

### Migration note

Early prototype. No work units, no critique verification, no evidence locators. Target: Analysis findings → targeted Negotiate redraft units, or PAC HUMAN_REFINE in Drafting.

---

## 4. Ask AI Lawyer

**Pattern:** Static single-shot agent + RAG — **not PAC**  
**Frontend:** `frontend/src/features/askAILawyer`  
**Backend:** `routes/lawyer.ts` · `agents/askLawyerAgent.ts` · `jobQueue.executeDocumentAnalysis`

### Purpose

Answer legal questions grounded in vault documents. Client sends **file IDs only** — never raw document text.

### API

```
POST /api/lawyer/ask
Body: {
  prompt: string,           // required
  documentIds?: string[],   // vault file IDs
  jurisdiction?: string[],  // e.g. ["England", "Delaware"]
  outputFormat?: "Brief Summary" | "Full IRAC" | "CREAC"
}
Response: 202 { success, job_id }
```

Legacy field `documents` accepted as alias for `documentIds`.

### Job execution path

```
addJobToQueue("document_analysis", { type: "legal_ask", prompt, documents, jurisdiction, outputFormat })

executeDocumentAnalysis:
  if payload.type === "legal_ask":
    AgentOrchestrator.askLawyer(prompt, userId, documentIds, jurisdiction, outputFormat)
      → searchHybrid(prompt, userId, documentIds)
      → contextText = joined chunks with [Source: title]
      → AskLawyerAgent.getAdvice({ prompt, context, jurisdictions, outputFormat, sources })
    return { text, sources[] }
```

### AskLawyerAgent behavior

- System prompt: document-grounded only — **no open-web knowledge**
- Jurisdiction clause injected when `jurisdictions` provided
- Format instructions vary by IRAC/CREAC/brief
- Returns `{ rawText, text, sources[] }` with excerpt metadata

### What it does NOT do today

- No multi-turn server memory (client must resend context or rely on job result)
- No PAC ASK for missing facts
- No finding/evidence locator model (unlike Analysis PAC)

### Related legacy path

`POST /api/analyze/interact` also uses `document_analysis` job with `folderIds`/`fileIds`/`prompt`/`history` → `interactAnalyze` (older AnalysisAgent + RAG). Separate from `/lawyer/ask` but same job type.

---

## 5. Cookie Scanner

**Pattern:** Static browser pipeline + rule/LLM enrichment — **not PAC**  
**Frontend:** `frontend/src/features/cookieScanner`  
**Backend:** `routes/vulnerabilities.ts` · `services/scannerService.ts`

### Purpose

Scan a public website for cookies, consent banners, CMPs, tracking tech; score compliance posture; optional enterprise report depth.

### API

| Route | Behavior |
|-------|----------|
| `POST /api/vulnerabilities/scan-cookie` | `{ url, scanDepth? }` → job `privacy_scanning` |
| `POST /api/vulnerabilities/scan-cookie/report` | Client sends scan JSON → server PDF |

**scanDepth:** `Lite` (1 page) · `Medium` (5) · `Deep` (20) · Enterprise (50)

### Job handler

```
executePrivacyScanning
  → ScannerService.scanCookie(url, userId, scanDepth, onProgress)
  → progress callbacks → updateJobProgress
  → return full scan JSON as job.result
```

### Internal scan phases (`scanCookie`)

```
1. URL validate (SSRF protection — block private/internal targets)
2. Parallel: discoverUrls(depth) | discoverCompliancePages | extractPageMetadata
3. Phase 1 — Pre-consent capture (Playwright per URL)
     → cookies, localStorage, network URLs, DOM consent signals, tech signals
4. Phase 2 — Reject flow (root page: click reject on CMP if found)
5. Phase 3 — Accept flow (root page: click accept)
6. Consent analysis — analyzeConsentBanner, detectCMP, evaluateCompliance, evaluateConsentQuality
7. Technology detection — detectTechnologies from merged page signals
8. Enterprise analyzer (depth-dependent)
9. Score assembly → scanSummary { overallScore, riskLevel, url, scannedAt, ... }
```

**Browser:** `browserManager` — Playwright primary, Puppeteer fallback; isolated context per visit.

**Shared infra:** Reuses `websiteScanner/urlValidator`, `pageCrawler`, `complianceDiscovery`, `metadataExtractor` (same building blocks as Vendor Review website scan).

### Typical result fields

- `scanSummary` — overall score, risk level, URL, depth, timestamp
- `cookiesDetected[]` — name, category, domain, retention, severity
- `complianceGaps[]` — regulation, severity, issue, remediation
- Consent intelligence (pre/post accept/reject cookie sets)
- `technologies[]` — detected trackers/analytics

### PDF report

Frontend posts completed scan payload to `/scan-cookie/report` → `buildCookieScanPdf` — no re-scan.

### Migration note

Deterministic browser phases are intentionally code-owned; LLM used for enrichment/scoring. PAC migration would mean ASK for scope (jurisdiction/regime) + critique on gap evidence — not started.

---

## 6. DPA Review

**Pattern:** Static one-shot agent + RAG — **not PAC**  
**Frontend:** `frontend/src/features/dpaReviewer`  
**Backend:** `routes/dpa.ts` · `agents/dpaReviewAgent.ts`

### Purpose

Upload a Data Processing Agreement; receive GDPR Art.28-oriented compliance scorecard with findings, missing clauses, and recommendations.

### API

```
POST /api/dpa/review
  multipart: file (PDF/DOCX/TXT, max 25MB)
  optional body: file_id (if already in vault)

→ extractText → reject if <100 chars cleaned
→ addJobToQueue("dpa_review", { documentText, fileName, fileId? })
→ 202 { job_id }
```

Review is **ephemeral by default** — file not stored in vault unless user uploaded separately.

### Job handler

```
executeDPAReview
  → staged progress messages (8%–97%)
  → AgentOrchestrator.runDPAReview(documentText, userId, fileId)
  → DPAReviewAgent.reviewDPA(...)
  → Zod-validated DPAReviewResult
```

### DPAReviewAgent pipeline

```
1. RAG: searchHybrid(DPA_RETRIEVAL_QUERY, userId, fileId?)
   → GDPR Art.28 reference chunks as grounding context
2. LLM completion with strict JSON schema prompt (10 evaluation dimensions)
3. normalizeLLMOutput() — merge legacy field names (compliantProvisions → findings, etc.)
4. DPAReviewResultSchema.parse() — hard validation
```

### Result schema (top-level keys)

| Field | Type |
|-------|------|
| `overallScore` | 0–100 |
| `riskLevel` | low \| medium \| high |
| `summary` | string |
| `findings[]` | clause, status (compliant/warning/missing), severity, articleReference, description, recommendation |
| `recommendations[]` | category, priority, items[] |
| `missingClauses[]` | clauseName, articleReference, reason, recommendation |
| `scoreBreakdown` | article28Compliance, processorObligations, securityMeasures, dataSubjectRights, internationalTransfers, subprocessorControls |

### Overlap with PAC modules

- Drafting has DPA **packs** (`packs/document-types/dpa`)
- Analysis has **`privacy-gdpr-dpa` skill**
- DPA Review agent is a **parallel static implementation** — knowledge not unified yet

---

## 7. Vendor Review

**Pattern:** Static pipeline (optional website scan + agent) — **not PAC**  
**Frontend:** `frontend/src/features/vendorReview`  
**Backend:** `routes/vendorReview.ts` · `agents/vendorReviewAgent.ts` · `services/websiteScanner`

### Purpose

Vendor onboarding risk assessment from uploaded vendor docs and/or vendor website URL.

### API

```
POST /api/vendor-review
  multipart: files[] (optional, up to 10 × 25MB)
  form field: vendorUrl (optional)
  → at least one required

→ extractText per file, merge with [DOCUMENT: name] headers
→ addJobToQueue("vendor_review", { documentText, vendorUrl?, fileNames[] })
→ 202 { job_id }
```

### Job handler (`executeVendorReview`)

```
1. If vendorUrl:
     WebsiteScannerService.scan(url, { crawlLimit: 20 })
     → privacy, cookie, security, trust, DPA pages, etc.
     (failure → log warning, continue document-only)
2. AgentOrchestrator.runVendorReview({ documentText, websiteScan, userId, fileIds })
3. VendorReviewAgent.reviewVendor(...)
   → RAG searchHybrid + LLM → Zod VendorReviewResult
```

### WebsiteScannerService (shared)

```
validateUrl → discoverUrls + discoverCompliancePages + extractPageMetadata
→ WebsiteScanResult {
     discoveredPages[], privacyPolicy, cookiePolicy, securityPage,
     trustCenter, dpa, aiPolicy, responsibleAI, ...
   }
```

Used by Vendor Review and AI Ethics — **not** the full 3-phase Playwright cookie capture (that's Cookie Scanner only).

### Result schema (high level)

- `overallScore`, `riskLevel`, `summary`
- `findings[]` — title, category, severity, status (passed/warning/missing/high-risk), evidence, recommendation
- `scoreBreakdown` — privacyPosture, securityPosture, gdprCompliance, ccpaCompliance, contractualRisk, vendorTransparency
- `certifications[]`, `complianceItems[]`, `vendorInfo`

---

## 8. AI Ethics Review

**Pattern:** Same as Vendor Review, different agent focus — **not PAC**  
**Frontend:** `frontend/src/features/aiEthics`  
**Backend:** `routes/aiEthics.ts` · `agents/aiEthicsAgent.ts`

### Purpose

Review AI vendor/product governance from docs + website (responsible AI, model cards, safety policies, transparency pages).

### API

```
POST /api/ai-ethics
  multipart: files[] + optional websiteUrl
  → job ai_ethics_review
```

### Job flow

Mirrors `executeVendorReview` but:
- `WebsiteScannerService.scan(websiteUrl, { crawlLimit: 30 })`
- Emphasis on AI governance pages: `aiPolicy`, `responsibleAI`, `safetyPage`, `modelSpec`, `transparencyPage`, `charterPage`
- `AIEthicsAgent.reviewAIEthics(...)` → ethics-specific scorecard

Privacy/governance adjacent — not core Legal workflow.

---

## 9. Vulnerability Scan

**Pattern:** Static security audit — **not PAC**  
**Frontend:** `frontend/src/features/vulnerabilityScanner`  
**Backend:** `routes/vulnerabilities.ts` · `ScannerService.scanVulnerability`

### Purpose

Non-cookie security assessment of a public URL (headers, SSL, exposed paths, etc.).

### API

```
POST /api/vulnerabilities/scan-vulnerability  { url }
  → job vulnerability_scanning

POST /api/vulnerabilities/scan-vulnerability/report
  → PDF from client-provided scan JSON
```

### Handler flow

```
executeVulnerabilityScanning
  → ScannerService.scanVulnerability(url, userId, onProgress)
  → validateUrl (SSRF) → browser/HTTP checks → generateVulnReport
  → { securityScore, overallRisk, findings[{ name, vector, severity, remediation }] }
```

Shares URL validation and browser infra with Cookie Scanner but **different analysis path** (`vulnReportService`).

---

## 10. Module comparison table

| Module | Queued? | LLM | Browser | RAG | Persist result |
|--------|---------|-----|---------|-----|----------------|
| Vault | Yes (index/ingest) | Ingest jobs only | No | Writes chunks | files, catalogs |
| Compare | Yes | Multi-step | No | No | job.result + memory session |
| Negotiate | No (sync) | Yes | No | No | optional save-step → files |
| Ask Lawyer | Yes | Yes | No | Reads chunks | job.result only |
| Cookie Scan | Yes | Partial | Yes | No | job.result (+ website_scans) |
| DPA Review | Yes | Yes | No | Optional | job.result only |
| Vendor Review | Yes | Yes | Optional crawl | Yes | job.result only |
| AI Ethics | Yes | Yes | Optional crawl | Yes | job.result only |
| Vuln Scan | Yes | Partial | Yes | No | job.result only |

---

## 11. Key file index

```
backend/src/
  routes/
    documents.ts, folders.ts, libraryItems.ts
    negotiate.ts, lawyer.ts, dpa.ts, vendorReview.ts, aiEthics.ts, vulnerabilities.ts
    jobs.ts
  controllers/documents.ts
  services/
    jobQueue.ts
    scannerService.ts
    websiteScanner/
    jobs/handlers/compare-handler.ts
  agents/
    legalAgent.ts          ← orchestrator facade
    negotiationAgent.ts, askLawyerAgent.ts
    dpaReviewAgent.ts, vendorReviewAgent.ts, aiEthicsAgent.ts
  modules/compare/
    workflows/compare-workflow.ts
    steps/{parse,structure-extract,clause-align,diff-detect,risk-analysis,executive-summary}.ts
    api/{controller,chat-controller,route}.ts
    session/compare-session-store.ts
  RAG/ragService.ts
```

---

## 12. Migration outlook (all modules in this doc)

| Module | Likely next step |
|--------|------------------|
| Vault | Stay infrastructure; unify ingest with drafting packs |
| Compare | PAC Act graph or Analysis compare skill; persist sessions |
| Negotiate | Targeted redo units; link Analysis findings |
| Ask Lawyer | Multi-turn + PAC ASK; or Analysis explain_qa |
| DPA Review | Merge into Analysis privacy skill + evidence locators |
| Vendor / AI Ethics | Website scan as ACT tools; critique on findings |
| Cookie / Vuln | Keep deterministic scan core; PAC for interpretation layer only |

**Drafting & Analysis PAC reference:** `PAC-Analysis-Drafting.md`
