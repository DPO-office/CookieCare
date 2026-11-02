# CCPA ingestion evaluation draft

This development fixture is tied to the supplied 35-page California Legislative
Information printout, SHA-256
`c31e525e2e191a549f42384e9e6108d357a7fdf4c957f1469fc8aa9ebe735f9b`.
It contains 18 provisional cases across S1–S7. The source is a browser print
of California Civil Code Title 1.81.5 with a visible 20 August 2026 print
timestamp and per-section amendment notes. The print timestamp is not itself
an operative date for every provision.

The fixture checks all 46 displayed section headings, all 35 physical pages,
complete selected subgraphs for Sections 1798.100 and 1798.105, the nested
emergency conditions in 1798.145, decimal IDs such as 1798.199.10, and distinct
private and administrative remedies. Cross-page tests cover Sections
1798.100(d), 1798.105(d)(6), and the definition of business in 1798.140(d).
The source PDF includes repeated browser headers and URL footers, which are
saved in raw page extracts but excluded from section passages.

`dataset.json` contains expected facts and forbidden errors.
`source-passages.json` contains the extracted source passages and page
fragments. `pages.json` keeps raw and cleaned text of every physical page.
`validation-report.json` records automatic hash, source anchor, and coverage
checks. The script never reads ingestion output when constructing expected
answers. Human legal review of the fixture remains pending.

Regenerate with:

```powershell
cd "C:\Program Files\CookieCare\backend"
& "out/kb-chunking-venv/Scripts/python.exe" scripts/build-ccpa-gold.py --pdf "C:\Users\abhinav.yadav_randst\Downloads\CCPA legal text.pdf"
```

After a complete CCPA ingestion run, use the shared
`scripts/score-kb-structure-experiment.ts` with this fixture and the run
directory. Start with `--prepare-only --stage S3` to inspect selected
evidence, then score one case at a time. S4–S7 are expected to remain
`not_run` until the corresponding stage artifacts exist; a graph alone
cannot establish legal meaning, module guidance, retrieval, or user-facing
answer quality.
