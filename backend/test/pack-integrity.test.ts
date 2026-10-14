import { test } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { documentTypeRegistry } from "../src/modules/drafting/packs/document-types/registry.js";
import { regimeRegistry } from "../src/modules/drafting/packs/regimes/registry.js";
import { jurisdictionRegistry } from "../src/modules/drafting/packs/jurisdictions/registry.js";

const PACKS_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/modules/drafting/packs"
);

async function assertSkillExists(skillPath: string) {
  const full = path.join(PACKS_ROOT, skillPath, "skill.md");
  await access(full);
}

test("pack integrity: every registered skillPath has a skill.md", async () => {
  for (const pack of documentTypeRegistry.all()) {
    for (const skillPath of pack.skillPaths) {
      await assertSkillExists(skillPath);
    }
  }
  for (const pack of regimeRegistry.all()) {
    for (const skillPath of pack.skillPaths) {
      await assertSkillExists(skillPath);
    }
  }
  for (const pack of jurisdictionRegistry.all()) {
    for (const skillPath of pack.skillPaths) {
      await assertSkillExists(skillPath);
    }
  }
});

test("ireland jurisdiction resolves from governingLaw hint", () => {
  assert.equal(jurisdictionRegistry.resolveId("Ireland"), "ireland");
  assert.equal(jurisdictionRegistry.resolveId("Republic of Ireland"), "ireland");
});
