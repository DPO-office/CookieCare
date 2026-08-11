import type { Locator } from "./locator.js";

export interface ClauseObject {
  clauseId: string;
  /** Must be a member of the versioned clause taxonomy. */
  clauseType: string;
  locator: Locator;
  text: string;
  extractedEntities?: Record<string, string>;
  taxonomyVersion: string;
}
