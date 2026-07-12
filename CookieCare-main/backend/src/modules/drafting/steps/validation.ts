import { DraftState, ValidationIssue } from '../models/draft-state';
import { builderAuditPrompt, systemInstruction } from '../prompts/validation-template';
import { OpenRouterClient } from '../providers/openrouter-provider';
import { LLM_VALIDATION_SCHEMA, LLMValidationResponse } from '../schemas/validation-schema';

/**
 * Pure function pipeline step for contract auditing.
 * Combines programmatic rules with structured semantic analysis.
 */
export const validationStep = async (
  state: DraftState,
  clientInstance?: OpenRouterClient
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
    state.context.documentSkeleton.forEach((heading) => {
      // Simple, strict substring check. Can be upgraded to case-insensitive regex if needed.
      if (!documentText.includes(heading)) {
        issues.push({
          type: 'omission',
          severity: 'critical',
          description: `Compulsory structural header matching '${heading}' is entirely missing from the document output.`,
          targetSection: heading
        });
      }
    });
  }

  // 2. Unresolved Placeholder Scan
  // Scan for common token styles like [● DATE], [Insert Name], or template brackets
  const placeholderRegex = /\[●.*?\]|\[Insert.*?\]|__+/gi;
  let match;
  while ((match = placeholderRegex.exec(documentText)) !== null) {
    issues.push({
      type: 'formatting',
      severity: 'warning',
      description: `Unresolved structural placeholder token remaining at index location ${match.index}: "${match[0]}"`,
    });
  }

  // ==========================================
  // PHASE 2: LLM SEMANTIC COMPLIANCE AUDIT
  // ==========================================
  
  // Only proceed to LLM validation if we have a client instance or env setup
  const routerClient = clientInstance ?? new OpenRouterClient({
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    model: process.env.OPENROUTER_MODEL
  });



  const auditPrompt = builderAuditPrompt(state)

  try {
    // Invoke your structured response wrapper
    const llmResult = await routerClient.getJsonCompletion<LLMValidationResponse>(
      auditPrompt.trim(),
      systemInstruction.trim(),
      LLM_VALIDATION_SCHEMA
    );

    // Merge LLM discovered discrepancies into our core checklist tracker
    if (llmResult && Array.isArray(llmResult.issues)) {
      issues.push(...llmResult.issues);
    }

  } catch (error) {
    console.error('Non-blocking validation warning: Semantic audit engine failed.', error);
    // Append a warning issue instead of crashing the worker queue completely
    issues.push({
      type: 'formatting',
      severity: 'warning',
      description: `Semantic analysis step partially timed out or failed to parse: ${(error as Error).message}`
    });
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
      criticalCount: issues.filter(i => i.severity === 'critical').length
    }
  };
};