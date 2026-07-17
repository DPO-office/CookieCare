import { DraftState, Clause, PlaybookRule } from '../models/draft-state';
import { pool } from '../../../config/database.js';


// Major restucutring need in this folder
export const retrievalStep = async (state: DraftState): Promise<DraftState> => {
  if (!state.requirements) {
    throw new Error('Cannot execute retrieval step: state.requirements is null');
  }

  // WE NEED TO RESTUCUTRE THIS TO DO A CLAUES CALL

  const requirements = state.requirements;

  const buildFallbackClauses = (clauseTypes: string[]): Clause[] => {
    const fallbackLibrary: Record<string, string> = {
      Confidentiality:
        "Each Party shall keep Confidential Information strictly confidential, use it only for performance under this Agreement, and apply reasonable safeguards no less protective than those used for its own confidential materials.",
      Liability:
        "Neither Party shall be liable for indirect, incidental, special, or consequential damages. Aggregate liability under this Agreement shall not exceed the total fees paid in the twelve (12) months preceding the event giving rise to liability.",
      Indemnity:
        "Each Party shall defend, indemnify, and hold harmless the other Party from third-party claims arising from its breach of law, gross negligence, or willful misconduct, subject to prompt notice and cooperation.",
      Termination:
        "Either Party may terminate this Agreement for material breach not cured within thirty (30) days after written notice. Upon termination, accrued payment obligations and clauses intended to survive shall remain in effect.",
      DataProtection:
        "Where personal data is processed, the Parties shall comply with applicable data protection laws, process data only on documented instructions, and implement appropriate technical and organizational security measures.",
      GoverningLaw:
        `This Agreement shall be governed by the laws of ${requirements.jurisdiction}, excluding conflict-of-law rules, and disputes shall be resolved in the competent courts of that jurisdiction.`,
      General:
        "This clause is a temporary approved placeholder and should be replaced by a clause from the managed clause library once vector and keyword retrievers are integrated.",
    };

    return clauseTypes.map((rawType, index) => {
      const cleanType = String(rawType || "General").trim() || "General";
      const normalized = cleanType.replace(/\s+/g, "");
      const text = fallbackLibrary[normalized] || fallbackLibrary[cleanType] || fallbackLibrary.General;

      return {
        id: `fallback_clause_${index + 1}`,
        clauseType: cleanType,
        jurisdiction: requirements.jurisdiction,
        riskLevel: index < 2 ? "Low" : "Medium",
        isApproved: true,
        text,
      };
    });
  };
  
  // Clauses are now retrieved via playbookTopics below to reduce database noise.

  // TRANSFER THIS CODE TO retrieval/playbookRetriver.ts

  const readPlaybookRulesFromDb = async (): Promise<PlaybookRule[]> => {
    try {
      const { rows } = await pool.query(
        `SELECT id, topic, standard_position, fallback_positions, walk_away_condition
         FROM playbook_rules
         WHERE contract_type = $1
         ORDER BY created_at DESC
         LIMIT 25`,
        [requirements.contractType]
      );

      let rules = rows.map((row: any) => ({
        id: String(row.id),
        topic: String(row.topic ?? "General"),
        standardPosition: String(row.standard_position ?? ""),
        fallbackPositions: Array.isArray(row.fallback_positions) ? row.fallback_positions : [],
        walkAwayCondition: String(row.walk_away_condition ?? ""),
      }));

      // For reactive mode, keep rules whose topics or keywords are mentioned/relevant in the uploaded contract
      if (state.request.intent === "REACTIVE" && state.request.sourceText) {
        const sourceLower = state.request.sourceText.toLowerCase();
        rules = rules.filter(rule => {
          const topicLower = rule.topic.toLowerCase();
          if (sourceLower.includes(topicLower)) return true;
          // Topic match synonyms
          if (topicLower === "confidentiality" && (sourceLower.includes("confidential") || sourceLower.includes("nda"))) return true;
          if (topicLower === "governing law" && (sourceLower.includes("governing") || sourceLower.includes("jurisdiction") || sourceLower.includes("dispute"))) return true;
          if (topicLower === "termination" && (sourceLower.includes("terminate") || sourceLower.includes("survival"))) return true;
          if (topicLower === "indemnity" && (sourceLower.includes("indemnify") || sourceLower.includes("indemnification") || sourceLower.includes("hold harmless"))) return true;
          if (topicLower === "liability" && (sourceLower.includes("liability") || sourceLower.includes("damages"))) return true;
          return false;
        });
      }

      return rules;
    } catch {
      return [];
    }
  };

  const readTemplateFromDb = async (): Promise<string | null> => {
    if (state.request.intent === "REACTIVE") {
      return state.request.sourceText || null;
    }

    try {
      const inputTemplateId = state.request?.templateId;

      if (inputTemplateId && inputTemplateId.trim()) {
        const targetQuery = inputTemplateId.length === 36 || inputTemplateId.includes('-')
          ? "SELECT content FROM contract_templates WHERE id = $1 AND status = 'active' LIMIT 1"
          : "SELECT content FROM contract_templates WHERE name ILIKE $1 AND status = 'active' LIMIT 1";
        
        const res = await pool.query(targetQuery, [inputTemplateId]);
        if (res.rows.length > 0 && res.rows[0]?.content) {
          return String(res.rows[0].content);
        }
      }

      const fallbackSql = `
        SELECT content FROM contract_templates 
        WHERE contract_type = $1 AND jurisdiction = $2 AND status = 'active' 
        LIMIT 1;
      `;
      const fallbackRes = await pool.query(fallbackSql, [requirements.contractType, requirements.jurisdiction]);
      return fallbackRes.rows.length > 0 ? String(fallbackRes.rows[0].content) : null;
      
    } catch (err) {
      console.error("Template retrieval error:", err);
      return null;
    }
  };

  const retrieveClauses = async (playbookTopics: string[]): Promise<Clause[]> => {
    const requestedTypes = [
      ...(requirements.requiredClauses || []),
      ...(requirements.optionalClauses || []),
    ];

    // For reactive mode, search for clauses matching playbook rule topics to reduce noise
    const topicsToSearch = requestedTypes.length > 0
      ? requestedTypes
      : (state.request.intent === "REACTIVE" ? playbookTopics : ["General"]);

    const normalizedTypes = (topicsToSearch.length ? topicsToSearch : ["General"]).slice(0, 6);

    try {
      const { rows } = await pool.query(
        `SELECT id, name, details, tags
         FROM library_items
         WHERE type = 'clauses'
         ORDER BY created_at DESC
         LIMIT 50`
      );

      if (!rows.length) {
        return buildFallbackClauses(normalizedTypes);
      }

      const ranked: Clause[] = [];
      const loweredNeedles = normalizedTypes.map((t) => t.toLowerCase());

      for (const row of rows) {
        const detailsText = typeof row.details === 'string' ? row.details : JSON.stringify(row.details || {});
        const tagsText = typeof row.tags === 'string' ? row.tags : JSON.stringify(row.tags || []);
        const haystack = `${row.name || ''} ${detailsText} ${tagsText}`.toLowerCase();
        const matchingType = loweredNeedles.find((t) => haystack.includes(t));
        if (!matchingType) continue;

        ranked.push({
          id: String(row.id),
          clauseType: matchingType,
          jurisdiction: requirements.jurisdiction,
          riskLevel: "Medium",
          isApproved: true,
          text: detailsText,
        });

        if (ranked.length >= 8) break;
      }

      if (ranked.length > 0) {
        return ranked;
      }

      return buildFallbackClauses(normalizedTypes);
    } catch {
      return buildFallbackClauses(normalizedTypes);
    }
  };

  const dbRules = await readPlaybookRulesFromDb();
  const matchedTemplate = await readTemplateFromDb();
  
  // Extract playbook topics to search for relevant clauses
  const playbookTopics = dbRules.map(r => r.topic);
  const clauses: Clause[] = await retrieveClauses(playbookTopics);

  return {
    ...state,
    retrieval: {
      matchedTemplate,
      applicablePlaybookRules: dbRules,
      fallbackClauses: clauses,
      historicalReferences: []
    },
    metadata: {
      ...state.metadata,
      retrievedAt: new Date().toISOString()
    }
  };
};