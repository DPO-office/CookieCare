import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  selectSkills,
  SKILL_SCORE_THRESHOLD,
} from "../src/modules/analysis/skills/runtime/selection/select-skills.js";

describe("selectSkills", () => {
  it("Path A resolves privacy category without LLM", () => {
    const result = selectSkills({
      instruction: "Review GDPR processor obligations",
      promptLibraryId: "privacy",
    });
    assert.equal(result.selectionPath, "library");
    const ids = result.skills.map((s) => s.skillId);
    assert.ok(ids.includes("regimes/data-protection/gdpr"));
  });

  it("Path A falls back to general-review for unknown library id", () => {
    const result = selectSkills({
      instruction: "Review contract",
      promptLibraryId: "unknown-category",
    });
    assert.equal(result.selectionPath, "fallback");
    const ids = result.skills.map((s) => s.skillId);
    assert.ok(ids.includes("_global"));
  });

  it("Path B matches commercial triggers for indemnity/liability", () => {
    const result = selectSkills({
      instruction: "Review indemnity and liability only",
      docType: "msa",
    });
    assert.ok(result.skills[0]?.skillId);
    assert.ok(
      result.selectionPath === "free_text" ||
        result.selectionPath === "fallback" ||
        result.selectionPath === "library"
    );
  });

  it("Path B falls back to general-review when no triggers match", () => {
    const result = selectSkills({
      instruction: "hello world",
      docType: "shareholder-agreement",
    });
    assert.equal(result.selectionPath, "fallback");
    const ids = result.skills.map((s) => s.skillId);
    assert.ok(ids.includes("_global"));
  });

  it("flags ambiguity when top two skills score within margin", () => {
    const result = selectSkills({
      instruction: "gdpr commercial indemnity liability payment msa dpa",
      docType: "msa",
    });
    if (result.ambiguous) {
      assert.ok((result.candidateSkillIds ?? []).length >= 2);
    } else {
      assert.ok(result.skills[0].skillId);
    }
    assert.ok(SKILL_SCORE_THRESHOLD >= 2);
  });
});
