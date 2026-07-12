/**
 * Stub infrastructure clients for the drafting module.
 * These are placeholder implementations until Prisma ORM, a vector DB (Pinecone/Qdrant),
 * and a keyword search engine (Elasticsearch/BM25) are configured.
 */

/** Prisma-compatible stub — returns safe empty results for all queries */
export const db: any = {
  contractTemplate: {
    findFirst: async (_args?: any) => null,
  },
  playbookRules: {
    findMany: async (_args?: any) => [],
  },
};

/** Vector search client stub — returns empty hits */
export const vectorClient: any = {
  search: async (_params?: any) => [],
};

/** Keyword search client stub — returns empty hits */
export const keywordClient: any = {
  search: async (_params?: any) => [],
};
