import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { AgentOrchestrator } from "../agents/legalAgent.js";
import {
  executeCompletion,
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../llm/index.js";
import { saveStep } from "../modules/drafting/capabilities/persist/save.js";
import { pool } from "../config/database.js";
import { withTransaction } from "../utils/dbUtils.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import crypto from "crypto";
import { evaluateFullDocument } from "../utils/negotiateChunker.js";
import { PlaybookRetriever } from "../modules/drafting/retrieval/PlaybookRetriever.js";
import { config } from "../config/index.js";
import { runShadowEvaluation } from "../modules/negotiate/v2/shadow.js";
import type { PoolClient } from "pg";
import {
  ensureNegotiationTables,
  findActiveSession,
  loadSessionFindings,
  createSession,
  resolveOwnedFinding,
  markFindingStatus,
  advanceSessionVersion,
  saveFindingContext,
  saveFindingStrategy,
  saveFindingDraft,
  hasContaminatedFindings,
  type NegotiationMarkupInput,
} from "../services/negotiationSession.js";

/**
 * Canonical document write-authorization check, matching the creator-only
 * pattern used by every other document mutation in the app (see
 * controllers/documents.ts: updateDocument, deleteDocument, createRedline,
 * acceptRedline, rejectRedline). Shared recipients (files.shared_with) get
 * read access elsewhere (getDocumentById) but NOT edit/redline access —
 * Negotiate is a redlining flow, so it follows the redline endpoints' rule,
 * not the read endpoints' broader one.
 *
 * Must be called inside a withTransaction(client) so RLS session vars are set;
 * the explicit creator_id check below is the authoritative guard regardless
 * (see Phase 1 report — the app's DB role owns these tables, so RLS alone
 * cannot be relied on).
 *
 * Returns the row (for reuse — avoids a second query) or null when the
 * document doesn't exist OR the caller doesn't own it. Callers must treat
 * both cases identically (404) so existence isn't leaked.
 */
async function loadOwnedDocumentForWrite(
  client: PoolClient,
  documentId: string,
  forUpdate = false
): Promise<{ id: string; title: string; type: string; content: string; is_encrypted: boolean; redlines: any } | null> {
  const { rows } = await client.query(
    `SELECT id, title, type, content, is_encrypted, redlines FROM files
     WHERE id = $1 AND creator_id = current_setting('app.current_user_id', true)${
       forUpdate ? " FOR UPDATE" : ""
     }`,
    [documentId]
  );
  return rows.length > 0 ? rows[0] : null;
}

const router = Router();
const orchestrator = new AgentOrchestrator();

/**
 * Server-side invariant enforcement for POST /negotiate/strategy output.
 * The backend does not trust the LLM's own attribution of source/basis or
 * its confidence value — it enforces what must be true given whether a real
 * playbookRule was actually resolved in /context, regardless of what the
 * model returned:
 *  • no playbookRule  → response must not claim "playbook" (clamp to "ai")
 *  • a playbookRule WAS found and passed to the prompt → response must not
 *    claim "ai" (the system prompt already instructs the model to align
 *    Preferred with the playbook and set source="playbook" for all three
 *    tiers when one is present; this just enforces that instruction instead
 *    of trusting the model followed it).
 *  • confidence must be a finite number clamped to [0, 1].
 * Exported as a pure function (no I/O) so it can be unit-tested without a
 * live LLM call — see test/negotiate-security.test.ts.
 */
export function enforceStrategyInvariants(raw: any, hasPlaybook: boolean): any {
  const enforced = { ...raw };
  const forcedSource: "ai" | "playbook" = hasPlaybook ? "playbook" : "ai";
  enforced.basisSource = forcedSource;
  for (const tier of ["preferred", "balanced", "fallback"] as const) {
    if (enforced[tier] && typeof enforced[tier] === "object") {
      enforced[tier] = { ...enforced[tier], source: forcedSource };
    }
  }
  const rawConfidence = Number(enforced.confidence);
  enforced.confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence))
    : 0;
  return enforced;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Collapse whitespace for fuzzy text matching */
function norm(t: string): string {
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Returns true when two text spans share enough overlap to be considered the
 * same clause (one is a substring of the other after normalisation).
 */
function textsOverlap(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  // Use the shorter string as the needle
  return na.length <= nb.length ? nb.includes(na) : na.includes(nb);
}

/**
 * Extract ±500 chars of plain text around charOffset (or indexOf fallback).
 * Never throws — returns empty string on any failure.
 */
function extractSurroundingContext(
  documentText: string,
  original: string,
  charOffset?: number
): string {
  try {
    const WINDOW = 500;
    const idx =
      typeof charOffset === "number" && charOffset >= 0
        ? charOffset
        : documentText.indexOf(original);
    if (idx === -1) return "";
    const start = Math.max(0, idx - WINDOW);
    const end = Math.min(documentText.length, idx + original.length + WINDOW);
    return documentText.slice(start, end);
  } catch {
    return "";
  }
}

// ── Phase 2: Negotiation Context Assembly ────────────────────────────────────
/**
 * Deterministically assembles context for a selected clause from all
 * available sources (analysis jobs, compare jobs, playbook rules, redlines).
 * No LLM calls. Missing sources are omitted, never fabricated.
 *
 * POST /api/negotiate/context
 * Body: {
 *   documentId: string,
 *   original: string,       — verbatim clause text
 *   clauseId: string,
 *   clauseType?: string,    — taxonomy label (e.g. "indemnity")
 *   charOffset?: number,
 *   userInstruction?: string
 * }
 */
router.post("/context", authenticateToken, async (req, res) => {
  const {
    documentId,
    original,
    clauseId,
    clauseType = "",
    charOffset,
    userInstruction = "",
    playbookId,
  } = req.body;

  if (!documentId || !original || !clauseId) {
    return res.status(400).json({ error: "documentId, original and clauseId are required." });
  }

  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    // ── 0. Authorize BEFORE reading any document content or prior redlines ──
    // Same creator-only rule as loadOwnedDocumentForWrite — /context feeds a
    // redline draft, so it follows the redline endpoints' access rule, not
    // the broader shared_with read rule. 404 either way (missing vs.
    // unauthorized) so a probing request can't distinguish the two.
    const doc = await withTransaction(userId, userRole, (client) =>
      loadOwnedDocumentForWrite(client, documentId)
    );
    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }

    // ── 1. Document text (for surrounding context extraction) ───────────────
    const documentText = doc.is_encrypted ? decrypt(doc.content) : doc.content;
    const surroundingContext = extractSurroundingContext(documentText, original, charOffset);

    // ── 2. Analysis finding ─────────────────────────────────────────────────
    // Scoped to THIS documentId, not just this user — a job's payload records
    // which document(s) it actually ran against (analysis_pac: documentIds[],
    // document_analysis: fileIds[]). Without this, any of the user's other
    // recent analyses could leak into an unrelated document's negotiation
    // context purely because the clause text happened to look similar.
    let analysisFinding: any = undefined;
    try {
      const { rows } = await pool.query(
        `SELECT result FROM jobs
         WHERE user_id = $1
           AND type IN ('document_analysis', 'analysis_pac')
           AND status = 'completed'
           AND result IS NOT NULL
           AND (
             payload->'documentIds' @> $2::jsonb
             OR payload->'fileIds' @> $2::jsonb
           )
         ORDER BY created_at DESC
         LIMIT 5`,
        [userId, JSON.stringify([documentId])]
      );

      outer: for (const row of rows) {
        const result = typeof row.result === "string" ? JSON.parse(row.result) : row.result;
        // PAC path: result.findings[]  |  legacy path: result.findings[] or result.risks[]
        const findings: any[] = result?.findings ?? result?.risks ?? [];
        for (const f of findings) {
          const clauseText: string = f.clauseText ?? f.clause ?? f.sourceExcerpt ?? "";
          if (clauseText && textsOverlap(original, clauseText)) {
            analysisFinding = {
              severity: f.severity ?? "medium",
              issue: f.issue ?? f.description ?? "",
              recommendation: f.recommendation ?? f.actionableInsight ?? "",
              fallbackPosition: f.fallbackPosition ?? undefined,
            };
            break outer;
          }
          // Secondary: category match when clause text unavailable
          const cat: string = f.category ?? f.risk_level ?? "";
          if (clauseType && cat && norm(cat).includes(norm(clauseType))) {
            analysisFinding = {
              severity: f.severity ?? "medium",
              issue: f.issue ?? f.description ?? "",
              recommendation: f.recommendation ?? f.actionableInsight ?? "",
              fallbackPosition: f.fallbackPosition ?? undefined,
            };
            break outer;
          }
        }
      }
    } catch { /* non-fatal */ }

    // ── 3. Compare finding — INTENTIONALLY DISABLED ─────────────────────────
    // contract_comparison jobs store only the two uploaded file buffers
    // (original.fileBufferBase64 / revised.fileBufferBase64) — there is no
    // documentId/fileId anywhere in the job payload or result linking a
    // comparison back to a Vault document. The previous code matched by
    // clause-text similarity across the user's last 3 comparison jobs
    // regardless of which documents they involved, which could attribute
    // Document A's comparison findings to Document B. Per Phase 1 scope: if a
    // job can't be reliably tied to documentId, don't use it as context
    // rather than guessing. Re-enable only if/when contract_comparison starts
    // recording a real document reference (Phase 2+).
    const compareFinding: any = undefined;

    // ── 4. Playbook rule ────────────────────────────────────────────────────
    let playbookRule: any = undefined;
    try {
      if (playbookId && typeof playbookId === "string" && playbookId.trim()) {
        // User selected a specific Vault AI Rulebook — resolve it by ID first.
        const retriever = new PlaybookRetriever(pool);
        const lookupResult = await retriever.retrieveRules(
          { contractType: clauseType || "General" } as any,
          {
            request: { playbookId: playbookId.trim(), payloadFields: {}, intent: "REFINEMENT" },
            organizationId: null,
          } as any,
          userId
        );

        if (lookupResult.rules.length > 0) {
          // Find the rule that best matches this clause by topic or trigger.
          // IMPORTANT: do NOT fall back to rules[0] — attaching an unrelated
          // rule produces false playbook attribution on /strategy.
          const normOrig = norm(original);
          const matched = lookupResult.rules.find((r: any) => {
            const topicMatch = clauseType && norm(r.topic ?? "").includes(norm(clauseType));
            const contentMatch = normOrig.includes(norm(r.topic ?? ""));
            return topicMatch || contentMatch;
          }) ?? null; // null = no genuine match found

          if (matched) {
            playbookRule = {
              topic: matched.topic,
              standardPosition: matched.standardPosition,
              fallbackPositions: Array.isArray(matched.fallbackPositions) ? matched.fallbackPositions : [],
              walkAwayCondition: matched.walkAwayCondition,
            };
            console.log(
              `[negotiate/context] Resolved playbook ID=${playbookId} source=${lookupResult.source} ` +
              `matched topic="${matched.topic}"`
            );
          } else {
            // Playbook was found but none of its rules cover this clause type.
            // Leave playbookRule undefined so /strategy uses generic AI mode.
            console.log(
              `[negotiate/context] Playbook ID=${playbookId} has ${lookupResult.rules.length} rule(s) ` +
              `but none matched clauseType="${clauseType}" — leaving playbookRule unset.`
            );
          }
        } else {
          console.warn(
            `[negotiate/context] Playbook ID ${playbookId} resolved 0 rules — ` +
            `falling back to clause-type query.`
          );
        }
      }

      // If no playbookId was provided (or ID resolution returned nothing),
      // fall back to the existing clause-type keyword/trigger pattern query.
      if (!playbookRule) {
        // Match by trigger_patterns (keyword array) OR topic similarity
        const { rows } = await pool.query(
          `SELECT topic, standard_position, fallback_positions, walk_away_condition, trigger_patterns
           FROM playbook_rules
           WHERE contract_type IN ('General', $1)
           ORDER BY contract_type DESC
           LIMIT 20`,
          [clauseType || "General"]
        );

        const normOriginal = norm(original);
        for (const row of rows) {
          const patterns: string[] = Array.isArray(row.trigger_patterns)
            ? row.trigger_patterns
            : [];
          const matched = patterns.some((p: string) => normOriginal.includes(norm(p)));
          const topicMatch = clauseType && norm(row.topic ?? "").includes(norm(clauseType));

          if (matched || topicMatch) {
            playbookRule = {
              topic: row.topic,
              standardPosition: row.standard_position,
              fallbackPositions: Array.isArray(row.fallback_positions)
                ? row.fallback_positions
                : [],
              walkAwayCondition: row.walk_away_condition,
            };
            break;
          }
        }
      }
    } catch { /* non-fatal */ }

    // ── 5. Prior redlines ───────────────────────────────────────────────────
    // Reuses the row already fetched (and ownership-checked) in step 0
    // instead of a second, separately-scoped query.
    let priorRedlines: any[] | undefined = undefined;
    try {
      const raw = doc.redlines;
      const all: any[] = Array.isArray(raw)
        ? raw
        : typeof raw === "string"
        ? JSON.parse(raw)
        : [];
      const matching = all.filter(
        (r: any) => r.originalText && textsOverlap(original, r.originalText)
      );
      if (matching.length > 0) {
        priorRedlines = matching.map((r: any) => ({
          proposedText: r.proposedText ?? "",
          comment: r.comment ?? "",
          status: r.status ?? "pending",
        }));
      }
    } catch { /* non-fatal */ }

    // ── Assemble and return ─────────────────────────────────────────────────
    const context = {
      clauseId,
      original,
      surroundingContext,
      userInstruction,
      ...(analysisFinding ? { analysisFinding } : {}),
      ...(compareFinding ? { compareFinding } : {}),
      ...(playbookRule ? { playbookRule } : {}),
      ...(priorRedlines ? { priorRedlines } : {}),
    };

    console.log(
      `[negotiate/context] Assembled for clause "${clauseId}" — ` +
        `analysis=${!!analysisFinding} compare=${!!compareFinding} ` +
        `playbook=${!!playbookRule} redlines=${priorRedlines?.length ?? 0} ` +
        `playbookId=${playbookId ?? "none"}`
    );

    // ── Phase 2: best-effort cache the context on the finding row ──────────
    // Soft-fail: this is a re-derivable cache (a future resume can simply
    // re-fetch context), not durable user action data like Accept/Reject —
    // so a persistence hiccup here must not break the LLM response the user
    // is waiting on.
    try {
      await withTransaction(userId, userRole, async (client) => {
        const finding = await resolveOwnedFinding(client, { userId, documentId, clauseId });
        if (finding) await saveFindingContext(client, finding.id, context);
      });
    } catch (persistErr: any) {
      console.warn(`[negotiate/context] non-fatal: failed to cache context on finding: ${persistErr.message}`);
    }

    return res.json({ context });
  } catch (err: any) {
    console.error("[negotiate/context] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Existing: Full Negotiation Run ──────────────────────────────────────────
router.post("/run", authenticateToken, async (req, res) => {
  try {
    const { documentContent, playbooks, instructions } = req.body;
    
    if (!documentContent) {
      return res.status(400).json({ error: "Document content is required for a negotiation run." });
    }

    const result = await orchestrator.runNegotiation(
      documentContent, 
      playbooks || [], 
      instructions || ""
    );
    res.json({ redlines: result });
  } catch (err: any) {
    console.error("[negotiate/run] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Multi-Agent Clause Evaluator (Phase 1: full-document, broad taxonomy) ────
/**
 * Shared evaluation logic used by both POST /evaluate (legacy, content-only)
 * and POST /session/resolve (Phase 2, persists the result as a session).
 * Extracted verbatim from the original /evaluate handler — behavior is
 * unchanged for existing callers.
 */
async function runDocumentEvaluation(
  content: string,
  documentTitle: string,
  documentType: string,
  playbookId: string | undefined,
  userId: string
): Promise<{ markups: Awaited<ReturnType<typeof evaluateFullDocument>>; isLargeDocument: boolean }> {
  const isLargeDocument = content.length > 14_000;

  let playbookRules: import("../utils/negotiateChunker.js").PlaybookRuleInput[] = [];

  if (playbookId && typeof playbookId === "string" && playbookId.trim()) {
    try {
      const retriever = new PlaybookRetriever(pool);
      const lookupResult = await retriever.retrieveRules(
        { contractType: documentType || "General" } as any,
        {
          request: { playbookId: playbookId.trim(), payloadFields: {}, intent: "ANALYSIS" },
          organizationId: null,
        } as any,
        userId
      );

      if (lookupResult.source === "exact_id" && lookupResult.rules.length > 0) {
        playbookRules = lookupResult.rules.map((r: any) => ({
          topic:             String(r.topic ?? ""),
          standardPosition:  String(r.standardPosition ?? ""),
          fallbackPositions: Array.isArray(r.fallbackPositions) ? r.fallbackPositions : [],
          walkAwayCondition: String(r.walkAwayCondition ?? ""),
        }));
        console.log(
          `[negotiate/evaluate] Loaded ${playbookRules.length} playbook rule(s) ` +
          `from playbookId=${playbookId}`
        );
      } else if (lookupResult.miss) {
        console.warn(
          `[negotiate/evaluate] Playbook ID ${playbookId} not found (${lookupResult.miss.reason}). ` +
          `Evaluating without playbook context.`
        );
      } else {
        console.warn(
          `[negotiate/evaluate] Playbook ID ${playbookId} resolved via ` +
          `source=${lookupResult.source} — not using contract-type default rules for evaluate.`
        );
      }
    } catch (err: any) {
      console.warn(
        `[negotiate/evaluate] Playbook retrieval failed (non-fatal): ${err.message}. ` +
        `Evaluating without playbook context.`
      );
    }
  }

  console.log(
    `[negotiate/evaluate] Starting full-document evaluation for "${documentTitle}" — ` +
      `${content.length} chars, large=${isLargeDocument}, playbookRules=${playbookRules.length}`
  );

  const markups = await evaluateFullDocument(content, documentTitle, documentType, playbookRules);

  console.log(`[negotiate/evaluate] Completed — ${markups.length} markup(s) for "${documentTitle}" ` +
    `(${markups.filter((m: any) => m.matchedPlaybookTopic).length} playbook-grounded)`);

  return { markups, isLargeDocument };
}

router.post("/evaluate", authenticateToken, async (req, res) => {
  const {
    content,
    documentTitle = "Contract",
    documentType  = "Agreement",
    playbookId,           // optional — frontend sends the selected Vault rulebook ID
  } = req.body;

  if (!content || typeof content !== "string" || content.trim().length < 20) {
    return res.status(400).json({ error: "Document content is required for evaluation." });
  }

  const userId = req.user!.id;

  try {
    const { markups, isLargeDocument } = await runDocumentEvaluation(
      content, documentTitle, documentType, playbookId, userId
    );

    return res.json({
      data: { markups },
      ...(isLargeDocument
        ? { info: `Document was analysed in sections (${content.length} chars).` }
        : {}),
    });
  } catch (err: any) {
    console.error("[negotiate/evaluate] evaluation error:", err.message);
    // Return a structured error so the frontend can display it — do NOT silently
    // return empty markups, which previously caused the UI to show "All clear"
    // on a failed evaluation.
    return res.status(500).json({
      error: "Clause evaluation failed. Please try again.",
      detail: err.message,
    });
  }
});

// ── Phase 2: Negotiation Session Resolve (create-or-resume) ─────────────────
/**
 * POST /api/negotiate/session/resolve
 *
 * The single initialization path for opening a negotiation. Replaces the
 * previous behavior where every mount unconditionally called /evaluate.
 *
 * Body: { documentId: string, playbookId?: string, forceNew?: boolean }
 * Response: { session, findings: FindingDTO[], resumed: boolean }
 *
 * Behavior:
 *  - resumed: true  → an ACTIVE session already existed for (user, document);
 *    it is returned as-is. No LLM call is made.
 *  - resumed: false → no active session existed (or forceNew=true, used by
 *    the existing "Re-run evaluation" UI action). A fresh evaluation runs
 *    and is persisted atomically as a new session. Any prior active session
 *    is marked 'superseded', not deleted — history is preserved.
 *
 * Transaction boundaries: authorization + the resume-path read happen in one
 * short transaction. Evaluation (the slow external LLM call) deliberately
 * runs OUTSIDE any transaction — holding a DB connection/lock open for a
 * multi-second external call would be wrong. Persisting its result is a
 * second, separate, short transaction: if that persistence fails, nothing
 * is left half-created (no session row without findings, or vice versa) and
 * the client can safely retry by calling this same endpoint again, since
 * evaluation itself is stateless.
 */
router.post("/session/resolve", authenticateToken, async (req, res) => {
  const { documentId, playbookId, forceNew } = req.body;
  if (!documentId || typeof documentId !== "string") {
    return res.status(400).json({ error: "documentId is required." });
  }

  const userId = req.user!.id;
  const userRole = req.user!.role;
  const effectivePlaybookId = playbookId && typeof playbookId === "string" && playbookId.trim()
    ? playbookId.trim()
    : null;

  try {
    // ── Step 1: authorize + check for an existing active session ──────────
    const initial = await withTransaction(userId, userRole, async (client) => {
      await ensureNegotiationTables();
      const doc = await loadOwnedDocumentForWrite(client, documentId);
      if (!doc) return { kind: "not_found" as const };

      if (!forceNew) {
        const active = await findActiveSession(client, userId, documentId);
        if (active) {
          const findings = await loadSessionFindings(client, active.id);

          // ── Ciphertext contamination guard ─────────────────────────────
          // Sessions created before the /session/resolve decrypt fix may have
          // findings whose original/replacement/reasoning fields contain raw
          // LEXGCM_... ciphertext — the LLM was accidentally given encrypted
          // bytes as document text and generated "findings" from them. These
          // sessions are permanently corrupt and must never be served to the
          // client or to downstream LLM calls (/context, /strategy, /compromise).
          //
          // Fix: silently supersede the corrupt session here (identical to
          // what forceNew=true does) and fall through to a fresh evaluation
          // against correctly-decrypted plaintext. The superseded session row
          // and its corrupt findings are retained in the DB (status →
          // 'superseded') so the audit trail is intact — nothing is deleted.
          if (hasContaminatedFindings(findings)) {
            console.warn(
              `[negotiate/session/resolve] Corrupt session ${active.id} for ` +
                `doc ${documentId} contains ciphertext findings — superseding ` +
                `and triggering fresh evaluation.`
            );
            await client.query(
              `UPDATE negotiation_sessions SET status = 'superseded', updated_at = NOW()
               WHERE id = $1`,
              [active.id]
            );
            // Fall through to needs_eval — doc row is already available on the
            // outer query; return it so step 2 can use it without a re-fetch.
            return { kind: "needs_eval" as const, doc };
          }

          // ── Stale-session detection (unchanged) ─────────────────────────
          // Case 5: document was edited outside this session.
          const { rows: cntRows } = await client.query(
            `SELECT COUNT(*)::int AS cnt FROM document_versions WHERE file_id = $1`,
            [documentId]
          );
          const liveVersionCount = cntRows[0]?.cnt ?? 0;
          const stale = liveVersionCount > active.documentVersionCount;
          return { kind: "resumed" as const, session: active, findings, stale };
        }
      }
      return { kind: "needs_eval" as const, doc };
    });

    if (initial.kind === "not_found") {
      return res.status(404).json({ error: "Document not found." });
    }
    if (initial.kind === "resumed") {
      return res.json({
        session: initial.session,
        findings: initial.findings,
        resumed: true,
        stale: initial.stale,
      });
    }

    // ── Step 2: no active session — run evaluation OUTSIDE a transaction ──
    // loadOwnedDocumentForWrite returns the raw `files` row for authorization
    // purposes — its `content` is ciphertext-at-rest when is_encrypted=true
    // (true for every uploaded and drafted document). Must decrypt here,
    // same as /context does at "doc.is_encrypted ? decrypt(doc.content) :
    // doc.content" — this was previously missing, which sent raw LEXGCM_
    // ciphertext straight to the LLM as if it were contract text.
    const doc = initial.doc;
    const documentText = doc.is_encrypted ? decrypt(doc.content) : doc.content;
    const { markups } = await runDocumentEvaluation(
      documentText, doc.title, doc.type, effectivePlaybookId ?? undefined, userId
    );

    // ── Shadow: optionally run V2 in parallel (flag OFF by default). ───────
    // Fire-and-forget and fully isolated — V1's response below is unaffected
    // whether V2 succeeds, fails, or throws. No await, no effect on `markups`.
    if (config.negotiateV2Shadow) {
      void runShadowEvaluation({ documentId, documentText, v1Markups: markups })
        .catch(() => { /* isolated in runShadowEvaluation; belt-and-suspenders */ });
    }

    // ── Step 3: persist the new session + findings atomically ─────────────
    const persisted = await withTransaction(userId, userRole, async (client) => {
      // Re-check ownership — cheap defense against a race where access was
      // revoked between step 1 and now (e.g. document deleted).
      const stillOwned = await loadOwnedDocumentForWrite(client, documentId);
      if (!stillOwned) return { kind: "not_found" as const };

      const { rows: versionRows } = await client.query(
        `SELECT id, COUNT(*) OVER () AS cnt FROM document_versions WHERE file_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [documentId]
      );
      const documentVersionId = versionRows[0]?.id ?? null;
      const documentVersionCount = versionRows[0] ? Number(versionRows[0].cnt) : 0;

      const markupInputs: NegotiationMarkupInput[] = markups.map((m: any) => ({
        clauseId: m.clauseId,
        original: m.original,
        replacement: m.replacement,
        reasoning: m.reasoning,
        riskLevel: m.riskLevel,
        clauseType: m.clauseType,
        charOffset: m.charOffset,
        matchedPlaybookTopic: m.matchedPlaybookTopic,
      }));

      const result = await createSession(client, {
        userId,
        documentId,
        documentVersionId,
        documentVersionCount,
        playbookId: effectivePlaybookId,
        markups: markupInputs,
        supersedeExisting: true, // covers both forceNew and the (rare) race where one appeared since step 1
      });
      return { kind: "created" as const, ...result };
    });

    if (persisted.kind === "not_found") {
      return res.status(404).json({ error: "Document not found." });
    }
    return res.json({
      session: persisted.session,
      findings: persisted.findings,
      resumed: false,
      racedExisting: persisted.racedExisting,
    });
  } catch (err: any) {
    console.error("[negotiate/session/resolve] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Phase 2: Durable Reject ──────────────────────────────────────────────────
/**
 * POST /api/negotiate/finding/:clauseId/reject
 * Body: { documentId: string }
 *
 * Marks a finding rejected durably (previously: purely client-side array
 * filtering, lost on reload). Idempotent: rejecting an already-rejected
 * finding is a no-op success. Rejecting an already-accepted finding is a
 * 409 (no undo flow in this phase). Findings that don't belong to an active
 * session owned by this user for this document (including synthetic
 * "manual-*" clauseIds that were never persisted as findings) resolve to
 * 404 — the frontend already tolerates this by only calling this endpoint
 * for clauseIds that came from a resolved session.
 */
router.post("/finding/:clauseId/reject", authenticateToken, async (req, res) => {
  const { clauseId } = req.params;
  const { documentId } = req.body;
  if (!documentId || typeof documentId !== "string") {
    return res.status(400).json({ error: "documentId is required." });
  }

  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    const result = await withTransaction(userId, userRole, async (client) => {
      const doc = await loadOwnedDocumentForWrite(client, documentId);
      if (!doc) return { kind: "not_found" as const };

      const finding = await resolveOwnedFinding(client, { userId, documentId, clauseId, forUpdate: true });
      if (!finding) return { kind: "not_found" as const };

      if (finding.status === "rejected") return { kind: "already" as const };
      if (finding.status === "accepted") return { kind: "conflict" as const };

      await markFindingStatus(client, finding.id, "rejected");
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") return res.status(404).json({ error: "Finding not found." });
    if (result.kind === "conflict") {
      return res.status(409).json({ error: "This finding was already accepted and cannot be rejected." });
    }
    return res.json({ success: true, alreadyRejected: result.kind === "already" });
  } catch (err: any) {
    console.error("[negotiate/finding/reject] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Lumi Compromise Drafter (Phase 1/2 legacy + Phase 4 strategy-position path) ──
/**
 * POST /api/negotiate/compromise
 *
 * Legacy path  — body: { originalText, riskExplanation, userPrompt, playbookPreferred }
 * Strategy path — body: { originalText, riskExplanation, userPrompt, playbookPreferred,
 *                          strategyPosition: { tier, position, source, rationale },
 *                          analysisFinding?, compareFinding?, playbookRule? }
 *
 * When `strategyPosition` is present the prompt is steered toward that specific
 * concession-ladder position rather than the generic preferred/balanced toggle.
 * The existing legacy behaviour is fully preserved when it is absent.
 *
 * Response (legacy):  { result: string }
 * Response (strategy): { result: string, draftMeta: { tier, position, source, confidence, rationale } }
 */
router.post("/compromise", authenticateToken, async (req, res) => {
  const {
    originalText,
    riskExplanation,
    userPrompt: customPrompt,
    playbookPreferred,
    // Phase 4 strategy-position fields (all optional — legacy callers omit them)
    strategyPosition,
    analysisFinding,
    compareFinding,
    playbookRule,
    // Phase 2 (optional): when present, cache the drafted result on the finding.
    documentId,
    clauseId,
  } = req.body;

  if (!originalText || typeof originalText !== "string") {
    return res.status(400).json({ error: "originalText is required." });
  }

  // ── Determine which path we're on ────────────────────────────────────────
  const isStrategyPath =
    strategyPosition &&
    typeof strategyPosition === "object" &&
    typeof strategyPosition.position === "string" &&
    ["preferred", "balanced", "fallback"].includes(strategyPosition.tier);

  let systemPrompt: string;
  let userPrompt: string;

  if (isStrategyPath) {
    // ── Phase 4: strategy-position-aware drafting ─────────────────────────
    const { tier, position, source, rationale } = strategyPosition;
    const isPlaybookBacked = source === "playbook";

    // Build an optional context enrichment block
    const contextLines: string[] = [];
    if (analysisFinding?.issue) {
      contextLines.push(`Analysis finding: ${analysisFinding.issue}`);
      if (analysisFinding.recommendation) contextLines.push(`Recommendation: ${analysisFinding.recommendation}`);
    }
    if (compareFinding?.semanticSummary) {
      contextLines.push(`Compare finding: ${compareFinding.semanticSummary}`);
    }
    if (playbookRule?.standardPosition) {
      contextLines.push(`Company playbook position: ${playbookRule.standardPosition}`);
      if (playbookRule.walkAwayCondition) {
        contextLines.push(`Walk-away condition: ${playbookRule.walkAwayCondition}`);
      }
    }
    const contextBlock = contextLines.length > 0
      ? `\nRELEVANT CONTEXT:\n${contextLines.join("\n")}`
      : "";

    systemPrompt = `You are Lumi, a brilliant legal negotiation agent. Your objective is to draft a precise legal revision of a contract clause that implements a specific negotiation position.

NEGOTIATION POSITION TO IMPLEMENT:
Tier: ${tier.toUpperCase()} (${isPlaybookBacked ? "company playbook-backed" : "AI-suggested"})
Position: ${position}
Rationale: ${rationale}

DRAFTING RULES:
1. Implement EXACTLY the stated negotiation position — no more, no less.
2. Preserve all legal language in the original clause that is unrelated to the negotiation position.
3. Do NOT invent facts, obligations, or requirements not implied by the position.
4. ${isPlaybookBacked ? "This position is backed by the company playbook. Honour it precisely — do not soften or strengthen it." : "This is an AI-suggested position. Draft commercially reasonable language consistent with market standards."}
5. Respect any user instruction provided.

STRICT OUTPUT RULE:
- Return ONLY the final raw contractual text of the revised clause.
- Do NOT use markdown code blocks, quotation marks, preambles, or postscript notes. Begin immediately with the clause text.`;

    userPrompt = `Original clause:
"${originalText}"
${contextBlock}
${customPrompt ? `\nUser instruction: ${customPrompt}` : ""}

Draft the revised clause implementing the ${tier} position:`;

  } else {
    // ── Legacy path: unchanged behaviour ─────────────────────────────────
    systemPrompt = `You are Lumi, a brilliant legal negotiation agent. Your objective is to draft a protective, commercially viable replacement for a risky contract clause.

DRAFTING STRATEGY:
${
  playbookPreferred
    ? "Maximize client protection. Draft strong, defensive, client-favorable language that holds the line on critical exposures."
    : "Draft a balanced, market-standard compromise that mitigates risk while facilitating a fast deal sign-off."
}

STRICT OUTPUT RULE:
- Return ONLY the final raw contractual text of the replacement clause.
- Do NOT wrap your output in markdown code blocks (e.g. no \`\`\`), quotation marks, introduction/explanatory preambles, or postscript notes. Begin immediately with the clause text.`;

    userPrompt = `Original risky clause:
"${originalText}"

Risk Analysis: ${riskExplanation || "General legal risk detected."}
${customPrompt ? `Additional Instruction: ${customPrompt}` : ""}

Draft the replacement clause below:`;
  }

  try {
    console.log(
      isStrategyPath
        ? `[negotiate/compromise] Strategy-draft tier=${strategyPosition.tier} source=${strategyPosition.source}`
        : `[negotiate/compromise] Legacy draft playbookPreferred=${playbookPreferred}`
    );

    const result = await executeCompletion(
      userPrompt,
      systemPrompt,
      LLMTask.REFINEMENT,
      LLMProvider.GEMINI
    );

    const trimmed = result.trim();

    // ── Phase 2: best-effort cache — same soft-fail rationale as /context ──
    const cacheDraft = async (tier: "preferred" | "balanced" | "fallback", draftResultJson: any) => {
      if (!documentId || typeof documentId !== "string" || !clauseId || typeof clauseId !== "string") return;
      try {
        await withTransaction(req.user!.id, req.user!.role, async (client) => {
          const finding = await resolveOwnedFinding(client, { userId: req.user!.id, documentId, clauseId });
          if (finding) await saveFindingDraft(client, finding.id, tier, draftResultJson);
        });
      } catch (persistErr: any) {
        console.warn(`[negotiate/compromise] non-fatal: failed to cache draft on finding: ${persistErr.message}`);
      }
    };

    if (isStrategyPath) {
      const draftMeta = {
        tier: strategyPosition.tier,
        position: strategyPosition.position,
        source: strategyPosition.source,
        rationale: strategyPosition.rationale,
        // Confidence is passed through from the Phase 3 strategy if the
        // caller supplies it; otherwise omitted. Clamped server-side —
        // this field comes straight from the request body, not re-derived,
        // so an out-of-range or malformed value cannot pass through.
        ...(typeof strategyPosition.confidence === "number" &&
        Number.isFinite(strategyPosition.confidence)
          ? { confidence: Math.min(1, Math.max(0, strategyPosition.confidence)) }
          : {}),
      };
      const payload = { result: trimmed, draftMeta };
      await cacheDraft(strategyPosition.tier, payload);
      return res.json(payload);
    }

    return res.json({ result: trimmed });
  } catch (err: any) {
    console.error("[negotiate/compromise] AI error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── NEW: Save Negotiation Step Persistence Checkpoint ───────────────────────
/**
 * POST /api/negotiate/save-step
 * Body: {
 *   documentId: string,
 *   content: string,
 *   version: number,        — the version number this save is writing as
 *   baseVersion?: number,   — the document_versions row-count the client
 *                             last observed (optimistic-concurrency check).
 *                             Optional for backward compatibility with any
 *                             caller that predates this field — when omitted,
 *                             the staleness check is skipped (previous
 *                             behaviour), matching "preserve current
 *                             single-user save behavior."
 *   clauseId?: string,      — Phase 2: when this save is the result of
 *                             Accepting a specific finding, its clauseId.
 *                             Folds the finding's durable status transition
 *                             into the SAME transaction as the content/
 *                             version/ledger writes (per the task's explicit
 *                             "one atomic transaction" requirement for
 *                             Accept — two separate HTTP calls could not
 *                             share one DB transaction). Unknown/foreign/
 *                             synthetic ("manual-*") clauseIds are silently
 *                             ignored — the content save still proceeds
 *                             exactly as before Phase 2 for those.
 * }
 *
 * All mutations (draft_state_ledger, files, document_versions, and —  when
 * clauseId is present — negotiation_findings + negotiation_sessions) run
 * inside ONE transaction: authorize → verify concurrency → persist ledger →
 * update files → insert version → (resolve+update finding) → COMMIT. Any
 * failure rolls back everything, so these tables can never disagree because
 * only part of a save succeeded.
 */
router.post("/save-step", authenticateToken, async (req, res) => {
  const { documentId, content, version, baseVersion, clauseId } = req.body;

  if (!documentId || typeof content !== "string") {
    return res.status(400).json({ error: "documentId and content are required." });
  }
  if (
    baseVersion !== undefined &&
    (typeof baseVersion !== "number" || !Number.isInteger(baseVersion) || baseVersion < 0)
  ) {
    return res.status(400).json({ error: "baseVersion must be a non-negative integer when provided." });
  }

  const userId = req.user!.id;
  const userRole = req.user!.role;

  try {
    const result = await withTransaction(userId, userRole, async (client) => {
      // ── 1. Authorize — lock the row so a concurrent save-step for the same
      // document serializes behind this one instead of racing it. Every
      // subsequent step uses `client` (this transaction), never `pool`.
      const doc = await loadOwnedDocumentForWrite(client, documentId, true);
      if (!doc) {
        return { kind: "not_found" as const };
      }

      // ── 2. Verify concurrency/version state ────────────────────────────
      // document_versions is the project's existing version model (one row
      // per saved snapshot). The row count the client observed when it
      // started editing (baseVersion) must still match reality, or someone
      // else's save has landed in between and we must not overwrite it.
      if (baseVersion !== undefined) {
        const { rows: versionCountRows } = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM document_versions WHERE file_id = $1`,
          [documentId]
        );
        const currentVersionCount = versionCountRows[0]?.cnt ?? 0;
        if (currentVersionCount !== baseVersion) {
          return {
            kind: "conflict" as const,
            currentVersionCount,
          };
        }
      }

      // ── 2b. Phase 2: resolve + lock the finding BEFORE mutating anything,
      // so a double-click Accept is caught before the content is re-spliced
      // a second time (idempotent: already-accepted → no-op success rather
      // than re-running the save; already-rejected → conflict).
      let findingToAccept: Awaited<ReturnType<typeof resolveOwnedFinding>> = null;
      if (clauseId && typeof clauseId === "string") {
        findingToAccept = await resolveOwnedFinding(client, {
          userId, documentId, clauseId, forUpdate: true,
        });
        if (findingToAccept?.status === "accepted") {
          return { kind: "already_accepted" as const };
        }
        if (findingToAccept?.status === "rejected") {
          return { kind: "finding_conflict" as const };
        }
        // findingToAccept === null (unknown/synthetic clauseId) → proceed
        // with a normal content-only save, matching pre-Phase-2 behavior.
      }

      // ── 3. Persist draft/ledger state ──────────────────────────────────
      let state: any = null;
      const snapshotLookup = await client.query(
        `SELECT state_snapshot_json FROM draft_state_ledger WHERE document_id = $1 ORDER BY version DESC LIMIT 1`,
        [documentId]
      );

      if (snapshotLookup.rows.length > 0) {
        state = snapshotLookup.rows[0].state_snapshot_json;
      }

      if (!state) {
        state = {
          request: {
            intent: "REFINEMENT",
            payloadFields: { documentId }
          },
          requirements: null,
          retrieval: {
            matchedTemplate: null,
            applicablePlaybookRules: [],
            fallbackClauses: [],
            historicalReferences: []
          },
          context: null,
          draft: null,
          validation: null,
          riskReview: null,
          metadata: {
            generationParameters: {},
            playbookVersion: "1.0.0",
            timestamp: new Date().toISOString()
          }
        };
      }

      // Update state values for this save step
      state.draft = {
        rawOutput: content,
        formattedDocument: content,
        version: version || 1
      };
      if (!state.request) state.request = {};
      if (!state.request.payloadFields) state.request.payloadFields = {};
      state.request.payloadFields.documentId = documentId;

      const savedState = await saveStep(state, { client });

      // ── 4. Update document content ─────────────────────────────────────
      const encryptedContent = encrypt(content);

      await client.query(
        "UPDATE files SET content = $1, updated_at = NOW() WHERE id = $2",
        [encryptedContent, documentId]
      );

      // ── 5. Create document version snapshot ────────────────────────────
      const versionId = "ver_" + crypto.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, documentId, encryptedContent]
      );

      // ── 6. Phase 2: mark the finding accepted + advance session watermark,
      // in the SAME transaction as the content/version writes above.
      if (findingToAccept) {
        await markFindingStatus(client, findingToAccept.id, "accepted");
        const { rows: cntRows } = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM document_versions WHERE file_id = $1`,
          [documentId]
        );
        await advanceSessionVersion(client, findingToAccept.sessionId, versionId, cntRows[0]?.cnt ?? 0);
      }

      return { kind: "ok" as const, savedState };
    });

    if (result.kind === "not_found") {
      return res.status(404).json({ error: "Document not found." });
    }
    if (result.kind === "conflict") {
      return res.status(409).json({
        error: "This document was modified since you last loaded it. Reload and retry.",
        currentVersionCount: result.currentVersionCount,
      });
    }
    if (result.kind === "finding_conflict") {
      return res.status(409).json({ error: "This finding was already rejected and cannot be accepted." });
    }
    if (result.kind === "already_accepted") {
      // Idempotent double-click: the desired end state (accepted) already
      // holds. Do not re-splice/re-save content a second time.
      return res.json({ success: true, alreadyAccepted: true });
    }

    console.log(`[negotiate/save-step] Successfully saved V${version} for document ${documentId}`);
    return res.json({ success: true, savedState: result.savedState });
  } catch (err: any) {
    // withTransaction has already rolled back — nothing partially committed.
    console.error("[negotiate/save-step] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Phase 3: Negotiation Strategy Generator ──────────────────────────────────
/**
 * Generates a three-tier negotiation strategy (Preferred → Balanced → Fallback)
 * from an assembled NegotiationContext using a single structured LLM call.
 *
 * Rules enforced in the prompt:
 *  - If a playbookRule exists, its standardPosition drives Preferred and
 *    fallbackPositions drive Balanced/Fallback. Source = "playbook".
 *  - Otherwise all positions are AI-suggested. Source = "ai".
 *  - Positions must form a logical concession ladder (not three alternatives).
 *  - No final clause language is drafted here.
 *
 * POST /api/negotiate/strategy
 * Body: { context: NegotiationContext }
 * Response: { strategy: NegotiationStrategy }
 */
router.post("/strategy", authenticateToken, async (req, res) => {
  const { context, documentId } = req.body;

  if (!context || !context.clauseId || !context.original) {
    return res.status(400).json({ error: "context with clauseId and original is required." });
  }

  // ── Build a focused prompt that passes only the relevant context ────────────
  const {
    original,
    clauseId,
    surroundingContext = "",
    userInstruction = "",
    analysisFinding,
    compareFinding,
    playbookRule,
    priorRedlines,
  } = context;

  const hasPlaybook = !!playbookRule;

  // Compact context block — omit empty sections to keep the prompt tight
  const contextBlock = [
    `CLAUSE TEXT:\n"${original.slice(0, 800)}"`,
    surroundingContext
      ? `SURROUNDING CONTEXT (±500 chars):\n"${surroundingContext.slice(0, 600)}"`
      : null,
    analysisFinding
      ? `ANALYSIS FINDING:\nSeverity: ${analysisFinding.severity}\nIssue: ${analysisFinding.issue}\nRecommendation: ${analysisFinding.recommendation}${analysisFinding.fallbackPosition ? `\nAnalysis fallback: ${analysisFinding.fallbackPosition}` : ""}`
      : null,
    compareFinding
      ? `COMPARE FINDING:\nClassification: ${compareFinding.classification}\nSummary: ${compareFinding.semanticSummary}\nRisk: ${compareFinding.riskRationale}`
      : null,
    hasPlaybook
      ? `COMPANY PLAYBOOK RULE:\nTopic: ${playbookRule.topic}\nStandard position: ${playbookRule.standardPosition}\nFallback positions: ${playbookRule.fallbackPositions.join(" | ")}\nWalk-away condition: ${playbookRule.walkAwayCondition}`
      : null,
    priorRedlines?.length
      ? `PRIOR REDLINES (${priorRedlines.length}):\n${priorRedlines.slice(0, 3).map((r: any) => `- ${r.comment || r.proposedText}`).join("\n")}`
      : null,
    userInstruction ? `USER INSTRUCTION: ${userInstruction}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const systemPrompt = `You are Lumi, an expert commercial legal negotiation strategist.
Your task is to determine a coherent negotiation strategy for a specific contract clause.

CRITICAL RULES:
1. Preferred → Balanced → Fallback must form a logical CONCESSION LADDER — each step gives more ground than the previous. Do NOT generate three unrelated alternatives.
2. ${hasPlaybook ? "A company Playbook is present. The Preferred position MUST align with the Playbook's standardPosition. Do NOT invent a conflicting company position. Set source='playbook' for all three positions." : "No Playbook is present. Generate AI-suggested positions grounded in the clause and available context. Set source='ai' for all three positions."}
3. Do NOT draft final legal clause language. Express positions as concise negotiation stances (1–2 sentences each).
4. confidence is a float 0–1 reflecting how well the available context supports the strategy.
5. Return valid JSON only — no markdown, no preamble.`;

  const userPrompt = `${contextBlock}

Generate a negotiation strategy for clause ID "${clauseId}".`;

  const jsonSchema = {
    type: "object",
    properties: {
      preferred: {
        type: "object",
        properties: {
          position: { type: "string" },
          source: { type: "string", enum: ["playbook", "ai"] },
          rationale: { type: "string" },
        },
        required: ["position", "source", "rationale"],
      },
      balanced: {
        type: "object",
        properties: {
          position: { type: "string" },
          source: { type: "string", enum: ["playbook", "ai"] },
          rationale: { type: "string" },
        },
        required: ["position", "source", "rationale"],
      },
      fallback: {
        type: "object",
        properties: {
          position: { type: "string" },
          source: { type: "string", enum: ["playbook", "ai"] },
          rationale: { type: "string" },
        },
        required: ["position", "source", "rationale"],
      },
      strategyRationale: { type: "string" },
      confidence: { type: "number" },
      basisSource: { type: "string", enum: ["playbook", "ai"] },
    },
    required: ["preferred", "balanced", "fallback", "strategyRationale", "confidence", "basisSource"],
  };

  try {
    console.log(
      `[negotiate/strategy] Generating strategy for clause "${clauseId}" — ` +
        `playbook=${hasPlaybook} analysis=${!!analysisFinding} compare=${!!compareFinding}`
    );

    const raw = await executeJsonCompletion<any>(
      userPrompt,
      systemPrompt,
      jsonSchema,
      LLMTask.REFINEMENT,
      LLMProvider.GEMINI
    );

    // ── Guard: enforce basisSource/source/confidence invariants server-side ──
    // See enforceStrategyInvariants doc comment for the exact rules.
    const enforcedRaw = enforceStrategyInvariants(raw, hasPlaybook);

    // Attach clauseId so the client can correlate the result
    const strategy = { clauseId, ...enforcedRaw };

    console.log(
      `[negotiate/strategy] Done for "${clauseId}" — ` +
      `basis=${strategy.basisSource} confidence=${strategy.confidence} ` +
      `hasPlaybook=${hasPlaybook}`
    );

    // ── Phase 2: best-effort cache — same soft-fail rationale as /context ──
    if (documentId && typeof documentId === "string") {
      try {
        await withTransaction(req.user!.id, req.user!.role, async (client) => {
          const finding = await resolveOwnedFinding(client, { userId: req.user!.id, documentId, clauseId });
          if (finding) await saveFindingStrategy(client, finding.id, strategy);
        });
      } catch (persistErr: any) {
        console.warn(`[negotiate/strategy] non-fatal: failed to cache strategy on finding: ${persistErr.message}`);
      }
    }

    return res.json({ strategy });
  } catch (err: any) {
    console.error("[negotiate/strategy] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;