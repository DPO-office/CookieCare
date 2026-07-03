import { DraftState } from "../models/draft-state";
import * as templates from '../prompt/system-templates';

// TODO: That we need to persist in the DB in template record table to extract the skeleton based on contract-type
const CONTRACT_SPINE_SKELETON = [
  'Definitions',
  'Parties & Preamble',
  'Confidentiality & Non-Disclosure Obligations',
  'Limitation of Liability & Indemnification',
  'Termination & Survival Mechanics',
  'Intellectual Property (IP) Ownership Rights',
  'Governing Law & Dispute Resolution',
  'Signatures & Execution Blocks'
];

export const contextAssemblyStep = async (state: DraftState): Promise<DraftState> => {
  if (!state.requirements) {
    throw new Error('Context Assembly aborted: state.requirements data block missing.');
  }

  const { retrieval, requirements, request } = state;

  // --- SECTION 1: STATIC CORE INSTRUCTIONS ---
  const fullCompiledPrompt = [
    templates.SYSTEM_CORE_GUARDRAILS,
    templates.buildPlaybookSection(retrieval.applicablePlaybookRules),
    templates.buildClauseSection(retrieval.fallbackClauses),
    `# BASELINE TEMPLATE TEXT\n${retrieval.matchedTemplate || 'No baseline text provided.'}`,
    templates.buildSkeletonSection(CONTRACT_SPINE_SKELETON),
    templates.buildVariablesSection(requirements, request.mode)
  ].join('\n\n');

  return {
    ...state,
    context: {
      systemPrompt: templates.SYSTEM_CORE_GUARDRAILS,
      assembledPrompt: fullCompiledPrompt,
      documentSkeleton: CONTRACT_SPINE_SKELETON
    }
  };
};