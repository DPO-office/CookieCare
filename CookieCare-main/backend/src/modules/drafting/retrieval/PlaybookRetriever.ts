import { RequirementContext, PlaybookRule } from '../../models/draft-state.ts';

export class PlaybookRetriever {
  private dbClient: any; 

  constructor(dbClient: any) {
    this.dbClient = dbClient;
  }

  /**
   * Fetches 100% of the company's rules for this specific document type.
   * Zero truncation, zero math, complete compliance.
   */
  async retrieveRules(requirements: RequirementContext): Promise<PlaybookRule[]> {
    // Exact metadata match against your database
    const matchingRules = await this.dbClient.playbookRules.findMany({
      where: {
        contractType: requirements.contractType,
        jurisdiction: requirements.jurisdiction,
        industry: requirements.industry,
        status: 'active'
      }
    });

    return matchingRules.map((rule: any) => ({
      id: rule.id,
      topic: rule.topic,
      standardPosition: rule.standardPosition,
      fallbackPositions: rule.fallbackPositions, // Array of text options
      walkAwayCondition: rule.walkAwayCondition
    }));
  }
}