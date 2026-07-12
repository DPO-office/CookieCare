import { RequirementContext, Clause } from '../models/draft-state';

export class ClauseRetriever {
  private vectorDb: any; // e.g., Pinecone/Qdrant
  private keywordDb: any; // e.g., Elasticsearch/BM25

  constructor(vectorDb: any, keywordDb: any) {
    this.vectorDb = vectorDb;
    this.keywordDb = keywordDb;
  }

  async retrieveClauses(requirements: RequirementContext): Promise<Clause[]> {
    // Combine all desired targeted clauses into one execution checklist
    const targetedClauses = [
      ...requirements.requiredClauses,
      ...requirements.optionalClauses
    ];

    const finalSelectedClauses: Clause[] = [];

    // Loop through each target category independently to prevent cross-contamination
    for (const clauseType of targetedClauses) {
      const metadataFilter = {
        contractType: requirements.contractType,
        jurisdiction: requirements.jurisdiction,
        clauseType: clauseType
      };

      // Run micro-searches concurrently for this exact clause type
      const [vectorHits, keywordHits] = await Promise.all([
        this.vectorDb.search({ query: clauseType, filter: metadataFilter, limit: 10 }),
        this.keywordDb.search({ query: clauseType, filter: metadataFilter, limit: 10 })
      ]);

      // Apply Reciprocal Rank Fusion (RRF) to merge and rank them safely
      const fusedResults = this.applyRRF(vectorHits, keywordHits);

      // Take only the top 2 items for this specific category (Primary + Fallback)
      const topMatches = fusedResults.slice(0, 2);
      finalSelectedClauses.push(...topMatches);
    }

    return finalSelectedClauses;
  }

  /**
   * Reciprocal Rank Fusion (RRF) implementation
   */
  private applyRRF(vectorHits: any[], keywordHits: any[]): Clause[] {
    const scoreMap = new Map<string, { clause: Clause; score: number }>();
    const k = 60; // Standard RRF constant

    const processHits = (hits: any[]) => {
      hits.forEach((hit, index) => {
        const rank = index + 1;
        const current = scoreMap.get(hit.id) || {
          clause: {
            id: hit.id,
            text: hit.text,
            clauseType: hit.metadata.clauseType,
            jurisdiction: hit.metadata.jurisdiction,
            riskLevel: hit.metadata.riskLevel,
            isApproved: hit.metadata.isApproved
          },
          score: 0
        };
        // Sum the reciprocal ranks
        current.score += 1 / (k + rank);
        scoreMap.set(hit.id, current);
      });
    };

    processHits(vectorHits);
    processHits(keywordHits);

    // Sort descending by highest combined RRF rank score
    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .map(item => item.clause);
  }
}