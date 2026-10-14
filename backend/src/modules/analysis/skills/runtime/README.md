# Skills runtime

Engine code for selecting, hydrating, and planning with authored skills.

| Folder | Responsibility |
|--------|----------------|
| `catalog/` | Registry, manifest, types, SKILL.md loading, hydration |
| `selection/` | Skill selection + resolve + doc-type classify |
| `focus/` | Instruction focus / explicit scope / resolution catalog |
| `graph/` | Package resolution + ACT graph build |
| `lint/` | Config ↔ SKILL.md parity CI |

Authored legal content stays in `../_global`, `../doc-types`, `../regimes`, `../topics`, `../jurisdictions`.

Import from `skills/runtime/...` — do not add root-level re-export shims.
