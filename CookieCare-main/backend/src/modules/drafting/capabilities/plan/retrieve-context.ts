import type { DraftState } from "../../models/draft-state.js";
import { pool } from "../../../../config/database.js";
import { PlaybookRetriever } from "../../retrieval/PlaybookRetriever.js";
import { TemplateRetriever } from "../../retrieval/TemplateRetriever.js";
import { ClauseRetriever } from "../../retrieval/ClauseRetriever.js";

/**
 * Retrieval step: load playbook rules, baseline template, and reference clauses.
 * Exact asset IDs from the request are authoritative; misses are logged, not invented.
 */
export async function retrievalStep(state: DraftState): Promise<DraftState> {
  if (!state.requirements) {
    throw new Error("Cannot execute retrieval step: state.requirements is null");
  }

  const requirements = state.requirements;
  const playbookRetriever = new PlaybookRetriever(pool);
  const templateRetriever = new TemplateRetriever(pool);
  const clauseRetriever = new ClauseRetriever(pool);

  const requestedTemplateId =
    state.request.templateId?.trim() ||
    state.request.vaultDocumentId?.trim() ||
    null;
  const requestedPlaybookId = state.request.playbookId?.trim() || null;
  const requestedClauseIds = state.request.clauseIds ?? [];

  const [playbookResult, templateResult] = await Promise.all([
    playbookRetriever.retrieveRules(requirements, state),
    templateRetriever.retrieveTemplate(requirements, state),
  ]);

  const playbookTopics = playbookResult.rules.map((r) => r.topic);
  const clauseResult = await clauseRetriever.retrieveClauses(
    requirements,
    playbookTopics,
    state.organizationId,
    requestedClauseIds
  );

  const misses: NonNullable<DraftState["retrieval"]["misses"]> = [];
  if (playbookResult.miss) {
    misses.push({
      asset: "playbook",
      id: playbookResult.miss.id,
      reason: playbookResult.miss.reason,
    });
  }
  if (requestedTemplateId && !templateResult.content) {
    misses.push({
      asset: "template",
      id: requestedTemplateId,
      reason: "template_id_not_resolved",
    });
  }
  if (requestedClauseIds.length > 0) {
    const foundIds = new Set(clauseResult.clauses.map((c) => c.id));
    for (const id of requestedClauseIds) {
      if (!foundIds.has(id)) {
        misses.push({
          asset: "clause",
          id,
          reason: "clause_id_not_found",
        });
      }
    }
  }
  if (clauseResult.fallbackBlocked) {
    misses.push({
      asset: "clause",
      id: "generic_fallback",
      reason: "generic_fallback_blocked",
    });
  }
  if (clauseResult.source === "hardcoded_fallback") {
    console.warn(
      `[Retrieval] WARNING: generic_fallback clauses in use — not company library`
    );
  }

  const resolvedTemplateId =
    templateResult.content && requestedTemplateId ? requestedTemplateId : null;

  console.log(
    `[Retrieval] templateSource=${templateResult.source} clauseSource=${clauseResult.source} playbookSource=${playbookResult.source} playbookRules=${playbookResult.rules.length} clauses=${clauseResult.clauses.length} misses=${misses.length}`
  );

  return {
    ...state,
    retrieval: {
      matchedTemplate: templateResult.content,
      applicablePlaybookRules: playbookResult.rules,
      fallbackClauses: clauseResult.clauses,
      historicalReferences: [],
      templateSource: templateResult.source,
      clauseSource: clauseResult.source,
      templateId: resolvedTemplateId,
      playbookId: playbookResult.playbookId,
      misses: misses.length > 0 ? misses : undefined,
    },
    metadata: {
      ...state.metadata,
      retrievedAt: new Date().toISOString(),
      retrieval: {
        templateSource: templateResult.source,
        clauseSource: clauseResult.source,
        playbookSource: playbookResult.source,
        playbookRuleCount: playbookResult.rules.length,
        clauseCount: clauseResult.clauses.length,
        vaultDocumentId: state.request.vaultDocumentId ?? null,
        templateId: resolvedTemplateId,
        playbookId: playbookResult.playbookId,
        clauseIds: requestedClauseIds,
        misses,
      },
    },
  };
}

/** PLAN capability — org-scoped retrieval of playbook, template, and clauses. */
export async function retrieveContext(state: DraftState): Promise<DraftState> {
  return retrievalStep(state);
}
