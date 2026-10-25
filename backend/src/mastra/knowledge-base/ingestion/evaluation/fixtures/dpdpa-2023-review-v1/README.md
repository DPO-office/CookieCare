# DPDP Act 2023 ingestion evaluation draft

This development fixture is tied to the user's 21-page Gazette PDF, SHA-256
`4deb23981d3010c8225a2ff6149e7243dc2268455b299e283afebdd7b72a7d15`.
It contains 19 detailed cases across S1–S7. It is **not** a whole-Act reference
answer or a statement of current law. All expected answers need human legal
review before they can serve as a release gate.

Open [review.html](review.html) to inspect each case beside its original PDF
passages. [dataset.json](dataset.json) contains the expected answers and
forbidden errors. [source-passages.json](source-passages.json) stores the cited
passages, their physical pages, and separate Schedule table cells. [pages.json](pages.json)
stores the raw extraction of all 21 pages for audit. [validation-report.json](validation-report.json)
records automatic checks of source anchors and graph-edge wording.

The selected graph scopes are Section 8 (all eleven subsections and its lettered
points, shared text and illustrations), Section 9 (children), Section 17
(exemptions and exceptions), and Section 33 with all seven Schedule rows.
The document-map check locates the start of all 44 sections and nine chapters;
it does not claim to verify the full text of every section. Cross-page checks
include Sections 8(7) and 33(1). Explicit links, defined-term
links, external unresolved links, and multi-hop paths have distinct relation
labels. For example, Schedule row 6 cites Section 32 for the undertaking and
Section 28 for the underlying proceedings; those links have different roles.

Regenerate with `python backend/scripts/build-dpdpa-gold.py --pdf <path-to-exact-pdf>`
from the repository root, using Python with `pdfplumber`. The script rejects a
different PDF hash. The regeneration script itself also checks that each selected
graph node is present in its cited source passage and each graph-edge anchor
appears in the originating passage. These checks cannot establish that every
legal interpretation is correct; the HTML review is still needed.

To score a saved ingestion run, set its `artifacts` and each case's
`evidence_refs` in a copy of [run-results.template.json](run-results.template.json),
then run `npm run kb:evaluate-dataset -- --dataset <dataset.json> --source-pack
<source-passages.json> --pdf <source-pdf> --run <saved-run.json> --output
<report.json>` from `backend`. The evaluator checks the PDF hash and compares
each case with saved output. A case with no saved evidence stays `not_run`.
The Mastra `kb-dpdpa-review-case-v1` workflow uses the same fixture and scorer;
set `KB_EVAL_RUN_PATH` to a frozen run before launching a Studio experiment.
Its default run template intentionally produces `not_run`, never a pass.

For this fixture, the source is the original 2023 Act publication. Section 1(2)
requires separate commencement notifications; later Rules, notifications,
amendments, and any consolidated edition must be ingested and versioned
separately before the KB can answer current-law questions.
