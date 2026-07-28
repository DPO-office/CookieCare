import { DraftState } from "../models/draft-state.js";
import { pool } from "../../../config/database.js";
import { PlaybookRetriever } from "../retrieval/PlaybookRetriever.js";
import { TemplateRetriever } from "../retrieval/TemplateRetriever.js";
import { ClauseRetriever } from "../retrieval/ClauseRetriever.js";

/**
 * Retrieval step: load playbook rules, baseline template, and reference clauses.
 * Generation is unchanged — this step only fills state.retrieval for context assembly.
 */
export const retrievalStep = async (state: DraftState): Promise<DraftState> => {
  if (!state.requirements) {
    throw new Error("Cannot execute retrieval step: state.requirements is null");
  }

  const requirements = state.requirements;
  const playbookRetriever = new PlaybookRetriever(pool); 
  const templateRetriever = new TemplateRetriever(pool);
  const clauseRetriever = new ClauseRetriever(pool);

  // Playbook + template are independent; clauses need playbook topics afterward.
  const [dbRules, templateResult] = await Promise.all([
    playbookRetriever.retrieveRules(requirements, state),
    templateRetriever.retrieveTemplate(requirements, state),
  ]);

  const playbookTopics = dbRules.map((r) => r.topic);
  const clauseResult = await clauseRetriever.retrieveClauses(
    requirements,
    playbookTopics,
    state.request.intent
  );

  console.log(
    `[Retrieval] templateSource=${templateResult.source} clauseSource=${clauseResult.source} playbookRules=${dbRules.length} clauses=${clauseResult.clauses.length}`
  );

  return {
    ...state,
    retrieval: {
      matchedTemplate: templateResult.content,
      applicablePlaybookRules: dbRules,
      fallbackClauses: clauseResult.clauses,
      historicalReferences: [],
      templateSource: templateResult.source,
      clauseSource: clauseResult.source,
    },
    metadata: {
      ...state.metadata,
      retrievedAt: new Date().toISOString(),
      retrieval: {
        templateSource: templateResult.source,
        clauseSource: clauseResult.source,
        playbookRuleCount: dbRules.length,
        clauseCount: clauseResult.clauses.length,
        vaultDocumentId: state.request.vaultDocumentId ?? null,
      },
    },
  };
};
