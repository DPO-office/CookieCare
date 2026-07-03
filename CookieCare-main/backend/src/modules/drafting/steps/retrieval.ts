import { DraftState } from '../models/draft-state';
import { PlaybookRetriever } from '../services/retrievers/playbook-retriever';
import { ClauseRetriever } from '../services/retrievers/clause-retriever';
import { db, vectorClient, keywordClient } from '../infra/clients'; // TODO: need to setup and init prima client

export const retrievalStep = async (state: DraftState): Promise<DraftState> => {
  if (!state.requirements) {
    throw new Error('Cannot execute retrieval step: state.requirements is null');
  }

  // 1. Initialize our isolated retrievers
  const playbookRetriever = new PlaybookRetriever(db);
  const clauseRetriever = new ClauseRetriever(vectorClient, keywordClient);

  // 2. Fetch everything concurrently across individual streams
  const [rules, clauses] = await Promise.all([
    playbookRetriever.retrieveRules(state.requirements),
    clauseRetriever.retrieveClauses(state.requirements)
  ]);

  // 3. Query the database using the requirements for extraction of Tempate Records
  const templateRecord = await db.contractTemplate.findFirst({
    where :{
      contractType: state.requirements.contractType, // e.g., 'NDA'
      jurisdiction: state.requirements.jurisdiction, // e.g., 'Delaware'
      status: 'active'
      }
  })

  // 3. Update DraftState immutably 
  return {
    ...state,
    retrieval: {
      matchedTemplate: templateRecord,
      applicablePlaybookRules: rules,                   // 100% of filtered rules preserved
      fallbackClauses: clauses,                         // Top ranked primary/fallbacks preserved
      historicalReferences: []
    },
    metadata: {
      ...state.metadata,
      retrievedAt: new Date().toISOString()
    }
  };
};