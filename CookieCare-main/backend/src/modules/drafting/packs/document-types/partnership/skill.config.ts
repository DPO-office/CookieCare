import type { DraftingSkillConfig } from "../../skill-contract.js";

export const partnershipSkillConfig: DraftingSkillConfig = {
  skillId: "document-types/partnership",
  axis: "documentType",
  label: "Partnership / Teaming Agreement",
  version: "1.0.0",
  appliesToDocTypes: ["partnership"],
  requiredFacts: [
    {
      id: "partnershipPurpose",
      priority: "critical",
      blocking: true,
      question: "What is the strategic purpose or joint project of the partnership?",
      reasonRequired: "A partnership agreement must define its core enterprise purpose.",
    },
    {
      id: "revenueSplit",
      priority: "critical",
      blocking: true,
      question: "How are profits, revenues, or costs shared between partners?",
      reasonRequired: "Financial sharing rules are mandatory in partnership contracts.",
    },
  ],
  sectionBriefs: [
    { workUnitId: "sec-parties", title: "Parties and Purpose", purpose: "Identify Partners and define strategic partnership objective.", requiredContent: ["Partner entity legal names", "Joint project definition", "Effective date"] },
    { workUnitId: "sec-roles", title: "Roles and Responsibilities", purpose: "Detail duties and operational contributions of each Partner.", requiredContent: ["Operational duties per partner", "Resource commitments", "Steering committee"] },
    { workUnitId: "sec-financials", title: "Financial Terms and Revenue Sharing", purpose: "Specify profit/loss splits, capital contributions, and accounting.", requiredContent: ["Revenue / profit share percentages", "Capital contribution schedule", "Expense accounting"] },
    { workUnitId: "sec-ip", title: "IP and Governance", purpose: "Manage background IP, joint IP, and decision-making governance.", requiredContent: ["Pre-existing background IP", "Joint development IP ownership", "Voting / deadlock resolution"] },
    { workUnitId: "sec-termination", title: "Term and Dissolution", purpose: "Govern partnership term, exit mechanics, and winding up.", requiredContent: ["Partnership term", "Dissolution triggers", "Asset liquidation and final accounting"] },
    { workUnitId: "sec-misc", title: "Miscellaneous and Governing Law", purpose: "Standard boilerplate and governing jurisdiction.", requiredContent: ["Governing law", "Dispute resolution", "Severability"] },
  ],
};
