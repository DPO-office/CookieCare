/**
 * PHASE 4A — versioned element schemas.
 *
 * Every Article 28 requirement is decomposed into atomic legal elements with
 * explicit proof guidance, known non-proof traps, applicability rules, and
 * remediation guidance. Schemas are AUTHORED (not inferred at runtime) and
 * versioned — any change requires a legal-review sign-off and a version bump.
 *
 * The `aggregationRule` on each schema encodes how the elements combine:
 *   AND        — every mandatory element must be supported
 *   OR         — at least one branch must be supported
 *   CHOICE     — the requirement offers a chooser (controller picks one)
 *   EXCEPTION  — the main-rule element applies unless the exception applies
 *   CONDITIONAL — an element only applies when its `applicabilityRule` fires
 *
 * NB: Phase 4A ships the schemas + registry. Phase 4B consumes them to build
 * the element matrix; VERIFY prompt changes are the Phase 4B stop gate.
 */

export type ElementKind = "mandatory" | "conditional" | "alternative";
export type AggregationRule =
  | "AND"
  | "OR"
  | "CHOICE"
  | "EXCEPTION"
  | "CONDITIONAL";

export interface ElementSchema {
  elementId: string;
  proposition: string;
  kind: ElementKind;
  proofGuidance: string;
  nonProofTraps: string[];
  applicabilityRule?: string;
  remediationGuidance: string;
  /** Bumped by legal review when authored text changes. */
  version: string;
  /**
   * Non-negotiable vocabulary for this element. If set, a bundle item must
   * contain ≥1 of these (case-insensitive substring) to count toward
   * support — prevents generic tokens ("services", "obligation", "request")
   * from letting the wrong clause satisfy the wrong element. Leave undefined
   * to fall back to pure proofGuidance overlap.
   */
  distinctiveTokens?: string[];
  /**
   * Compound distinctive gate: each inner array is an OR, the outer array is
   * an AND — a bundle item must hit at least one substring from EVERY group.
   * Use this when a single-token gate over-fires (e.g. G4's "unless" and
   * "required by law" are individually generic but the intersection with a
   * retention/storage word actually pins down Article 28(3)(g)'s closing
   * proviso). Applies IN ADDITION TO `distinctiveTokens`.
   */
  requiredTokenGroups?: string[][];
}

export interface RequirementElementSchema {
  requirementUid: string;
  canonicalKey: string;
  legalCitation: string;
  title: string;
  aggregationRule: AggregationRule;
  elements: ElementSchema[];
  /** Bumped by legal review when any element or aggregation rule changes. */
  version: string;
  /**
   * Legally reviewed? Emitted as-is on `compliance.element.registry`.
   *   "authored"      — hand-typed in this file, tuned against real DPAs,
   *                      not yet legally reviewed.
   *   "legal_reviewed" — signed off by counsel.
   *   "auto_derived"   — synthesized at runtime from a skill's own authored
   *                      `hypothesis` / `proofStandard` / `evidenceHints`
   *                      (see `synthesizeElementSchemaFromProfile` below).
   *                      Single-element, AND-only, no hand-tuned traps or
   *                      compound token gates — a real but coarser schema
   *                      than a hand-authored one for the same requirement.
   */
  reviewStatus: "authored" | "legal_reviewed" | "auto_derived";
  /**
   * Alternate identity keys the runtime may present for this requirement —
   * anything `canonicalRequirementId()` might return, plus any package-native
   * ids we want to route to the same schema. Kept explicit (not derived from
   * the alias table) so a schema stays valid when the alias table is rewritten.
   */
  aliases?: string[];
}

const ELEMENT_VERSION = "0.1.0";

/**
 * Registry of Article 28 element schemas. Coverage is intentionally scoped to
 * the requirements the plan flags for explicit legal review (§4A Acceptance):
 * 28(3)(a) instructions, 28(3)(f) security assistance, 28(3)(g) deletion /
 * return, plus the four particulars 28(3) preamble names — subject_matter,
 * duration, nature_and_purpose, categories_of_data / data_subjects.
 *
 * NOT LEGALLY REVIEWED YET — `reviewStatus: "authored"` on every entry. Phase
 * 4B may consume these deterministically for its side-channel matrix; the
 * live VERIFY prompt is NOT touched until legal review completes.
 */
export const ARTICLE_28_ELEMENT_REGISTRY: RequirementElementSchema[] = [
  {
    requirementUid: "gdpr.art28.subject_matter",
    canonicalKey: "gdpr.article28.subject_matter",
    legalCitation: "GDPR Article 28(3), preamble — subject matter particular",
    title: "Subject matter of the processing",
    aggregationRule: "AND",
    aliases: [
      "article28.subject_matter",
      "subject_matter",
      "gdpr.article28.subject_matter_and_duration",
    ],
    elements: [
      {
        elementId: "SM1",
        proposition:
          "The contract identifies the subject matter of the processing (what is being processed and why the processor is engaged).",
        kind: "mandatory",
        proofGuidance:
          "Look for a scoping clause naming the services or an appendix/schedule labelled 'subject matter' or 'services'. Definition of the engagement, description of services, or an SOW reference counts.",
        nonProofTraps: [
          "A generic 'the parties have entered into this agreement' recital.",
          "The title of the document alone.",
          "A pointer to Appendix X where Appendix X is missing from the upload.",
        ],
        remediationGuidance:
          "Add a subject-matter clause naming the processing scope or attach the referenced Appendix/Schedule.",
        version: ELEMENT_VERSION,
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28.duration",
    canonicalKey: "gdpr.article28.duration",
    legalCitation: "GDPR Article 28(3), preamble — duration particular",
    title: "Duration of the processing",
    aggregationRule: "AND",
    aliases: ["article28.duration", "duration"],
    elements: [
      {
        elementId: "DU1",
        proposition:
          "The contract specifies the duration of the processing, either by a defined term (e.g., 'Term') or by tying it to the term of the main services agreement.",
        kind: "mandatory",
        proofGuidance:
          "A 'Term' definition + a clause aligning processing duration with the Term; or a fixed date range; or an 'in force during the Services' formulation.",
        nonProofTraps: [
          "A definition of 'Term' that is never referenced by an operative processing clause.",
          "A termination-notice clause that presupposes duration but does not state it.",
        ],
        remediationGuidance:
          "Add a duration clause or bind the processing duration to the main agreement's Term.",
        version: ELEMENT_VERSION,
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28.nature_and_purpose",
    canonicalKey: "gdpr.article28.nature_and_purpose",
    legalCitation: "GDPR Article 28(3), preamble — nature and purpose particular",
    title: "Nature and purpose of the processing",
    aggregationRule: "AND",
    aliases: [
      "article28.nature_and_purpose",
      "nature_and_purpose",
      "nature_purpose",
    ],
    elements: [
      {
        elementId: "NP1",
        proposition: "The contract states the nature of the processing (the operations performed).",
        kind: "mandatory",
        proofGuidance:
          "Look for a list of processing operations (collection, storage, disclosure, deletion, hosting, analytics, etc.) — usually in an Appendix/Schedule table.",
        nonProofTraps: [
          "A bare reference like 'as necessary for the Services' with no enumerated operations.",
        ],
        remediationGuidance: "Enumerate the processing operations in the DPA or its schedule.",
        version: ELEMENT_VERSION,
      },
      {
        elementId: "NP2",
        proposition: "The contract states the purpose of the processing.",
        kind: "mandatory",
        proofGuidance:
          "A stated purpose (delivering the Services, administering payroll, providing hosting, etc.).",
        nonProofTraps: ["Purpose implied only from the counterparty's industry."],
        remediationGuidance: "State the purpose of the processing in the contract.",
        version: ELEMENT_VERSION,
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28.categories_of_data",
    canonicalKey: "gdpr.article28.categories_of_data",
    legalCitation: "GDPR Article 28(3), preamble — categories of personal data particular",
    title: "Categories of personal data",
    aggregationRule: "AND",
    aliases: [
      "article28.categories_of_data",
      "categories_of_data",
      "data_categories",
    ],
    elements: [
      {
        elementId: "CD1",
        proposition: "The contract lists the categories of personal data processed.",
        kind: "mandatory",
        proofGuidance:
          "An Appendix/Schedule table row labelled 'Categories of personal data' or an enumerated list (contact details, financial data, identifiers, etc.).",
        nonProofTraps: [
          "A generic 'personal data' reference without categorisation.",
          "A pointer to an Appendix that the upload does not contain.",
        ],
        remediationGuidance:
          "Add or attach the categories-of-personal-data list, aligned with the actual processing.",
        version: ELEMENT_VERSION,
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28.categories_of_data_subjects",
    canonicalKey: "gdpr.article28.categories_of_data_subjects",
    legalCitation: "GDPR Article 28(3), preamble — categories of data subjects particular",
    title: "Categories of data subjects",
    aggregationRule: "AND",
    aliases: [
      "article28.categories_of_data_subjects",
      "categories_of_data_subjects",
      "data_subject_categories",
    ],
    elements: [
      {
        elementId: "DS1",
        proposition: "The contract lists the categories of data subjects whose data is processed.",
        kind: "mandatory",
        proofGuidance:
          "An Appendix/Schedule row 'Categories of data subjects' (employees, customers, prospects, end users, etc.) or an equivalent enumeration.",
        nonProofTraps: [
          "'Individuals whose personal data is processed' — circular.",
          "An unreferenced Appendix.",
        ],
        remediationGuidance: "Add or attach a categories-of-data-subjects list.",
        version: ELEMENT_VERSION,
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28_3.a.documented_instructions",
    canonicalKey: "gdpr.article28.3a.documented_instructions",
    legalCitation: "GDPR Article 28(3)(a)",
    title: "Processor acts only on documented instructions",
    aggregationRule: "AND",
    aliases: [
      "gdpr.article28_3.a.documented_instructions",
      "art28_3_a_instructions",
      "article28.3a.documented_instructions",
      "documented_instructions",
    ],
    elements: [
      {
        elementId: "A1",
        proposition:
          "The processor processes personal data only on documented instructions from the controller.",
        kind: "mandatory",
        proofGuidance:
          "A clause using 'only on documented instructions' / 'in accordance with the Controller's written instructions'. May sit in an operational-obligations section, a jurisdiction addendum, or the international-transfers section.",
        nonProofTraps: [
          "'As reasonably necessary to provide the Services' without an instruction-anchor.",
          "A general confidentiality clause.",
        ],
        remediationGuidance:
          "Add the documented-instructions clause with the standard 28(3)(a) formulation.",
        version: ELEMENT_VERSION,
      },
      {
        elementId: "A2",
        proposition:
          "Instructions to make an international transfer are also processed only on documented instructions, unless required by law (with a notification obligation).",
        kind: "conditional",
        applicabilityRule:
          "Applies when the arrangement contemplates cross-border transfers of personal data.",
        proofGuidance:
          "The Article 28(3)(a) proviso: unless required by Union or Member State law, in which case the processor notifies the controller before processing (unless the law prohibits notification for important public-interest reasons).",
        nonProofTraps: [
          "A separate international-transfer clause that names the mechanism (SCCs) but not the instruction-based control.",
        ],
        remediationGuidance:
          "Add the proviso allowing law-mandated processing with a controller-notification obligation.",
        version: ELEMENT_VERSION,
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28_3.f.security_assistance",
    canonicalKey: "gdpr.article28.3f.controller_assistance",
    legalCitation: "GDPR Article 28(3)(f)",
    title:
      "Processor assists the controller with obligations under Articles 32 to 36 (security, breach notification, DPIAs, prior consultation)",
    aggregationRule: "AND",
    aliases: [
      "gdpr.article28_3.f.security_assistance",
      "art28_3_f_security_assistance",
      "article28.3f.controller_assistance",
      "controller_assistance",
    ],
    elements: [
      {
        elementId: "F1",
        proposition:
          "The processor assists the controller in ensuring compliance with Article 32 (security of processing).",
        kind: "mandatory",
        proofGuidance:
          "An explicit assistance-with-security clause, or an operational security clause (e.g. Section 6.4) referenced by the assistance provision.",
        nonProofTraps: [
          "A generic 'commercially reasonable security measures' clause with no controller-assistance obligation.",
        ],
        remediationGuidance:
          "Add an Article 32 assistance clause; cross-reference existing security controls.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "security",
          "technical and organi",
          "safeguards",
          "article 32",
        ],
      },
      {
        elementId: "F2",
        proposition:
          "The processor assists with Articles 33-34 (personal-data-breach notification to the supervisory authority and to data subjects).",
        kind: "mandatory",
        proofGuidance:
          "A breach-notification clause naming assistance with controller's Article 33/34 duties, usually with a time window.",
        nonProofTraps: [
          "A processor-only breach-notification clause without controller assistance framing.",
        ],
        remediationGuidance: "Add breach-notification assistance with a defined time window.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "breach",
          "notif",
          "supervisory authority",
          "article 33",
          "article 34",
        ],
      },
      {
        elementId: "F3",
        proposition: "The processor assists with Articles 35-36 (DPIAs and prior consultation).",
        kind: "mandatory",
        proofGuidance:
          "A DPIA / prior-consultation assistance clause (often bundled with 33-34 assistance).",
        nonProofTraps: [
          "A blanket 'assists with data protection obligations' clause with no DPIA scope.",
        ],
        remediationGuidance:
          "Add DPIA / prior-consultation assistance, taking into account the nature of processing and information available.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "dpia",
          "impact assessment",
          "prior consultation",
          "article 35",
          "article 36",
          "data protection impact",
        ],
        requiredTokenGroups: [
          [
            "impact assessment",
            "dpia",
            "prior consultation",
            "consult",
            "article 35",
            "article 36",
          ],
          [
            "assist",
            "support",
            "provide",
            "cooperat",
            "help",
            "make available",
          ],
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "gdpr.art28_3.g.return_or_deletion",
    canonicalKey: "gdpr.article28.3g.deletion_or_return",
    legalCitation: "GDPR Article 28(3)(g)",
    title:
      "At the choice of the controller, the processor deletes or returns all personal data at the end of the provision of services",
    aggregationRule: "CHOICE",
    aliases: [
      "gdpr.article28_3.g.return_or_deletion",
      "art28_3_g_deletion_return",
      "article28.3g.deletion_or_return",
      "deletion_or_return",
      "return_or_deletion",
    ],
    elements: [
      {
        elementId: "G1",
        proposition: "The controller has a right to choose between deletion and return.",
        kind: "mandatory",
        proofGuidance:
          "A clause explicitly giving the controller the choice (e.g. 'at the Controller's option, delete or return').",
        nonProofTraps: [
          "A deletion-only clause with no return branch.",
          "A return-only clause with no deletion branch.",
        ],
        remediationGuidance:
          "Reword the post-termination clause to grant the controller a choice.",
        version: ELEMENT_VERSION,
        // The chooser is the intersection of THREE ideas: a choice/option
        // word, both delete AND return branches or a chooser-side agent, and
        // a data referent. Real phrasings vary widely — MC's
        // "at Mastercard's sole option ... securely delete ... or return
        // the same to Mastercard" and Bitrix's absent-chooser both need
        // handling without a keyword whack-a-mole. requiredTokenGroups
        // encodes the compound intent; distinctive single tokens are
        // dropped because none of them, alone, is either specific enough
        // to avoid false positives (e.g. "option") or general enough to
        // cover the phrasing space (e.g. "at the option").
        requiredTokenGroups: [
          [
            "option",
            "choice",
            "discretion",
            "elect",
            "instruct",
            "direct",
            "request",
          ],
          ["delete", "erase", "destroy"],
          ["return", "export", "hand over", "provide a copy"],
          [
            "personal data",
            "the data",
            "customer data",
            "copies",
            "information",
          ],
        ],
      },
      {
        elementId: "G2",
        proposition: "The processor is obligated to delete on request.",
        kind: "alternative",
        proofGuidance: "A deletion obligation triggered at the end of services or on request.",
        nonProofTraps: [
          "A permission to delete rather than an obligation.",
          "A discretion to retain 'for legitimate business purposes' with no boundary.",
        ],
        remediationGuidance: "Convert the retention discretion into a deletion obligation.",
        version: ELEMENT_VERSION,
        distinctiveTokens: ["delet", "erase", "destroy"],
      },
      {
        elementId: "G3",
        proposition: "The processor is obligated to return on request.",
        kind: "alternative",
        proofGuidance: "A return / export obligation triggered at the end of services or on request.",
        nonProofTraps: ["A migration-services offer priced separately, without an obligation."],
        remediationGuidance:
          "Add a return obligation (format specified where reasonable).",
        version: ELEMENT_VERSION,
        // A return obligation must (a) actually mention return/export/hand-over
        // and (b) reference data/copies/personal data — not just "return to
        // service" or "return of investment". Compound gate closes the second
        // constraint without over-tightening the first.
        distinctiveTokens: [
          "return",
          "return or delete",
          "return or destroy",
          "return and delete",
          "shall return",
          "must return",
          "return all",
          "return of",
          "return the",
          "return personal data",
          "return the data",
          "export the",
          "export of",
          "provide a copy",
          "hand over",
          "returning",
        ],
        requiredTokenGroups: [
          ["return", "export", "hand over", "provide a copy"],
          ["personal data", "the data", "customer data", "copies", "information", "materials"],
        ],
      },
      {
        elementId: "G4",
        proposition:
          "The processor deletes existing copies unless Union or Member State law requires storage.",
        kind: "mandatory",
        proofGuidance:
          "The 28(3)(g) closing proviso — retention only where required by law, with the residual data still subject to processor obligations.",
        nonProofTraps: [
          "Retention for 'business continuity' or 'audit' without a legal basis.",
        ],
        remediationGuidance:
          "Add the closing proviso limiting retention to legally required cases.",
        version: ELEMENT_VERSION,
        // The closing proviso is the intersection of THREE ideas: an
        // exception word, a retention/storage word, and a legal-basis word.
        // Any one of them alone appears in dozens of unrelated clauses
        // (a deletion-only clause typically says "unless the parties agree",
        // "the term of this Agreement", "as required by law", …) and was
        // firing G4=supported falsely. requiredTokenGroups forces the
        // intersection.
        //
        // No `distinctiveTokens` here on purpose — real DPAs phrase the
        // proviso many different ways ("unless applicable local law requires
        // storage", "unless any applicable law requires storage", "except to
        // the extent required to retain by law"). Any authored phrase list
        // stops matching one of them. The three-group compound gate below IS
        // the precise definition and does not need a redundant single-token
        // pre-filter.
        requiredTokenGroups: [
          ["unless", "except", "save", "provided that", "to the extent"],
          [
            "retain",
            "retention",
            "store",
            "storage",
            "keep",
            "maintain",
            "hold",
            "preserve",
          ],
          [
            "law",
            "laws",
            "statute",
            "statutory",
            "regulation",
            "regulatory",
            "legal obligation",
            "member state",
            "union law",
            "applicable law",
          ],
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
];

/**
 * Look up the element schema for a resolved canonical requirement key.
 * Matches (in order): `canonicalKey` → `requirementUid` → `aliases[]` →
 * loose equivalence with underscore/dot normalization.
 *
 * A registry index would be faster but the registry is tiny (~8 entries) and
 * a scan makes the alias precedence auditable.
 */
export function elementSchemaFor(
  canonicalKey: string
): RequirementElementSchema | undefined {
  if (!canonicalKey) return undefined;
  const key = canonicalKey.trim();
  const loose = looseKey(key);
  for (const s of ARTICLE_28_ELEMENT_REGISTRY) {
    if (s.canonicalKey === key) return s;
    if (s.requirementUid === key) return s;
    if (s.aliases?.some((a) => a === key)) return s;
  }
  for (const s of ARTICLE_28_ELEMENT_REGISTRY) {
    if (looseKey(s.canonicalKey) === loose) return s;
    if (looseKey(s.requirementUid) === loose) return s;
    if (s.aliases?.some((a) => looseKey(a) === loose)) return s;
  }
  return undefined;
}

function looseKey(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * GENERAL-PURPOSE FALLBACK — auto-derive a one-element schema from whatever a
 * skill's own `requirementEvidence` (hypothesis / proofStandard /
 * evidenceHints) already authors for a requirement, with NO hand-typed
 * per-regime entry required.
 *
 * Why this exists: `ARTICLE_28_ELEMENT_REGISTRY` only covers the 8 GDPR
 * Article 28 requirements that got full legal-element decomposition. Every
 * other authored regime (international transfers / SCCs / Schrems II, NDA,
 * and any future pack) already carries `hypothesis` + `proofStandard` +
 * `evidenceHints` per requirement in its own skill.config.ts — the same
 * authoring surface product/legal already uses for `evaluate_package`'s
 * per-candidate VERIFY path. Deriving a schema from that data means Phase
 * 4B/5/6/7 cover every regime that authors evidence profiles TODAY, and any
 * new regime the moment its skill config authors them — no parallel
 * TypeScript element registry to hand-maintain per regime, consistent with
 * this project's standing rule against hand-maintained lookup tables as the
 * mechanism of correctness.
 *
 * The result is deliberately coarser than a hand-authored schema: one
 * element (`E1`), AND aggregation, no non-proof traps, and `evidenceHints`
 * used as a soft `distinctiveTokens` OR-gate (not the compound AND-group
 * precision hand-tuning gave Article 28(3)(g)). It's a real, auditable
 * schema — not a placeholder — but `reviewStatus: "auto_derived"` keeps it
 * honestly distinguishable from `"authored"` / `"legal_reviewed"` everywhere
 * it's logged (registry, verify, assess, lock, render events all pass
 * `reviewStatus` through unchanged).
 */
export function synthesizeElementSchemaFromProfile(
  nativeRequirementId: string,
  canonicalKey: string,
  profile: { hypothesis?: string; proofStandard?: string; evidenceHints?: string[] }
): RequirementElementSchema | undefined {
  const proposition = (profile.hypothesis ?? profile.proofStandard ?? "").trim();
  if (!proposition) return undefined; // nothing authored — genuinely nothing to verify against
  const proofGuidance = (profile.proofStandard ?? profile.hypothesis ?? "").trim();
  const hints = (profile.evidenceHints ?? []).map((h) => h.trim()).filter(Boolean);
  const title = proposition.length > 90 ? `${proposition.slice(0, 87)}...` : proposition;

  return {
    requirementUid: nativeRequirementId,
    canonicalKey,
    legalCitation: nativeRequirementId,
    title,
    aggregationRule: "AND",
    elements: [
      {
        elementId: "E1",
        proposition,
        kind: "mandatory",
        proofGuidance: proofGuidance || proposition,
        nonProofTraps: [],
        remediationGuidance: `Add or clarify contract language establishing: ${proposition}`,
        version: "auto-0.1.0",
        distinctiveTokens: hints.length > 0 ? hints : undefined,
      },
    ],
    version: "auto-0.1.0",
    reviewStatus: "auto_derived",
  };
}

/**
 * Full resolution ladder for a requirement's element schema:
 *   1. Hand-authored registry entry (`elementSchemaFor`) — highest precision.
 *   2. Auto-derived from the skill's own authored evidence profile — general
 *      coverage for every regime that authors `hypothesis`/`proofStandard`.
 *   3. `undefined` — the package authored nothing verifiable for this
 *      requirement; correctly stays outside Phase 4B/5/6/7 scope rather than
 *      fabricating a schema from nothing.
 */
export function resolveElementSchema(
  nativeRequirementId: string,
  canonicalKey: string,
  profile?: { hypothesis?: string; proofStandard?: string; evidenceHints?: string[] }
): RequirementElementSchema | undefined {
  const authored = elementSchemaFor(canonicalKey) ?? elementSchemaFor(nativeRequirementId);
  if (authored) return authored;
  if (!profile) return undefined;
  return synthesizeElementSchemaFromProfile(nativeRequirementId, canonicalKey, profile);
}
