# CookieCare Analysis Skills — Legal Team Brief

**Purpose:** We need your legal expertise to rewrite the review rules that power our contract analysis system. The current drafts were written without deep legal knowledge and must be replaced with accurate, lawyer-authored content.

**What you deliver:** One structured document per skill (see format below). We will load these directly into the system.

---

## How the system works (big picture)

When someone uploads a contract and asks for a review, the system picks the right **skills** — like specialist playbooks — and checks the document against them.

```
                    ┌─────────────────────────────┐
                    │   User uploads a contract   │
                    │   + asks what to review     │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   System selects skills     │
                    │   (one or more playbooks)   │
                    └──────────────┬──────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
  │  Document    │        │  Law /       │        │  Topic       │
  │  type skill  │   +    │  regime skill│   +    │  skill       │
  │  (e.g. NDA)  │        │  (e.g. GDPR) │        │  (e.g. cyber)│
  └──────────────┘        └──────────────┘        └──────────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Review report with        │
                    │   findings and gaps         │
                    └─────────────────────────────┘
```

A **global baseline skill** always runs underneath — it covers standard commercial clauses (liability, indemnity, termination, etc.) that apply to almost every contract.

---

## The five skill categories (umbrella view)

Think of skills as layers. They stack on top of each other.

```
┌─────────────────────────────────────────────────────────────────┐
│  1. GLOBAL — applies to every contract                          │
│     General commercial review (liability, indemnity, etc.)      │
├─────────────────────────────────────────────────────────────────┤
│  2. DOCUMENT TYPE — what kind of contract is this?              │
│     NDA · MSA · DPA · SaaS · Vendor · Employment · Commercial  │
├─────────────────────────────────────────────────────────────────┤
│  3. LAW / REGIME — which law or regulation applies?             │
│     GDPR · UK GDPR · CCPA · International transfers ·          │
│     EU AI Act · HIPAA                                          │
├─────────────────────────────────────────────────────────────────┤
│  4. JURISDICTION — which country's rules matter?                │
│     England & Wales · Ireland · California · Delaware           │
├─────────────────────────────────────────────────────────────────┤
│  5. TOPIC — cross-cutting specialist areas                      │
│     Cybersecurity & incident response · Vendor risk & diligence │
└─────────────────────────────────────────────────────────────────┘
```

---

## Complete list of skills we need from you

Every item below needs a full rewrite. Status today: **draft / placeholder — not legally reviewed.**

### 1. Global (always active)

| Skill name | What it covers |
|---|---|
| **General Contract Review** | Liability caps, indemnity, termination, governing law, and other standard commercial clauses |

### 2. Document types

| Skill name | What it covers |
|---|---|
| **Non-Disclosure Agreement (NDA)** | Confidentiality definition, purpose limitation, return/destruction, term & survival, governing law |
| **Data Processing Agreement (DPA)** | Document structure: processing details, subprocessors, deletion, transfer mechanism, security |
| **Master Services Agreement (MSA)** | SOW hierarchy, acceptance, IP ownership, liability baseline |
| **SaaS / Subscription Agreement** | Subscription terms, SLA, uptime, data handling, termination |
| **Vendor / Procurement Agreement** | Procurement-specific obligations, service levels, audit rights |
| **Commercial Agreement** | General commercial terms (catch-all for B2B contracts) |
| **UK Employment — Statutory Particulars** | Written statement of employment/worker particulars (ERA 1996) |

### 3. Laws & regulations

| Skill name | What it covers |
|---|---|
| **EU GDPR** | Private-entity obligations and data-subject rights (Articles 1–99) |
| **UK GDPR / IDTA** | UK data protection overlay and International Data Transfer Agreement |
| **CCPA / CPRA** | California privacy — service-provider contract requirements |
| **International Data Transfers** | EU Standard Contractual Clauses and Schrems II operational requirements |
| **EU AI Act** | Private operator duties under the EU Artificial Intelligence Act |
| **HIPAA Business Associate Agreement** | US healthcare data — BAA requirements |

### 4. Jurisdictions

| Skill name | What it covers |
|---|---|
| **England & Wales** | Execution formalities, governing law, deed vs simple contract, witnessing |
| **Ireland** | Irish contract and execution requirements |
| **California** | California-specific contract rules |
| **Delaware** | Delaware-specific contract rules |

### 5. Topics

| Skill name | What it covers |
|---|---|
| **Cybersecurity & Incident Response** | NIS2 duties, incident reporting timelines, security measures |
| **Vendor Risk & Diligence** | Outsourcing risk, due diligence, third-party oversight |

**Total: 20 skills** (1 global + 7 document types + 6 laws + 4 jurisdictions + 2 topics)

---

## What to write for each skill

Deliver **one document per skill** using the structure below. Name the file exactly as shown in the delivery table at the end.

### Document structure (copy this template)

Every skill document must include these sections in order:

---

#### Section A — Title and scope

```
# [Skill name]

## Coverage
- What this skill covers and what it deliberately does NOT cover
- Which primary legal sources you relied on (statute, regulation, case law, playbook)
- Any important boundaries (e.g. "private entities only", "not public authorities")
```

#### Section B — How to review (for complex skills only)

For large skills like GDPR, add a short "how to analyse" section — the steps a reviewer should follow before applying individual rules.

```
## How to analyse
1. [First step — e.g. identify the party's role]
2. [Second step — e.g. check which rules are triggered]
3. ...
```

#### Section C — Clause types

For each important section or topic in the contract, describe what good looks like.

```
## clause:[short_name]
[Plain-English description of what this clause should contain and what to look for.]
```

**Example:**

```
## clause:confidentiality
Confidentiality obligations and how long they survive after the agreement ends.
Look for a clear definition, standard exclusions (public domain, independent development),
and a stated survival period.
```

#### Section D — Review rules

Each rule is a specific check the system performs. Write one block per rule.

```
## rule:[short_id]
[What to check. What counts as acceptable. What counts as a gap.
Include the legal citation where relevant.]
```

**Example:**

```
## rule:nda.return_or_destruction
The NDA should require return or destruction of confidential information on request
or when the purpose ends. A documented exception for legally required retention copies
is acceptable. Citation: standard NDA practice.
```

#### Section E — Risk findings

Each risk is a label for a gap the system reports to the user.

```
## risk:[short_id]
[One sentence describing the problem in plain English.]
```

**Example:**

```
## risk:nda_return_destruction_gap
No return or destruction obligation on expiry or request.
```

Always end with:

```
## risk:other_known_risk
Other material contractual risk not covered above.
```

---

### Optional extras (include where relevant)

| Extra | When to include | What to write |
|---|---|---|
| **Rights matrix rows** | GDPR-style skills with data-subject rights | Article number, plain-English label, what "covered" looks like |
| **Severity** | Missing-clause checks | Mark as high / medium / low importance |
| **Trigger phrases** | How users might ask for this review | e.g. "review this NDA", "GDPR compliance check" |
| **Related checks** | When one topic implies others | e.g. "if checking subprocessors, also check transfer mechanism" |

---

## Quality checklist

Before submitting each skill, confirm:

- [ ] **Scope is clear** — reader knows what is in and out
- [ ] **Sources are cited** — statute article, regulation section, or recognised playbook reference
- [ ] **Rules are actionable** — a reviewer (human or system) can apply them to a real document
- [ ] **Gaps are defined** — every rule has a matching risk label for when it fails
- [ ] **No invented law** — do not infer rules from recitals, guidance, or enforcement outcomes unless explicitly sourced
- [ ] **Plain English** — avoid internal system jargon; write as you would for a junior associate
- [ ] **Boundaries stated** — e.g. "employee-facing only", "service-provider contracts only", "England & Wales not Scotland"

---

## How to deliver

### Folder structure

Place each skill document in its matching folder:

```
skills/
├── _global/
│   └── SKILL.md                          ← General Contract Review
├── doc-types/
│   ├── nda/SKILL.md
│   ├── dpa/SKILL.md
│   ├── msa/SKILL.md
│   ├── saas-agreement/SKILL.md
│   ├── vendor-agreement/SKILL.md
│   ├── commercial-agreement/SKILL.md
│   └── employment-agreement/SKILL.md
├── regimes/
│   ├── data-protection/
│   │   ├── gdpr/SKILL.md
│   │   ├── uk-gdpr-idta/SKILL.md
│   │   ├── ccpa-cpra/SKILL.md
│   │   └── international-transfers/SKILL.md
│   ├── ai-governance/
│   │   └── eu-ai-act/SKILL.md
│   └── healthcare/
│       └── hipaa-baa/SKILL.md
├── jurisdictions/
│   ├── england-wales/SKILL.md
│   ├── ireland/SKILL.md
│   ├── california/SKILL.md
│   └── delaware/SKILL.md
└── topics/
    ├── cybersecurity-and-incident-response/SKILL.md
    └── vendor-risk-and-diligence/SKILL.md
```

### Naming rules

| Rule | Example |
|---|---|
| File name is always `SKILL.md` | Not "GDPR skill.docx" or "nda-review.md" |
| One file per skill | Do not combine NDA and MSA into one document |
| Use the exact folder names above | So we can drop files in without renaming |

### Reference examples

You can open the existing draft files as a starting point — they show the format but **the legal content needs a full rewrite**:

| Skill | Current draft location (for format reference only) |
|---|---|
| NDA | `doc-types/nda/SKILL.md` |
| GDPR | `regimes/data-protection/gdpr/SKILL.md` |
| DPA | `doc-types/dpa/SKILL.md` |
| England & Wales | `jurisdictions/england-wales/SKILL.md` |

---

## Priority order (suggested)

If you cannot do all 20 at once, this order gives the most value first:

```
Phase 1 (highest use)
  ├── General Contract Review
  ├── NDA
  ├── DPA
  └── EU GDPR

Phase 2
  ├── MSA
  ├── SaaS Agreement
  ├── UK GDPR / IDTA
  └── International Data Transfers

Phase 3
  ├── CCPA / CPRA
  ├── Vendor Agreement
  ├── Commercial Agreement
  └── England & Wales

Phase 4
  ├── EU AI Act
  ├── HIPAA BAA
  ├── Cybersecurity & Incident Response
  ├── Vendor Risk & Diligence
  ├── California · Delaware · Ireland
  └── UK Employment Particulars
```

---

## Questions?

If anything is unclear about scope, format, or which skill applies to a given document type, flag it before writing. It is better to confirm boundaries upfront than to rewrite later.

**Contact:** [Abhinav Yadav]


Demo:

**docs-type/dpa**

```
# DPA document-type skill (structure only)

## Scope
Data Processing Agreement document shape — annexes, subprocessors, deletion-on-termination,
transfer mechanism placeholders. Named-law (GDPR) content is in `regimes/data-protection/gdpr`.

## clause:data_protection
Core processing subject-matter, roles (controller/processor), and processor obligations annex.

## clause:subprocessor_flow_down
Subprocessor list exists as an annex and obligations flow down.

## clause:deletion_on_termination
Return or deletion of personal data on termination is addressed.

## clause:international_transfer_mechanism
A structural transfer / localization mechanism is present (law-agnostic).

## clause:security_dpia_assistance
Security / DPIA assistance language exists as a structural section.

## clause:limitation_of_liability
Limitation of liability section present in the DPA package.

## rule:dpa.subject_matter_defined
The agreement should state the subject matter of processing.

## rule:dpa.duration_defined
The agreement should state the duration of processing.

## rule:dpa.nature_and_purpose_defined
The agreement should state the nature and purpose of processing.

## rule:dpa.subprocessor_flowdown_present
The agreement should address subprocessors and flow-down of processor obligations.

## rule:dpa.deletion_on_termination_present
The agreement should address return or deletion of personal data on termination.

## rule:dpa.security_and_dpia_assistance_present
The agreement should include a security or DPIA-assistance section as a structural heading.

## rule:dpa.international_transfer_mechanism_present
The agreement should identify a cross-border transfer / localisation mechanism as a structural placeholder. This is not a GDPR Chapter V adequacy judgment.

## rule:dpa.confidentiality_of_staff_present
The agreement should address confidentiality of persons authorised to process personal data.

## risk:dpa_subject_matter_gap
The DPA does not define or annex the subject matter of processing.

## risk:dpa_duration_gap
The DPA does not state how long processing lasts.

## risk:dpa_nature_purpose_gap
The DPA does not describe the nature and purpose of processing.

## risk:dpa_subprocessor_gap
The DPA does not address subprocessors or flow-down of obligations.

## risk:dpa_deletion_gap
The DPA does not address return or deletion of personal data on termination.

## risk:dpa_security_assistance_gap
The DPA has no structural security or DPIA-assistance section.

## risk:dpa_transfer_mechanism_gap
The DPA does not identify a cross-border transfer / localisation mechanism.

## risk:dpa_staff_confidentiality_gap
The DPA does not address confidentiality of persons authorised to process.

## risk:missing_limitation_of_liability
No limitation of liability clause identified.

## risk:other_known_risk
Other material structural gap in the DPA package.

```