# Code Review Request - Phase 2: Enterprise RAG Upgrades

## Changes:
1. **Semantic Legal Chunking**: Implemented `splitIntoClauseAwareChunks` in `ragService.ts` using regex to recognize legal document hierarchies (Sections, Articles, numbered clauses).
2. **Standardized Embedding Model**: Explicitly using `text-embedding-004` (768d) optimized for legal text.
3. **AI Re-ranking**: Added a re-ranking step in `searchHybrid` using Gemini 2.0 Flash as a cross-encoder to refine the top 20 results down to the best 5.
4. **Source Citations**:
    - Updated `AskLawyerAgent` to strictly enforce [Source X] citations.
    - Updated `AgentOrchestrator` to map RAG chunks to citation metadata.
5. **UI Citation Integration**:
    - Updated `AskAILawyer.tsx` to parse citations in the AI's response.
    - Implemented interactive citation chips that open the "Official Source Verification Vault" modal.

## Verification:
- Verified `ragService.ts` logic and exports.
- Linting passed.
- UI components updated and aligned with the "PrivSecAI" design system.
