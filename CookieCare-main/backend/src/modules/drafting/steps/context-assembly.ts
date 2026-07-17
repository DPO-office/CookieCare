import { DraftState } from "../models/draft-state";
import * as templates from '../prompts/system-templates';

// TODO: That we need to persist in the DB in template record table to extract the skeleton based on contract-type
const PROACTIVE_CONTRACT_SKELETON = [
  'Definitions',
  'Preamble',
  'Confidentiality',
  'Indemnification and Limitation of Liability',
  'Term and Termination',
  'Intellectual Property',
  'Governing Law and Dispute Resolution',
  'Miscellaneous and Signatures'
];

// Reactive Outline: Used when responding to a claim notice or petition
const REACTIVE_RESPONSE_SKELETON = [
  'Preamble and Notice Identification',
  'Factual Recitals and Core Disputes',
  'Affirmative Defense and Policy Arguments',
  'Formal Demand, Remedy Requests and Closure',
  'Signatures and Legal Representation'
];

export const contextAssemblyStep = async (state: DraftState): Promise<DraftState> => {
  if (!state.requirements) {
    throw new Error('Context Assembly aborted: state.requirements data block missing.');
  }

  const { retrieval, requirements, request } = state;
  let SYSTEM_PROMPT: string;
  let fullCompiledPrompt: string;
  let ACTIVE_SKELETON: string[] = [];

  const isReactive = state.request.intent === 'REACTIVE';

  if (isReactive) {
    SYSTEM_PROMPT = templates.SYSTEM_REACTIVE_GUARDRAILS;
    
    // Construct in the strict required prompt assembly order:
    // 1. System Prompt
    // 2. Uploaded Agreement (FULL DOCUMENT)
    // 3. Retrieved Playbook Rules
    // 4. Relevant Clause Library
    // 5. User Instructions
    // 6. Drafting Task
    fullCompiledPrompt = [
      SYSTEM_PROMPT,
      `# UPLOADED VENDOR AGREEMENT (SOURCE OF TRUTH)\n${state.request.sourceText || 'No source document provided.'}`,
      templates.buildPlaybookSection(retrieval.applicablePlaybookRules),
      templates.buildClauseSection(retrieval.fallbackClauses),
      `# USER DRAFTING INSTRUCTIONS\n${state.requirements.instructions || 'Apply playbook rules to the uploaded agreement.'}`,
      `# DRAFTING TASK\n` +
      `This is an editing and revision task, NOT a document generation task. The uploaded vendor agreement is the sole source of truth and your primary input. You must edit and revise the uploaded agreement to conform to the retrieved playbook rules. Leave all compliant clauses completely unchanged.\n\n` +
      `CRITICAL METADATA & STRUCTURE PRESERVATION DIRECTIVES:\n` +
      `- You must preserve the identity of the uploaded agreement.\n` +
      `- NEVER rename the parties. The parties MUST remain exactly as stated in the original document (e.g. Party A/First Party: "${state.requirements.partyA || 'Not specified'}", Party B/Second Party: "${state.requirements.partyB || 'Not specified'}").\n` +
      `- NEVER modify the Effective Date. The Effective Date must remain exactly "${state.requirements.effectiveDate || 'Not specified'}" as in the original.\n` +
      `- NEVER change the document type (e.g., if it is a ${state.requirements.contractType || 'contract'}, it must remain that exact type).\n` +
      `- NEVER change the Governing Law / jurisdiction unless explicitly required/commanded by a playbook rule.\n` +
      `- Preserve all original clause numbering, headings, and overall layout/structure exactly.\n` +
      `- Do not invent any new parties, facts, disputes, litigation, notices, or legal scenarios.\n` +
      `- Return ONLY the complete revised agreement text in standard formatting. Do not wrap it in a memo, and do not append notes or summaries.`
    ].join('\n\n');

    // Requirement 7: Debug logs
    console.log("=== REACTIVE DRAFTING DEBUG LOGS ===");
    console.log("Prompt Assembly Order: [1. System Prompt, 2. Uploaded Agreement, 3. Retrieved Playbook Rules, 4. Relevant Clause Library, 5. User Instructions, 6. Drafting Task]");
    console.log("Retrieved Playbook Rules:", retrieval.applicablePlaybookRules.map(r => r.topic));
    console.log("Retrieved Clauses:", retrieval.fallbackClauses.map(c => `${c.id} (${c.clauseType})`));
    console.log("Uploaded Agreement Size (chars):", state.request.sourceText ? state.request.sourceText.length : 0);
    console.log("Final Prompt Token Estimate:", Math.ceil(fullCompiledPrompt.length / 4));
    console.log("=====================================");
  } else {
    const isTransactionalDraft = state.request.intent === 'PROACTIVE' || state.requirements.contractType === 'NDA';
    SYSTEM_PROMPT = templates.SYSTEM_TRANSACTIONAL_GUARDRAILS;
    ACTIVE_SKELETON = PROACTIVE_CONTRACT_SKELETON;

    fullCompiledPrompt = [
      SYSTEM_PROMPT,
      templates.buildPlaybookSection(retrieval.applicablePlaybookRules),
      templates.buildClauseSection(retrieval.fallbackClauses),
      `# BASELINE TEMPLATE TEXT\n${retrieval.matchedTemplate || 'No baseline text provided.'}`,
      templates.buildSkeletonSection(ACTIVE_SKELETON),
      templates.buildVariablesSection(requirements, request.intent)
    ].join('\n\n');
  }

  return {
    ...state,
    context: {
      systemPrompt: SYSTEM_PROMPT,
      assembledPrompt: fullCompiledPrompt,
      documentSkeleton: ACTIVE_SKELETON
    }
  };
};