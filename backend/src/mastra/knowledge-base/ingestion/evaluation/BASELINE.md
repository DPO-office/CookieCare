# Phase 0 component baseline

Recorded 9 October 2026. Repeat with `npm run kb:evaluate`; the machine-readable reference report is [baseline.json](baseline.json).

| Component | Current evidence | What it proves |
| --- | --- | --- |
| Contracts and source links | Dedicated unit tests and strict module type checking | Invalid versions, references, quotes, coverage and vector shapes are rejected. |
| Prepared evaluation collection | 12 cases, 11 source families; 2 GDPR cases, 7 layout cases, 2 damaged-input cases, 1 unsupported-input case | Developer-prepared examples can be evaluated repeatedly. Most source families are synthetic. |
| Reference self-check | 360 artifact checks, no mismatches | The expected artifacts satisfy the current evaluation contract; this does not measure parser or model accuracy. |
| Human legal review | 0 human-checked cases | Expected interpretations remain review-required. |
| Data splits | 12 development, 0 calibration, 0 held-out | Split protection is implemented; independent qualification data is missing. |
| Authored profile comparison | 14 Article 28 rules from GDPR skill version 2.0.1, profile version 1.1.0 | Serializable rule content and provenance are preserved; all declared statuses remain authored. |
| Provision reconstruction/extraction | Not run on an original pilot PDF | No PDF completeness or extraction-quality claim. |
| Legal-rule and evidence retrieval/embeddings | Not benchmarked | No selected KB embedding configuration or measured retrieval quality. |
| Storage, migration, access, recovery and publication | Later phases | No deployed KB or end-to-end qualification claim. |

Initial critical-error budget: zero for every represented category, provisional and unvalidated. Numeric text/reconstruction/retrieval limits must be recorded after human review and threshold calibration. A new critical error is a regression even when another error was fixed.

Before declaring all of Phase 0 complete, obtain the actual GDPR pilot PDF and varied source documents, verify page/fragment locations and expected legal interpretations, populate independent calibration and held-out source families, measure existing component behavior and benchmark embeddings on labelled legal-rule and contract-evidence queries. Then confirm deployment prerequisites. Later release gates include server access, publication integrity, failure recovery and consumer tests.
