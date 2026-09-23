import type { DraftingSkillConfig } from "../../skill-contract.js";

export const resellerSkillConfig: DraftingSkillConfig = {
  skillId: "document-types/reseller",
  axis: "documentType",
  label: "Reseller / Distribution Agreement",
  version: "1.0.0",
  appliesToDocTypes: ["reseller"],
  requiredFacts: [
    {
      id: "territory",
      priority: "critical",
      blocking: true,
      question: "What is the designated geographic territory for reselling?",
      reasonRequired: "Distribution contracts require an explicit territorial scope.",
      placeholder: "e.g. United Kingdom and European Union",
    },
    {
      id: "productsCovered",
      priority: "critical",
      blocking: true,
      question: "Which products or services is the reseller authorized to distribute?",
      reasonRequired: "Authorized product line must be explicitly specified.",
      placeholder: "e.g. CloudSuite Pro and CloudSuite Enterprise",
    },
  ],
  sectionBriefs: [
    { workUnitId: "sec-parties", title: "Parties and Appointment", purpose: "Identify Supplier and Reseller and state appointment scope.", requiredContent: ["Supplier legal entity", "Reseller legal entity", "Effective date"] },
    { workUnitId: "sec-territory", title: "Territory and Products", purpose: "Specify authorized products and geographical limits.", requiredContent: ["Authorized products list", "Designated territory", "Exclusivity status"] },
    { workUnitId: "sec-pricing", title: "Pricing, Margins, and Ordering", purpose: "Define wholesale prices, discount structures, and order procedures.", requiredContent: ["Wholesale pricing structure", "Order submission and acceptance", "Payment terms"] },
    { workUnitId: "sec-termination", title: "Term and Termination", purpose: "Govern appointment term and sell-off rights post-termination.", requiredContent: ["Appointment term", "Termination triggers", "Inventory sell-off or repurchase"] },
    { workUnitId: "sec-misc", title: "Miscellaneous and Governing Law", purpose: "Standard boilerplate and jurisdiction.", requiredContent: ["Governing law", "Independent contractor status", "Entire agreement"] },
  ],
};
