# LORA — Platform Architecture Brief  
**Audience:** Senior engineering / architecture review · onboarding developers  
**PAC detail (Drafting + Analysis):** `PAC-Analysis-Drafting.md`  
**Module detail (all other modules — developer depth):** `LORA-Modules-Architecture-Detail.md`

Most of the product is **early stage** and runs on **static pipelines** (fixed steps → LLM or browser → report). **Drafting** and **Analysis** are the only modules on **PAC** today (`Plan → Act → Critique` + `Ask`). Everything else is planned to move toward that pattern.

---

## 1. Product map

| Space | Surfaces | Pattern today |
|-------|----------|---------------|
| **Legal** | Vault · Drafting · Analysis · Compare · Negotiate · Ask AI Lawyer | Drafting/Analysis = PAC; rest = static |
| **Privacy** | Cookie Scanner · DPA Review · Vendor Review · AI Ethics · Vuln Scan | Static |

---

## 2. Tech stack (developer essentials)

| Layer | Stack |
|-------|--------|
| **Frontend** | React 19 · Vite 6 · TypeScript · Tailwind 4 · TipTap · Firebase auth |
| **Backend** | Node · Express 4 · TypeScript (ESM) · esbuild bundle |
| **DB** | PostgreSQL (`setupDb.ts`) — `files`, `folders`, `jobs`, `legal_document_chunks`, `draft_state_ledger`, `analysis_state_ledger`, catalogs |
| **LLM** | `backend/src/llm` — Gemini + OpenRouter, task-typed (`LLMTask`) |
| **RAG** | `RAG/ragService.ts` — hybrid search on vault chunks |
| **Jobs** | In-process queue (`jobQueue.ts`) + SSE `/api/jobs/sse` (not Redis yet) |
| **Scanners** | Playwright/Puppeteer (`browserManager`, `websiteScanner/*`) |
| **Auth** | JWT + Firebase Admin · `/api/*` via `routes/index.ts` |

**Monorepo:** `frontend/` · `backend/` · `docs/`  
**Run:** `npm run dev:backend` · `dev:frontend` · `setup-db` · `build` · `test`

---

## 3. Shared runtime (static features)

```
POST /api/<feature>  →  validate / extract  →  addJobToQueue  →  202 { job_id }
                                                      ↓
                                            handler / agent / scanner
                                                      ↓
                              jobs table update + SSE  →  client poll or SSE
```

**Exceptions:** Negotiate returns sync JSON on main paths; Drafting PAC streams tokens; Compare has session `/chat`.

---

## 4. Legal space

---

### 4.1 Vault

**Detailed doc:** §1 in `LORA-Modules-Architecture-Detail.md`

**Path:** `routes/documents.ts` · `folders.ts` · `libraryItems.ts` · `controllers/*`  
**API:** `/api/documents` · `/api/folders` · `/api/library-items`  
**Pattern:** CRUD + indexing — not an agent module

**What it does**  
Stores user documents, folders, versions; uploads trigger RAG chunking. Holds clause catalog, contract templates, playbook rules (ingest jobs: `CLAUSE_INGEST`, `TEMPLATE_INGEST`, `PLAYBOOK_INGEST`). Downstream features read from here.

**Flow**
```
upload → file_processing job → extractText → chunkAndIndexDocument → legal_document_chunks
catalog ingest jobs → clause_catalog / contract_templates / playbook_rules
```

**Frontend:** `features/vault`

---

### 4.2 Drafting · 4.3 Analysis

**PAC modules** — full architecture, control flows, domain models: **`PAC-Analysis-Drafting.md`**

| | Drafting | Analysis |
|--|----------|----------|
| API | `/api/drafting` | `/api/analysis` |
| Path | `modules/drafting` | `modules/analysis` |
| Legacy | `routes/drafting.ts`, `template_drafting` job | `/api/analyze`, `document_analysis` job |

---

### 4.4 Compare

**Detailed doc:** §2 in `LORA-Modules-Architecture-Detail.md`  
**Path:** `modules/compare`  
**API:** `POST /compare/start` · `POST /compare/chat` · `GET /compare/health`  
**Job:** `contract_comparison`  
**Pattern:** Static multi-step pipeline (early — **not PAC**)

**What it does**  
Compares two agreements (original vs revised): structure, clause alignment, semantic diffs, risk view, executive summary. Follow-up Q&A uses in-memory session + chat agent.

**Flow**
```
upload original + revised
  → parse → structureExtract → clauseAlign → diffDetect → riskAnalysis → executiveSummary
  → job result to client
optional: /chat(sessionId, question) → compare-chat-agent
```

**Key files:** `workflows/compare-workflow.ts` · `steps/*` · `knowledge/` (markdown, copied at build) · `session/compare-session-store.ts`

**Frontend:** `features/analyze/compare`

**Migration:** Planned PAC or shared Analysis skills for risk/diff stages — no phase controller today.

---

### 4.5 Negotiate

**Detailed doc:** §3 in `LORA-Modules-Architecture-Detail.md`  
**API:** `POST /negotiate/run` · `/evaluate` · clause rewrite endpoints  
**Pattern:** Static LLM calls (early — **not PAC**, often **sync** not queued)

**What it does**  
Scores contract clauses against playbooks; returns redlines / markups (risk level, verbatim original, replacement text). `/evaluate` uses structured JSON schema for key vectors (indemnity, IP, liability, termination, governing law). Can persist steps via draft ledger.

**Flow**
```
documentContent + playbooks + instructions
  → AgentOrchestrator.runNegotiation  OR  direct JSON completion (/evaluate)
  → redlines / markups JSON (sync response)
```

**Frontend:** `features/negotiate`

**Migration:** Target PAC targeted redraft or handoff from Analysis findings — prototype-grade vs Drafting today.

---

### 4.6 Ask AI Lawyer

**Detailed doc:** §4 in `LORA-Modules-Architecture-Detail.md`  
**API:** `POST /lawyer/ask`  
**Job:** `document_analysis` (payload `type: legal_ask`)  
**Pattern:** Static single-shot agent + RAG (early — **not PAC**)

**What it does**  
Answers legal questions grounded in vault documents. Server retrieves chunks via `searchHybrid(documentIds)` — client sends IDs only, not raw text. Output formats: Brief Summary · Full IRAC · CREAC; optional jurisdiction list.

**Flow**
```
prompt + documentIds → queue → searchHybrid → AskLawyerAgent.getAdvice → markdown answer (+ sources)
```

**Frontend:** `features/askAILawyer`

**Migration:** Multi-turn memory + PAC ASK/ACT or Analysis `explain_qa` — single pass today.

---

## 5. Privacy space

All privacy features below are **static pipelines**, **early stage**, **job + SSE** (except PDF report endpoints). PAC migration is planned but not started.

---

### 5.1 Cookie Scanner

**Detailed doc:** §5 in `LORA-Modules-Architecture-Detail.md`  
**API:** `POST /vulnerabilities/scan-cookie` · `POST .../scan-cookie/report` (PDF)  
**Job:** `privacy_scanning`

**What it does**  
Crawls a URL with Playwright; discovers cookies, consent banners, CMP, tech stack; scores consent quality and regulation-oriented compliance; optional enterprise analysis.

**Flow**
```
url + scanDepth → ScannerService.scanCookie
  → validateUrl → crawl → compliance page discovery → cookie/CMP/consent analysis
  → scored JSON (+ website_scans persistence where used)
```

**Frontend:** `features/cookieScanner`

---

### 5.2 DPA Review

**Detailed doc:** §6 in `LORA-Modules-Architecture-Detail.md`  
**API:** `POST /dpa/review` (multipart file)  
**Job:** `dpa_review`

**What it does**  
Reviews uploaded DPA for GDPR Art.28-style compliance: score breakdown, findings, missing clauses, recommendations. RAG grounding + LLM → Zod-validated JSON. Progress messages are staged around one agent run.

**Flow**
```
file upload → extractText → queue → DPAReviewAgent (+ searchHybrid)
  → overallScore, riskLevel, findings[], missingClauses[], recommendations[]
```

**Frontend:** `features/dpaReviewer`

**Note:** Overlaps Drafting DPA packs / Analysis `privacy-gdpr-dpa` skill — separate agent today; unify later.

---

### 5.3 Vendor Review

**Detailed doc:** §7 in `LORA-Modules-Architecture-Detail.md`  
**API:** `POST /vendor-review` (files[] and/or `vendorUrl`)  
**Job:** `vendor_review`

**What it does**  
Vendor onboarding risk: uploaded docs + optional website crawl (privacy, cookie, security, trust pages) + RAG → scorecard (privacy, security, GDPR, CCPA, contractual risk, certifications).

**Flow**
```
files and/or vendorUrl
  → optional WebsiteScannerService.scan (fallback if crawl fails)
  → VendorReviewAgent → findings + scoreBreakdown + recommendations
```

**Frontend:** `features/vendorReview`

---

### 5.4 AI Ethics

**Detailed doc:** §8 in `LORA-Modules-Architecture-Detail.md`  
**API:** `POST /ai-ethics` (files[] and/or `websiteUrl`)  
**Job:** `ai_ethics_review`

**What it does**  
Same shape as Vendor Review but focused on AI governance pages (responsible AI, model cards, safety policies). Privacy/governance adjacent.

**Frontend:** `features/aiEthics`

---

### 5.5 Vulnerability Scan

**Detailed doc:** §9 in `LORA-Modules-Architecture-Detail.md`  
**API:** `POST /vulnerabilities/scan-vulnerability` · `.../scan-vulnerability/report`  
**Job:** `vulnerability_scanning`

**What it does**  
Security-oriented website audit (headers, SSL, exposed paths, etc.) — ships beside Cookie Scanner, same route prefix.

**Frontend:** `features/vulnerabilityScanner`

---

## 6. Orchestration maturity

```
STATIC (early)                              PAC (reference)
────────────────────────────────            ─────────────────
Vault · Compare · Negotiate                 Drafting
Ask AI Lawyer                               Analysis
Cookie · DPA · Vendor · AI Ethics · Vuln
Legacy /analyze · legacy drafting jobs
                    │
                    └── planned migration → same PAC bar as Drafting/Analysis
```

**PAC bar:** TS-owned phases · explicit plan/work units · ASK + resume · critique + targeted redo · shared packs/skills.

---

## 7. Job types

| Job type | Feature |
|----------|---------|
| `file_processing` | Vault index |
| `document_analysis` | Legacy analyze · Ask Lawyer |
| `analysis_pac` | Analysis PAC |
| `template_drafting` | Legacy drafting |
| `contract_comparison` | Compare |
| `privacy_scanning` | Cookie Scanner |
| `vulnerability_scanning` | Vuln Scan |
| `dpa_review` | DPA Review |
| `vendor_review` | Vendor Review |
| `ai_ethics_review` | AI Ethics |
| `PLAYBOOK_INGEST` / `CLAUSE_INGEST` / `TEMPLATE_INGEST` | Vault catalogs |

Handler entry: `services/jobQueue.ts`.

---

## 8. Where to look (quick index)

| Module | Backend | Frontend |
|--------|---------|----------|
| Routes mount | `routes/index.ts` | — |
| Drafting / Analysis PAC | `modules/{drafting,analysis}` | `features/drafting`, `features/analyze` |
| Compare | `modules/compare` | `features/analyze/compare` |
| Negotiate / Lawyer / DPA / Vendor | `routes/*.ts`, `agents/*` | matching `features/*` |
| Scanners | `scannerService`, `websiteScanner` | `cookieScanner`, `vulnerabilityScanner` |
| Jobs / SSE | `jobQueue.ts`, `routes/jobs.ts` | `features/queue` |
| LLM | `llm/` | — |
| RAG | `RAG/ragService.ts` | — |

---

## 9. Review prompts (seniors)

1. Migration order after PAC — Compare vs DPA vs Vendor?  
2. Collapse legacy `agents/*` + direct OpenRouter into `llm/` + modules.  
3. In-process jobs vs durable workers for production.  
4. Single vault document ID contract across Lawyer / Analysis / Drafting / Negotiate.  
5. Unify DPA/Vendor prompts with Drafting packs + Analysis skills.  
6. Which static reports are alpha vs customer-ready.

---

*Drafting & Analysis PAC: `docs/PAC-Analysis-Drafting.md`*  
*All other modules (developer detail): `docs/LORA-Modules-Architecture-Detail.md`*
