# randtrust
### The Enterprise Trust Platform
**Legal • Privacy • AI Governance • Compliance • Risk**

**Version:** 1.0

---

## 1. Executive Overview

### 1.1 Project Summary

randtrust is a full-stack TypeScript platform (React frontend + Express backend) that automates the legal-agreement lifecycle for in-house legal and compliance teams. Users can draft agreements from templates and playbooks, run AI-assisted analysis and Q&A over uploaded documents, and negotiate redlines — all grounded in the organisation’s own document set via Retrieval-Augmented Generation (RAG).

Long-running AI work (drafting, analysis, scanning, review) runs in the background and streams progress to the browser. Document content is encrypted at rest, and each tenant is isolated at the database layer. AI reasoning is powered primarily by Google Gemini.

### 1.2 Key Objectives & Scope

**In scope**

| Capability | Summary |
| :--- | :--- |
| Draft Agreements | AI drafting (Basic, Proactive, Reactive) with human refinement and playbook support |
| Analyze Agreements | Interactive AI review and structured audit of uploaded documents |
| Ask AI Lawyer | Grounded legal Q&A (IRAC / CREAC / Summary) over indexed documents |
| Negotiate Redlines | Clause-level risk evaluation, compromise re-drafting, and redline application |
| Cookie Scanner | Website privacy scanning for cookies, consent banners, and regulation alignment |
| Vulnerability Scanner | Website security checks (headers, cookies, redirects, common risks) |
| DPA Reviewer | AI review of Data Processing Agreements for GDPR Article 28 and privacy risk |
| Vendor Review | Third-party vendor privacy, security, and compliance assessment |
| AI Ethics Score | AI governance assessment (transparency, accountability, regulatory alignment) |

Supporting capabilities (authentication, encryption, document vault, background jobs, logging) are covered in Sections 5–6.

**Out of scope**

The Settings UI is largely a client-side mock and is not backed by persisted server state beyond a read-only system settings lookup.

---

## 2. High-Level Features Overview

| Feature | Description | Target users |
| :--- | :--- | :--- |
| Draft Agreements | Generate contracts from instructions, templates, clauses, and playbooks (Basic / Proactive / Reactive) plus inline AI refinement | Legal drafters |
| Analyze Agreements | Interactive AI review and structured audit with document-grounded findings | Legal reviewers |
| Ask AI Lawyer | Document-grounded legal Q&A with IRAC, CREAC, or brief-summary answers and citations | Legal researchers |
| Negotiate Redlines | Clause risk markup (RED / YELLOW / GREEN), AI compromise drafts, accept/reject with version history | Negotiators |
| Cookie Scanner | Detect tracking cookies, consent behaviour, and privacy risks; report against GDPR, CCPA, DPDP | Privacy teams |
| Vulnerability Scanner | Audit security headers, cookie flags, redirects, and related risks; scored report with remediation | Security teams |
| DPA Reviewer | Review DPAs for GDPR Article 28 and transfer obligations | Privacy / legal |
| Vendor Review | Assess vendor documents and public compliance pages into a risk profile | Vendor risk / compliance |
| AI Ethics Score | Score documents/websites against AI-governance standards (NIST AI RMF, ISO 42001, EU AI Act, etc.) | AI governance |

---

## 3. System Architecture & Design

*Note: Architecture diagrams in this section are reserved for design in progress.*

### 3.1 Tech Stack

| Layer | Stack |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS, TipTap (rich text) |
| **Backend** | Node.js, Express, background jobs with live progress streaming |
| **Database** | PostgreSQL with multi-tenant isolation (Row-Level Security) and document search support |
| **AI** | Google Gemini (Vertex AI) as the primary LLM |
| **Security** | JWT auth, password hashing, AES-256 document encryption |
| **Hosting** | Docker; deployable on Render / Cloud SQL / Neon |

### 3.2 High-Level Architecture Diagram — Legal Review

*[Diagram placeholder — Legal Review umbrella covering Draft, Analyze, Ask AI Lawyer, Negotiate]*

### 3.3 High-Level Architecture Diagram — Privacy & Trust

*[Diagram placeholder — Privacy umbrella covering Cookie Scanner, Vulnerability Scanner, DPA Review, Vendor Review, AI Ethics Score]*

---

## 4. Feature Specifications & Workflows

### Feature 4.1: Draft Agreements

**A. Objective & Overview**

Generates legal agreements from user instructions, templates, clause libraries, and playbooks.

- **Basic** — fast, form-driven draft (e.g. NDA quick-draft)
- **Proactive** — guided draft using a selected template, clauses, and optional AI rulebook
- **Reactive** — revise an uploaded agreement while preserving parties, dates, and numbering
- **Refinement** — inline editor edits (tone, grammar, extend, reduce, simplify, complete, ask)

Generation runs in the background; the UI streams progress until the draft appears in the editor.

**B. High-Level Architecture**

*[Diagram placeholder]*

**C. User Flow**

1. User configures a draft (or uploads a source for Reactive / highlights text to refine) and submits.
2. System queues the job and streams progress to the browser.
3. AI extracts requirements, retrieves playbooks/templates/clauses, and assembles context.
4. Draft is generated, lightly validated, and saved (encrypted) with version history.
5. Result opens in the editor for review, export (DOCX/PDF), and further refinement.

**D. Key APIs**

| API | Purpose |
| :--- | :--- |
| `POST /api/drafting/generate-stream` | Start draft generation (Basic / Proactive / Reactive) |
| `POST /api/drafting/refine` | Inline refinement from the editor |
| `POST /api/drafting/process-uploaded-template` | Upload source template for Reactive mode |
| `GET /api/jobs/sse` | Live job progress |
| `POST /api/documents/export` | Export DOCX / PDF |

---

### Feature 4.2: Analyze Agreements

**A. Objective & Overview**

AI-assisted review of uploaded agreements: an interactive grounded report / follow-up chat, plus a structured audit that produces validated findings saved on the document. Answers are grounded in retrieved document text.

**B. High-Level Architecture**

*[Diagram placeholder]*

**C. User Flow**

1. User uploads and indexes documents, then selects scope and submits a prompt (or library question).
2. System queues analysis and retrieves relevant document passages.
3. AI produces a grounded markdown review (or a structured audit).
4. Result streams to the UI; audits are saved on the document record.

**D. Key APIs**

| API | Purpose |
| :--- | :--- |
| `POST /api/analyze/interact` | Interactive grounded analysis |
| `POST /api/analyze/remediate` | Structured audit |
| `POST /api/documents/upload` | Upload and index documents |
| `GET /api/jobs/sse` | Live job progress |

---

### Feature 4.3: Ask AI Lawyer

**A. Objective & Overview**

Answers legal questions strictly grounded in the user’s indexed documents, in a selectable format (Brief Summary, Full IRAC, or CREAC), with source citations. Answers are constrained to retrieved document context — not open-web knowledge.

**B. High-Level Architecture**

*[Diagram placeholder]*

**C. User Flow**

1. User submits a question with optional jurisdiction, format, and document selection.
2. System retrieves relevant passages from the knowledge base.
3. AI answers in the requested legal format and attaches source excerpts.
4. Result streams to the UI with a sources panel.

**D. Key APIs**

| API | Purpose |
| :--- | :--- |
| `POST /api/lawyer/ask` | Ask a grounded legal question |
| `GET /api/settings/jurisdictions` | Jurisdiction picker options |
| `POST /api/documents/upload` | Upload and index documents |
| `GET /api/jobs/sse` | Live job progress |

---

### Feature 4.4: Negotiate Redlines

**A. Objective & Overview**

Evaluates an agreement clause-by-clause (RED / YELLOW / GREEN risk), suggests replacements with reasoning, offers AI “compromise” re-drafts, and applies accepted changes as versioned redlines.

**B. High-Level Architecture**

*[Diagram placeholder]*

**C. User Flow**

1. User opens a document from the vault in Negotiate.
2. System evaluates clauses and returns risk markups.
3. User inspects clauses; optionally requests an AI compromise draft.
4. Accepted changes are saved with version history; legacy redline accept/reject is also supported.
5. Document can be exported (PDF / DOCX).

**D. Key APIs**

| API | Purpose |
| :--- | :--- |
| `POST /api/negotiate/evaluate` | Clause-level risk markups |
| `POST /api/negotiate/compromise` | Single-clause compromise re-draft |
| `POST /api/negotiate/save-step` | Persist negotiated draft + version |
| `GET /api/documents/:id` | Load document, redlines, history |
| `POST /api/documents/export` | Export PDF / DOCX |

---

### Feature 4.5: Cookie Scanner

**A. Objective & Overview**

Audits a public website for cookie and consent compliance: crawls pages, detects cookies and tracking technologies, analyses consent banner behaviour, and evaluates alignment with major privacy regulations. Supports Lite / Medium / Deep / Enterprise depths; results can be exported as PDF or shared by email.

**B. High-Level Architecture**

*[Diagram placeholder]*

**C. User Flow**

1. User enters a URL, selects scan depth, and starts the scan.
2. System queues the job and streams progress.
3. Scanner discovers pages, collects cookies (including accept/reject consent flows), classifies them, and evaluates compliance.
4. Results are saved and shown in the UI; user can download PDF or email the report.

**D. Key APIs**

| API | Purpose |
| :--- | :--- |
| `POST /api/vulnerabilities/scan-cookie` | Start cookie compliance scan |
| `GET /api/jobs/sse` | Live scan progress |
| `POST /api/vulnerabilities/scan-cookie/report` | Generate PDF report |
| `POST /api/reports/share-email` | Email the report |

---

### Feature 4.6: Vulnerability Scanner

**A. Objective & Overview**

Passive security assessment of a public website: HTTP security headers, HTTPS configuration, cookie security attributes, and related best practices. Produces a scored report with risk level, remediation guidance, and an AI executive summary; exportable as PDF.

**B. High-Level Architecture**

*[Diagram placeholder]*

**C. User Flow**

1. User enters a URL and starts the scan.
2. System queues the job and streams progress.
3. Scanner evaluates security controls, scores risk, and generates an AI executive summary.
4. Results appear in the UI; user can download the PDF report.

**D. Key APIs**

| API | Purpose |
| :--- | :--- |
| `POST /api/vulnerabilities/scan-vulnerability` | Start vulnerability scan |
| `GET /api/jobs/sse` | Live scan progress |
| `POST /api/vulnerabilities/scan-vulnerability/report` | Generate PDF report |

---

### Feature 4.7: DPA Review

**A. Objective & Overview**

Reviews uploaded Data Processing Agreements against GDPR Article 28 and related privacy requirements. Identifies gaps, scores compliance and risk, and produces recommendations, suggested redlines, and vendor follow-up questions. Report can be downloaded as PDF.

**B. High-Level Architecture**

*[Diagram placeholder]*

**C. User Flow**

1. User uploads a DPA (PDF / DOCX / TXT) and starts the review.
2. System queues the job, extracts text, and runs AI compliance analysis.
3. Structured findings stream to the UI; user can export PDF.

**D. Key APIs**

| API | Purpose |
| :--- | :--- |
| `POST /api/dpa/review` | Upload and start DPA review |
| `GET /api/jobs/sse` | Live review progress |

---

### Feature 4.8: Vendor Review

**A. Objective & Overview**

Assesses third-party vendors from uploaded documents and/or a vendor website. Produces an AI-assisted risk profile covering privacy, security, compliance, contractual obligations, certifications, and overall posture — useful before onboarding.

**B. High-Level Architecture**

*[Diagram placeholder]*

**C. User Flow**

1. User uploads vendor documents and/or enters a vendor URL, then starts the review.
2. System collects document and website context and runs AI assessment.
3. Risk score, findings, and recommendations stream to the UI.

**D. Key APIs**

| API | Purpose |
| :--- | :--- |
| `POST /api/vendor-review` | Start vendor review (documents and/or URL) |
| `GET /api/jobs/sse` | Live review progress |

---

### Feature 4.9: AI Ethics Score

**A. Objective & Overview**

Evaluates responsible AI practices from uploaded governance documents and/or a company website. Covers governance, transparency, fairness, accountability, privacy, security, and regulatory alignment. Delivers an overall ethics score, risks, and improvement recommendations.

**B. High-Level Architecture**

*[Diagram placeholder]*

**C. User Flow**

1. User uploads AI governance documents and/or enters a company URL, then starts the assessment.
2. System collects document and website context and runs the ethics assessment.
3. Score, findings, and recommendations stream to the UI.

**D. Key APIs**

| API | Purpose |
| :--- | :--- |
| `POST /api/ai-ethics` | Start AI ethics assessment (documents and/or URL) |
| `GET /api/jobs/sse` | Live assessment progress |

---

## 5. Security, Logging & Non-Functional Requirements

| Area | Approach |
| :--- | :--- |
| **Authentication** | JWT login; passwords hashed; users require admin approval before access |
| **Authorization** | Role-based access (User / Admin) |
| **Tenant isolation** | Database-level isolation so one user’s data is not visible to another |
| **Encryption** | Document content encrypted at rest |
| **Audit trail** | Key actions (share, export, delete, etc.) recorded for compliance |
| **Monitoring** | Structured logging; optional Sentry for errors and performance |
| **Long-running work** | Background jobs with live progress in the browser; polling fallback if the live connection drops |
| **Scale note** | Designed for a single application instance today; multi-instance scale would need an external job queue |

---

## 6. Setup & Local Development

**Prerequisites:** Node.js 20+, PostgreSQL, Google Cloud / Gemini credentials (and optional OpenRouter key).

**Core environment variables:** `DATABASE_URL`, `ENCRYPTION_KEY`, `GOOGLE_CLOUD_PROJECT`, `JWT_SECRET` (plus optional SMTP, Sentry, and frontend API URL for local use).

**Commands**

| Command | Purpose |
| :--- | :--- |
| `npm ci` | Install dependencies |
| `npm run setup-db` | Create schema and seed data |
| `npm run dev` | Run locally (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` / `npm run test` | Type-check and tests |

---

*randtrust — Product Documentation · Version 1.0*
