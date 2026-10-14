# Analysis phase problems

Working notes for defects and acceptance gaps found while building the
compliance-check phased work (Phase 0 observability → Phase 1 structure →
Phase 2 registry → Phase 3 bundles → Phase 4 element matrix → …).

These are **side-channel / pipeline** problems. Unless a note says otherwise,
the live VERIFY report path is unchanged.

| ID | Title | Phase | Status |
|----|--------|-------|--------|
| [P-4B-01](./P-4B-01-lexical-matcher-bitrix-vs-mastercard.md) | Phase 4B matcher false-misses real Art 28 proof already in bundles (whitespace + over-narrow G1/G4/F3 tokens) | 4B | Open — blocks live VERIFY wiring |

Related baseline (pre-phase Class A appendix/Term failure map):

- [`docs/COMPLIANCE-CHECK-ACT-CHUNKING-DIAGNOSTIC.md`](../COMPLIANCE-CHECK-ACT-CHUNKING-DIAGNOSTIC.md)
