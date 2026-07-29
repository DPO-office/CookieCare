import { DraftState, ValidationIssue } from '../models/draft-state';
import { builderAuditPrompt, systemInstruction } from '../prompts/validation-template';
import { LLM_VALIDATION_SCHEMA, LLMValidationResponse } from '../schemas/validation-schema';
import { LLMTask } from "../config/model-specs.js";
import { LLMProvider } from "../config/model-specs.js";
import { executeCompletion, executeJsonCompletion } from "../llm/index.js";


/**
 * Pure function pipeline step for contract auditing.
 * Combines programmatic rules with structured semantic analysis.
 */
export const validationStep = async (
  state: DraftState,
  provider:LLMProvider = LLMProvider.GEMINI
): Promise<DraftState> => {
  if (!state.draft || !state.draft.formattedDocument) {
    throw new Error('Validation Step Aborted: No generated draft content available to validate.');
  }

  const documentText = state.draft.formattedDocument;
  const issues: ValidationIssue[] = [];

  // ==========================================
  // PHASE 1: DETERMINISTIC PROGRAMMATIC CHECKS
  // ==========================================

  // 1. Structural Checklist Validation
  // Ensure the LLM didn't accidentally delete or skip a core skeleton chapter
  if (state.context?.documentSkeleton) {
    const normalizedDoc = documentText.toLowerCase();
    state.context.documentSkeleton.forEach((heading) => {
      // QUALITY_QUICKWIN: previous strict includes(heading) failed on ALL-CAPS headers
      // if (!documentText.includes(heading)) {
      if (!normalizedDoc.includes(heading.toLowerCase())) {
        issues.push({
          type: 'omission',
          severity: 'critical',
          description: `Compulsory structural header matching '${heading}' is entirely missing from the document output.`,
          targetSection: heading
        });
      }
    });
  }

  // 2. Completeness Check
  // generation.ts already retries with continuation passes when the model runs out of output
  // space; if the flag survives that, the document genuinely ends mid-way. Reported as a
  // warning rather than a critical: a further full regeneration would hit the same ceiling,
  // so the useful outcome is surfacing it (missing skeleton headers above stay critical).
  if (state.metadata?.generationParameters?.outputTruncated) {
    issues.push({
      type: 'omission',
      severity: 'warning',
      description:
        'Document generation stopped at the model output limit and could not be completed automatically. The closing provisions may be missing.'
    });
  }

  // 3. Unresolved Placeholder Scan
  // The system prompt instructs the model to use blank underlines (never [● NAME]/[● TITLE])
  // in signature blocks. This scan is the safety net: if a signature placeholder still slips
  // through it is flagged CRITICAL so the refinement loop regenerates it (fix-at-source, no
  // silent regex patching). Other [●] tokens (e.g. a missing date) stay as warnings.
  // Blank underlines (__+) are intentional signature fields and are NOT flagged.
  // QUALITY_QUICKWIN: previous also flagged __+ underlines as warnings
  // const placeholderRegex = /\[●.*?\]|\[Insert.*?\]|__+/gi;
  const placeholderRegex = /\[●.*?\]|\[Insert.*?\]/gi;
  let match;
  while ((match = placeholderRegex.exec(documentText)) !== null) {
    const token = match[0];
    const isSignaturePlaceholder = /name|title/i.test(token);
    issues.push({
      type: 'formatting',
      // Signature tokens are critical (regen fixes); other [●] stay warnings
      severity: isSignaturePlaceholder ? 'critical' : 'warning',
      description: `Unresolved structural placeholder token remaining at index location ${match.index}: "${token}"`,
    });
  }

  // ==========================================
  // PHASE 2: LLM SEMANTIC COMPLIANCE AUDIT (GATED)
  // ==========================================
  //
  // LATENCY: the semantic LLM audit is a full extra round-trip (~10-15s). We now only
  // spend it when it actually adds value:
  //   - Skip it when deterministic checks already found a critical — we are going to
  //     regenerate anyway, so paying for a semantic pass is wasted time.
  //   - Skip it on refinement passes (version > 1). Those are targeted fixes; the
  //     deterministic checks are enough to confirm the fix landed.
  //   - Run it on the first draft (version <= 1) when deterministic checks are clean,
  //     which is exactly where a semantic safety net protects legal quality.
  //
  // To restore always-on behavior, set `shouldRunLlmAudit = true`.
  const deterministicCriticalCount = issues.filter((i) => i.severity === 'critical').length;
  const isFirstDraft = (state.draft?.version ?? 1) <= 1;
  const shouldRunLlmAudit = deterministicCriticalCount === 0 && isFirstDraft;

  let llmAuditRan = false;
  if (shouldRunLlmAudit) {
    const auditPrompt = builderAuditPrompt(state)

    try {
      // Invoke your structured response wrapper
      const llmResult = await executeJsonCompletion<LLMValidationResponse>(
        auditPrompt.trim(),
        systemInstruction.trim(),
        // LATENCY_QUICKWIN: previous — restore STRUCTURAL_JSON if validation misses criticals or over-triggers regen
        // LLM_VALIDATION_SCHEMA,LLMTask.STRUCTURAL_JSON,provider
        LLM_VALIDATION_SCHEMA,LLMTask.STRUCTURAL_JSON_LITE,provider
      );

      // Merge LLM discovered discrepancies into our core checklist tracker
      if (llmResult && Array.isArray(llmResult.issues)) {
        issues.push(...llmResult.issues);
      }
      llmAuditRan = true;

    } catch (error) {
      console.error('Non-blocking validation warning: Semantic audit engine failed.', error);
      // Append a warning issue instead of crashing the worker queue completely
      issues.push({
        type: 'formatting',
        severity: 'warning',
        description: `Semantic analysis step partially timed out or failed to parse: ${(error as Error).message}`
      });
    }
  } else {
    console.log(
      `[Validation] Skipped LLM semantic audit (deterministicCriticals=${deterministicCriticalCount}, isFirstDraft=${isFirstDraft}).`
    );
  }

  // ==========================================
  // PHASE 3: FINAL STATE MUTATION MATRIX
  // ==========================================
  
  // The contract is marked valid ONLY if there are zero 'critical' severity alerts mapping
  const isValid = !issues.some((issue) => issue.severity === 'critical');

  return {
    ...state,
    validation: {
      isValid,
      issues
    },
    metadata: {
      ...state.metadata,
      validatedAt: new Date().toISOString(),
      totalIssuesFound: issues.length,
      criticalCount: issues.filter(i => i.severity === 'critical').length,
      llmAuditRan
    }
  };
};