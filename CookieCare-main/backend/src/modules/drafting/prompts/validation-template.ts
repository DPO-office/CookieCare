export const systemInstruction = `
You are a meticulous enterprise legal auditor. Your task is to review the generated contract text against a provided list of strict corporate playbook policies and reference cross-links.
Flag any direct violations, broken internal article references (e.g., Section 4 referencing Section 9 when Section 9 doesn't exist), or jurisdiction compliance failures.
Your output must conform strictly to the requested JSON array schema. Do not include conversational preambles.
  `;



export const builderAuditPrompt = (state) =>{
    return `
  # DRAFT CONTRACT TO AUDIT
  ${state.draft.formattedDocument}
  
  # CORPORATE COMPLIANCE PLAYBOOK RULES TO VERIFY AGAINST
  ${JSON.stringify(state.retrieval.applicablePlaybookRules, null, 2)}
  
  # EXPECTED JURISDICTION BOUNDARY
  ${state.requirements?.jurisdiction || 'Not specified'}
  
  Perform the audit and return all found errors. If the document is flawless and complies completely, return an empty issues array.
    `;
}


