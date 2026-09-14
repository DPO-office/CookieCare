# How Legal AI Products Verify Contract Evidence Against Rules

## Executive conclusion

Public evidence supports a clear market pattern:

> **Structured legal standards or playbooks → semantic retrieval and reasoning over the contract → exact source traceability → deterministic output validation and/or a second review pass → human escalation where uncertainty remains.**

The storage format varies—skills, playbooks, policy libraries, curated legal corpora, or internal databases—but the important architectural object is the same: a **versioned, reviewable rule containing legal meaning and the standard for judging evidence**.

The leading vendors do not publicly describe keyword scoring as the final legal judge. Exact matching is sometimes used as a fast first stage, but semantic models or agents decide whether the contractual language satisfies the standard. Nor does the public evidence support a single unconstrained LLM call whose answer automatically becomes canonical. The more mature disclosed systems add citation checking, adversarial review, cross-rule reconciliation, evaluation datasets, and human review.

For CookieCare, the proposed atomic-rule skill design is directionally strong. It is not excessive merely because each rule contains multiple fields. Those fields encode distinct controls required for reliable routing, investigation, verification, and explainability. The design should, however, distinguish:

1. **Authoritative legal content** maintained by lawyers.
2. **Generated candidate metadata** extracted from source law, guidance, templates, and precedents.
3. **Runtime context** derived from the user instruction and transaction.
4. **Verification results** produced for a particular document.

The legal team should not be expected to hand-author every field. A source-ingestion pipeline can propose atomic rules and metadata from PDFs, but lawyers must approve legal propositions, applicability, proof elements, relationships, and acceptable deviations before publication.

## What is publicly known—and what is not

Competitors generally publish workflow descriptions, playbook structures, source-grounding features, and evaluation claims. They do **not** usually publish their complete prompts, schemas, retrieval indexes, model-routing logic, or hard validators. Therefore:

- Statements below labeled **disclosed** come directly from vendor documentation.
- Statements labeled **inference** are architectural interpretations of those disclosed product behaviors.
- No claim is made that a competitor uses exactly the same internal schema or sequence as CookieCare.

## Comparative findings

| Vendor | Baseline representation | Evidence application | Verification or quality controls | Main lesson |
|---|---|---|---|---|
| Lexlegis | Versioned legal skills and curated legal corpus | Retrieval-first reasoning; substantive claims grounded in passages | Citation verification, cross-validation, evidence mapping, adversarial testing, confidence calibration, audit trail, human escalation | Verification is a separate meta-reasoning layer, not just the original answer |
| GC AI | Structured playbooks created manually or from uploaded policies/templates | Substance-based comparison; exact wording only when required; deal context affects outcomes | Verbatim “Exact Quote” traceability; users calibrate playbooks against manually reviewed contracts | Separate policy meaning from dynamic transaction context |
| Harvey | Rule-based playbooks built from standards, templates, and precedents | One worker agent per rule can search the agreement and referenced documents, classify, and draft edits | Lead-agent completeness review, versioned worker branches, reconciliation, final quality pass, lawyer-built evals | Parallel per-rule reasoning plus cross-rule reconciliation is stronger than isolated checks |
| Ivo | Playbooks plus prior negotiated contracts | Coordinated review across clauses using deal and historical context | Similar-agreement filtering and contextual fallback selection | Static clause-by-clause rules alone miss interaction and negotiation context |
| LegalOn | Attorney-built and customer-specific playbooks; AI conversion from existing materials | Contract checked against selected rules, roles, and jurisdictions | Generated rules reviewed beside their source references before publication; clickable contract references | AI can bootstrap rules, but source-linked lawyer approval remains important |
| Spellbook | Rules/questions generated from model documents, prose, or selected text | Automated review with party/jurisdiction/instruction context | Passed/failed result, AI reasoning, numbered document references, user review before publishing rules | The baseline can be generated, but it becomes controlled structured data before use |
| Ironclad | Preferred/fallback positions and trigger rules | Exact position matching first; AI clause-type detection if exact matching fails | Manual review and approver workflows | Deterministic checks are useful as gates, not sufficient legal judgment |
| CoCounsel | User policies plus authoritative and organizational knowledge sources | Finds relevant clauses and conflicts, explains differences, proposes revisions | Findings traceable to source/page; grounded retrieval | Claim-to-source traceability is a product requirement |
| Luminance | Playbooks and tagged clause examples | Traffic-light compliance/risk analysis | Legal analysts tag examples and maintain gold-standard Q&A evaluation sets | Reliable systems need maintained legal evaluation data, not only prompts |

## Vendor details

### Lexlegis: closest to a skill-first legal architecture

Lexlegis describes a skill as a structured input, clarifying interface, defined output, constrained authorities, and defined evaluation standard. Skills are versioned, evaluated, deprecated, and domain-tagged.[^1] Its MIRA system publicly describes 215 skills and a nine-skill meta-reasoning layer for citation verification, cross-validation, evidence mapping, adversarial testing, and confidence calibration.[^2]

Its verification workflow uses four checkpoints:[^3]

1. Validate input integrity, jurisdiction, facts, procedural posture, scope, and ambiguities.
2. Retrieve from a curated, tagged corpus and check current authority status.
3. Require substantive claims to be grounded in retrieved passages, test coherence and counterarguments, and calibrate confidence.
4. Verify citations, factual details, and correspondence between the answer and its reasoning chain; repair, refuse, or escalate where necessary.

Lexlegis also describes retrieval-first/reason-second operation, a closed curated corpus, structured uncertainty, and an audit trail.[^4]

**Meaning for CookieCare:** a skills folder can legitimately be the single source of legal truth, but the verification architecture still benefits from a distinct meta-layer. “One source of truth” does not mean “one prompt” or “one model pass.”

### GC AI: playbook substance plus dynamic deal context

GC AI defines playbooks as structured standards, preferred positions, fallback positions, and negotiation considerations. Reviews yield Pass, Fallback, or Flag outcomes.[^5] A user can upload existing policies, templates, or documents and convert them into a structured playbook, then edit and refine it.[^6]

GC AI explicitly says a contract need not contain exact playbook language: the system judges the substance and concept unless the playbook requires exact wording.[^6] At runtime, the user can provide context such as whose paper is under review, deal value, leverage, urgency, and business concerns.[^7] The company also describes “Exact Quote” attribution that anchors a finding to verbatim contract language and recommends calibrating a playbook against several manually reviewed contracts.[^8]

**Meaning for CookieCare:** dynamic context should modify applicability, acceptable deviations, risk treatment, and report emphasis. It should not rewrite the statutory proposition or proof standard. The verifier should return both the legal result and the instruction-specific reasoning needed by reporting.

### Harvey: the most detailed public verification architecture

Harvey’s September 2026 technical description is unusually concrete. It explains that its earlier playbook review used a fixed prompt waterfall: one model checked the standard position, then acceptable deviations, then unacceptable deviations; separate calls retrieved support, summarized findings, and drafted redlines. Harvey says this was predictable but lost context and produced conflicting edits when rules were analyzed in isolation.[^9]

Its rebuilt system uses a lead agent and many parallel worker agents, normally one per rule. Each worker can read and search the agreement, follow referenced exhibits, select the relevant standard or fallback, decide compliance, and draft an edit. Document components have unique IDs for citation and editing. Each worker writes a short memo containing classification, rationale, and edits on a versioned branch. The lead agent ensures every rule was considered, reconciles conflicts, and performs a final quality pass.[^9]

Shared context includes represented party, whose paper is being reviewed, strictness, deal instructions, and relevant precedents. Harvey reports lawyer-built evaluation corpora and rubric-based judging for risk classification and redlines. Its vendor-reported redesign improved risk-classification scores from 59% to 77% and redline scores from 53% to 87%, with higher latency.[^9]

Harvey’s Playbook Builder extracts proposed rules from standards, contracts, templates, and prior documents, attaches source citations, and lets lawyers refine positions, fallbacks, actions, conditions, and escalation paths.[^10]

**Meaning for CookieCare:** per-rule verification is a sound unit of work, but it needs a final cross-rule reconciliation layer. Otherwise separately correct checks can produce an incoherent overall assessment or report.

### Ivo: coordinated review rather than static independent checks

Ivo argues that traditional playbooks are too static and clause-specific. Its newer review applies playbook guidance across related clauses, uses historical executed agreements and negotiation outcomes, and filters precedents by attributes such as contract type, governing law, party role, and industry.[^11] Runtime deal significance also affects fallback selection.[^12]

**Meaning for CookieCare:** atomic rules should remain canonical, but related rules need explicit relationships and a reconciliation phase. Contextual commercial acceptability must remain separate from statutory completeness.

### LegalOn and Spellbook: AI-assisted rule extraction with human publication

LegalOn’s Playbook Agent converts standards, templates, checklists, spreadsheets, notes, training materials, and prior redlines into a structured playbook. The generated rules are shown alongside source references for review and editing before publication.[^13] LegalOn also offers attorney-built playbooks that vary by party role and jurisdiction and describe preferred positions, fallback language, and risk tolerance.[^14]

Spellbook similarly generates playbooks from PDF or Word model documents, prose descriptions, highlighted contract text, or prebuilt templates. Users review generated rules before publishing. Rules may include fallback language, risk, internal notes, approvers, party, and jurisdiction.[^15] Its review results provide pass/fail status, reasoning, and numbered references linking back to document locations.[^16]

**Meaning for CookieCare:** legal-source ingestion is feasible, but the output should be a draft rule set, not automatically trusted law. The extraction pipeline can populate most fields, score confidence, and identify omissions; legal approval creates the authoritative version.

### Ironclad: where deterministic logic still belongs

Ironclad publicly describes a cascade in which exact preferred or fallback language is matched first. When no exact match exists, AI clause-type detection is used, followed by configured trigger rules and human/approver workflows.[^17]

**Meaning for CookieCare:** deterministic verification is valuable for exact citations, exact phrases, scope incompatibility, quote validation, ID integrity, and known disqualifiers. It should not be the canonical semantic judge. Rename or redesign it as a **pre-check/validator** rather than presenting it as an alternative legal verifier.

### CoCounsel and Luminance: grounding and evaluations

CoCounsel’s Contract Policy Compliance workflow accepts policies and contracts, finds relevant clauses and conflicts, explains differences, and proposes revised language. Its broader document-analysis product emphasizes findings traceable to source pages and retrieval grounded in authoritative and organizational sources.[^18]

Luminance describes legal analysts building playbooks, tagging clauses as compliant or risky, and creating gold-standard question-and-answer datasets to compare system outputs.[^19]

**Meaning for CookieCare:** exact traceability is necessary but does not prove the reasoning is correct. A reviewed evaluation corpus covering paraphrases, traps, omissions, negation, scope conflicts, and dependencies is the actual promotion gate.

## Are competitors “taking chunks of baseline rules” and checking evidence?

Functionally, yes—but “chunks” understates what the mature systems store.

They typically represent some combination of:

- A legal or policy proposition.
- Preferred, acceptable, and prohibited positions.
- Applicability conditions and party perspective.
- Guidance, fallback language, actions, and escalation paths.
- Source authority or source-document citations.
- Examples, precedents, or tagged clauses.
- Evaluation criteria.

At runtime, they retrieve contract text relevant to that rule and ask a semantic system to classify or reason about satisfaction. The output is then tied back to exact text. The strongest disclosed systems add either a meta-verifier, a lead/reconciliation agent, hard validators, or human review.

There is no evidence that leading vendors re-read an unstructured statute PDF from scratch for every contract review. That would be slower, less reproducible, difficult to test, and vulnerable to authority-version drift. Source PDFs are better treated as **inputs to a controlled rule-authoring pipeline**. Published rules are then versioned and linked back to exact source provisions.

## Is the proposed atomic rule contract too large?

Not inherently. The current fields fall into necessary categories:

| Category | Purpose | Authoring approach |
|---|---|---|
| Identity and authority | Stable legal identity and traceability | Extract automatically; lawyer confirms |
| Selection metadata | Find the correct rules for user instructions | Generate automatically; refine using routing evals |
| Applicability | Prevent actor, jurisdiction, and document-type mistakes | Generate, but require lawyer approval where material |
| Investigation guidance | Retrieve evidence and define what counts as proof | Generate candidate content; lawyer approves proposition and required elements |
| Relationships | Dependencies and related obligations | Generate candidates from citations and structure; lawyer approves |
| Legacy compatibility | Temporary migration support | Generate mechanically; delete after migration |

The main optimization is not to remove legal structure. It is to avoid treating every field as equally hand-authored or equally authoritative.

Recommended provenance states:

```text
generated_draft → lawyer_reviewed → published → superseded
```

Every field should record its source and confidence. A lawyer reviewing a generated rule should see the exact source passage next to the proposed proposition, applicability, and proof elements.

## Recommended CookieCare verification architecture

```text
Published atomic rules in skills
        +
User instruction facets and deal context
        ↓
PLAN selects exact rule IDs and records unresolved facets
        ↓
Investigation retrieves scoped contract evidence
        ↓
Per-rule semantic verifier
  - element verdicts
  - exact evidence quotes/IDs
  - evidence role: primary/supporting/context/conflicting
  - rationale and missing facts
  - unresolved dependencies
  - counterargument and calibrated confidence
        ↓
Deterministic integrity validator
  - valid rule and evidence IDs
  - exact-substring quotes
  - complete element coverage
  - allowed states
  - scope compatibility
        ↓
Targeted adversarial review for high-risk or uncertain results
        ↓
Cross-rule reconciliation and coverage audit
        ↓
Assessment separates legal status, evidence completeness,
policy alignment, negotiation acceptability, and report emphasis
        ↓
Claim-to-evidence verification of the final report
```

### What to do with the existing deterministic verifier

Do not make its lexical score the canonical legal decision. Keep the valuable deterministic functions and move them into three roles:

1. **Pre-check:** exact phrase hits, explicit exclusions, scope gates, applicability triggers, and dependency references.
2. **Fallback triage:** produce a visibly untrusted provisional matrix only when the semantic verifier is unavailable.
3. **Post-validation:** prove that IDs, quotations, matrix coverage, state values, and scopes are structurally valid.

Lexical signals can also route ambiguous or high-risk items to an additional review pass, but a score such as `>= 2` should not itself mean legally supported.

### Dynamic factors to add

PLAN should create a separate, typed runtime context rather than modifying the legal rule:

- User-request facets and exact source text.
- Represented party and actor perspective.
- Document type and relationship scope.
- Jurisdiction and governing-law context.
- Deal value, risk tolerance, leverage, and review strictness where supplied.
- Requested operations: compliance conclusion, negotiation advice, redline, executive report, or evidence inventory.
- Report audience, materiality, and emphasis.
- Explicit exclusions and contextual-only legal references.

The verifier should return instruction-linked facts and gaps so reporting is tailored. But the system must keep these decisions distinct:

| Decision | Question |
|---|---|
| Legal completeness | Does the agreement prove every required legal element? |
| Evidence completeness | Did the retrieved bundle contain enough text to decide? |
| Policy alignment | Does it satisfy the organization’s preferred position? |
| Negotiation acceptability | Is a fallback acceptable for this deal? |
| Reporting priority | What matters to this user and audience? |

Combining these into one `supported/gap` label creates misleading results.

## PDF-to-skill authoring pipeline

The legal team can upload authoritative PDFs and produce most of the rule structure automatically:

1. Ingest and identify instrument, version, jurisdiction, and authority level.
2. Parse headings, articles, paragraphs, subparagraphs, definitions, exceptions, and cross-references.
3. Propose atomic propositions and split independently verifiable limbs.
4. Generate authority metadata, aliases, concepts, actors, actions, objects, applicability, evidence hints, proof elements, and relationships.
5. Retrieve the exact source passages for every generated field.
6. Run structural validators and a second model critique for missed exceptions, scope, and dependencies.
7. Present a lawyer approval interface with source text and proposed rule side by side.
8. Publish a versioned skill only after approval.
9. Generate routing, retrieval, and verification test cases from the approved rule.
10. Monitor law changes and mark affected rules for review rather than silently rewriting them.

Automation can dramatically reduce authoring effort, but it cannot safely eliminate legal review. Extraction errors at this layer propagate to every later contract assessment.

## Practical decision

CookieCare should proceed with the rule-first migration, with four adjustments:

1. Make atomic rules the legal source of truth, but add per-field provenance and lifecycle state.
2. Replace “deterministic verify” with deterministic pre-check and hard validation; use semantic verification as the legal judgment.
3. Add a targeted adversarial pass and cross-rule reconciliation before assessment.
4. Build the lawyer PDF-to-skill workflow as a generated-draft-and-approval system, backed by a rule-level evaluation corpus.

This is not merely copying the market. It combines the strongest publicly disclosed patterns: Lexlegis-style meta-verification, GC AI-style context, Harvey-style per-rule agents and reconciliation, LegalOn/Spellbook-style source-linked rule generation, and Luminance-style lawyer-maintained evaluations.

## Sources

[^1]: Lexlegis, [Skill-Configurable AI](https://help.lexlegis.ai/hc/en-in/articles/27193303792668-Skill-Configurable-AI).
[^2]: Lexlegis, [Inside MIRA](https://help.lexlegis.ai/hc/en-in/articles/27193246874396-Inside-MIRA).
[^3]: Lexlegis, [From Hallucination to Verification](https://help.lexlegis.ai/hc/en-in/articles/27193282386716-From-Hallucination-to-Verification).
[^4]: Lexlegis, [Verification Debt](https://help.lexlegis.ai/hc/en-in/articles/27357137661724-Verification-Debt-The-Hidden-Cost-of-Legal-AI-That-Nobody-Is-Talking-About).
[^5]: GC AI, [About Playbooks](https://docs.gc.ai/about/playbooks).
[^6]: GC AI, [Playbooks FAQ](https://docs.gc.ai/guides/playbooks/faq).
[^7]: GC AI, [Running Playbooks](https://docs.gc.ai/guides/playbooks/running-playbooks).
[^8]: GC AI, [AI Contract Playbook](https://gc.ai/blog/ai-contract-playbook).
[^9]: Harvey, [Rebuilding Playbook Review as a Multi-Agent System](https://www.harvey.ai/blog/rebuilding-playbook-review-as-a-multi-agent-system).
[^10]: Harvey, [Playbook Builder in Harvey](https://www.harvey.ai/blog/playbook-builder-in-harvey).
[^11]: Ivo, [Introducing Review 2.0](https://www.ivo.ai/blog/introducing-review-2-0-contract-review-that-knows-what-your-team-has-agreed-to).
[^12]: Ivo, [Product Overview](https://www.ivo.ai/).
[^13]: LegalOn, [Meet Playbook Agent](https://www.legalontech.com/post/meet-playbook-agent-scale-your-legal-expertise-with-ai).
[^14]: LegalOn, [Contract Playbooks](https://us-direct.legalontech.com/contract-playbooks).
[^15]: Spellbook, [Create Playbooks](https://help.spellbook.legal/en/articles/11327030-create-playbooks).
[^16]: Spellbook, [Playbooks Overview](https://help.spellbook.legal/en/articles/9926250-playbooks-overview).
[^17]: Ironclad, [AI Playbooks Overview](https://support.ironcladapp.com/hc/en-us/articles/12275685560215-Ironclad-AI-Playbooks-Overview).
[^18]: Thomson Reuters, [Contract Policy Compliance](https://www.thomsonreuters.com/en-us/help/cocounsel/skills/understanding-cocounsel-skills/about-contract-policy-compliance) and [CoCounsel Legal Features](https://legal.thomsonreuters.com/en/products/cocounsel-legal/features).
[^19]: Luminance, [A Day in the Life of a Legal Analyst Lead](https://www.luminance.com/resources/blog/a-day-in-the-life-madina-mujadidi-legal-analyst-lead/).

### Independent research context

The EACL 2026 paper [Better Call CLAUSE](https://aclanthology.org/2026.findings-eacl.305/) reports a benchmark of 7,500 perturbed contracts across ten anomaly types, validated against statutes using retrieval-augmented methods. Leading models still missed subtle legal errors and struggled to justify conclusions. This supports adversarial testing, grounded evaluation, and conservative escalation rather than one-pass model trust.
