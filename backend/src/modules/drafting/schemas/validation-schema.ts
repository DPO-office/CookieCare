export const LLM_VALIDATION_SCHEMA = {
    type: "object",
    properties: {
      issues: {
        type: "array",
        description: "List of compliance, legal, or reference issues found in the draft.",
        items: {
          type: "object",
          required: ["type", "severity", "description"],
          properties: {
            type: {
              type: "string",
              enum: ["omission", "reference_broken", "playbook_violation", "formatting", "jurisdiction"]
            },
            severity: {
              type: "string",
              enum: ["warning", "critical"]
            },
            description: {
              type: "string",
              description: "Detailed explanation of the exact issue and why it fails compliance."
            },
            targetSection: {
              type: "string",
              description: "The name of the header or section where this issue occurs."
            }
          }
        }
      }
    },
    required: ["issues"]
  };
  
  export interface LLMValidationResponse {
    issues: Array<{
      type: 'omission' | 'reference_broken' | 'playbook_violation' | 'formatting' | 'jurisdiction';
      severity: 'warning' | 'critical';
      description: string;
      targetSection?: string;
    }>;
  }