# Analysis module contribution rules

These rules prevent re-fragmentation after the structural refactor.

1. **New ACT tool** → `capabilities/act/<tool>.ts` (or `handlers/` when that layout is adopted); register only in `execute-act-plan.ts`.
2. **New LLM prompt** → `prompts/<phase>-<purpose>.ts`; do not inline prompts longer than ~20 lines in handlers.
3. **Cross-phase pure helpers** → `shared/`. Phase-specific helpers stay in their phase folder.
4. **User-facing narrative / limitations** → `capabilities/reporting/`, not ACT handlers.
5. **New skill** → `skill.config.ts` import in `skills/runtime/catalog/registry.ts` + `manifest.ts` entry + `SKILL.md` (enforced by `npm run lint:skills`). Authored content stays under `skills/{_global,doc-types,regimes,topics,jurisdictions}/`; engine code lives under `skills/runtime/`.
6. **Files over ~400 LOC** → call out a split plan in the PR description.
7. **Dependency direction** → `skills/` must not import `capabilities/` (except documented temporary re-exports). `prompts/` may import `models/` and `shared/` only — never ACT handlers.
8. **Domain tokens in generic handlers** → guarded by `generic-handler-domain-lint.test.ts`; authored legal copy belongs in skill configs / SKILL.md.
