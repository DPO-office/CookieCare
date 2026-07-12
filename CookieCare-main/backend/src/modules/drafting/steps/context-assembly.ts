import { DraftState } from "../models/draft-state";
import * as templates from '../prompts/system-templates';

// TODO: That we need to persist in the DB in template record table to extract the skeleton based on contract-type
const PROACTIVE_CONTRACT_SKELETON = [
  'Definitions',
  'Parties & Preamble',
  'Confidentiality & Non-Disclosure Obligations',
  'Limitation of Liability & Indemnification',
  'Termination & Survival Mechanics',
  'Intellectual Property (IP) Ownership Rights',
  'Governing Law & Dispute Resolution',
  'Signatures & Execution Blocks'
];

// Reactive Outline: Used when responding to a claim notice or petition
const REACTIVE_RESPONSE_SKELETON = [
  'Preamble & Notice Identification',
  'Factual Recitals & Core Disputes',
  'Affirmative Defense & Policy Arguments',
  'Formal Demand, Remedy Requests & Closure',
  'Signatures & Legal Representation Blocks'
];

export const contextAssemblyStep = async (state: DraftState): Promise<DraftState> => {
  if (!state.requirements) {
    throw new Error('Context Assembly aborted: state.requirements data block missing.');
  }

  const { retrieval, requirements, request } = state;
  let SYSTEM_PROMPT: string;
  let fullCompiledPrompt: string;
  let ACTIVE_SKELETON: string[];

  const isReactive = state.request.intent === 'REACTIVE';

  if(isReactive){
    SYSTEM_PROMPT = templates.SYSTEM_REACTIVE_GUARDRAILS
    ACTIVE_SKELETON = REACTIVE_RESPONSE_SKELETON

    fullCompiledPrompt = [
      SYSTEM_PROMPT,
      templates.buildPlaybookSection(retrieval.applicablePlaybookRules),
      templates.buildClauseSection(retrieval.fallbackClauses),
      `# BASELINE TEMPLATE TEXT\n${retrieval.matchedTemplate || 'No baseline text provided.'}`,
      templates.buildSkeletonSection(ACTIVE_SKELETON),
      templates.buildVariablesSection(requirements,request.intent)
    ].join('\n\n')



  }
  else{

    SYSTEM_PROMPT = templates.SYSTEM_REACTIVE_GUARDRAILS
    ACTIVE_SKELETON = PROACTIVE_CONTRACT_SKELETON

    fullCompiledPrompt = [
      templates.SYSTEM_CORE_GUARDRAILS,
      templates.buildPlaybookSection(retrieval.applicablePlaybookRules),
      templates.buildClauseSection(retrieval.fallbackClauses),
      `# BASELINE TEMPLATE TEXT\n${retrieval.matchedTemplate || 'No baseline text provided.'}`,
      templates.buildSkeletonSection(ACTIVE_SKELETON),
      templates.buildVariablesSection(requirements, request.intent)
    ].join('\n\n');

  }
  // --- SECTION 1: STATIC CORE INSTRUCTIONS ---

  return {
    ...state,
    context: {
      systemPrompt: SYSTEM_PROMPT,
      assembledPrompt: fullCompiledPrompt,
      documentSkeleton: ACTIVE_SKELETON
    }
  };
};