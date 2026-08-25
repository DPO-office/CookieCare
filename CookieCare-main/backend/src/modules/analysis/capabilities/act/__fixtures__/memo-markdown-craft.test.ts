import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEGAL_MEMO_MARKDOWN_CRAFT } from "../../../prompts/memo-markdown-craft.js";
import { SYNTHESIS_SYSTEM_PROMPT } from "../../../prompts/synthesis.js";
import { buildSectionGuidanceBlock } from "../../../prompts/report-sections.js";
import { NARRATIVE_REPORT_SYSTEM_PROMPT_WITH_CRAFT } from "../../../prompts/render-output-prompts.js";

describe("LEGAL_MEMO_MARKDOWN_CRAFT", () => {
  it("defines selective bold, status-led headings, and bans chatty closers", () => {
    assert.match(LEGAL_MEMO_MARKDOWN_CRAFT, /Selective bold/);
    assert.match(LEGAL_MEMO_MARKDOWN_CRAFT, /Strong, Adequate, Conditional, Gap/);
    assert.match(LEGAL_MEMO_MARKDOWN_CRAFT, /Status-led subheadings/);
    assert.match(LEGAL_MEMO_MARKDOWN_CRAFT, /No chatty closers/);
    assert.match(LEGAL_MEMO_MARKDOWN_CRAFT, /Let me know if you'd like/);
    assert.match(
      LEGAL_MEMO_MARKDOWN_CRAFT,
      /Never use \*\*Amend\*\* for Cannot determine \/ insufficient \/ truncated evidence/
    );
  });

  it("is wired into synthesis and narrative system prompts", () => {
    assert.match(SYNTHESIS_SYSTEM_PROMPT, /MARKDOWN CRAFT/);
    assert.match(SYNTHESIS_SYSTEM_PROMPT, /Selective bold/);
    assert.match(NARRATIVE_REPORT_SYSTEM_PROMPT_WITH_CRAFT, /MARKDOWN CRAFT/);
  });

  it("is included in section guidance for report authors", () => {
    const guidance = buildSectionGuidanceBlock([
      "scope",
      "requirements_detail",
      "recommendations",
      "conclusion",
    ]);
    assert.match(guidance, /MARKDOWN CRAFT/);
    assert.match(guidance, /SECTION ARCHITECTURE/);
  });
});
