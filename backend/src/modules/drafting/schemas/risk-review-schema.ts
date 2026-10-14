// drafting/schemas/risk-review-schema.ts

export const LLM_RISK_REVIEW_SCHEMA = {
    type: "object",
    properties: {
      risks: {
        type: "array",
        items: {
          type: "object",
          required: ["severity", "explanation"],
          properties: {
            severity: { type: "string", enum: ["Low", "Medium", "High"] },
            explanation: { type: "string" },
            suggestedReplacementClause: { type: "string" }
          }
        }
      }
    },
    required: ["risks"]
  };
  
  export interface LLMRiskReviewResponse {
    risks: Array<{
      severity: 'Low' | 'Medium' | 'High';
      explanation: string;
      suggestedReplacementClause?: string;
    }>;
  }