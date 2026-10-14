/**
 * Explicit article scope — boundaries, context vs scope, subsection narrowing.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractExplicitScope,
  filterIdsByScope,
  ruleIdMatchesScope,
  scopeBoundaryActive,
} from "../runtime/focus/extract-explicit-scope.js";

const ART28_REVIEW =
  "Perform a rigorous GDPR Article 28 compliance review of this Data Processing Agreement. Verify subject matter, duration, nature and purpose of processing, categories of data and data subjects, obligations and rights of the controller, and whether all mandatory Article 28(3) clauses are present and adequate.";

describe("extractExplicitScope", () => {
  it("scopes Article 28 review to article 28 only", () => {
    const scope = extractExplicitScope(ART28_REVIEW);
    assert.deepEqual(scope.articles, [28]);
    assert.equal(scopeBoundaryActive(scope), true);
    assert.deepEqual(scope.contextArticles, []);
    assert.equal(scope.subsections, undefined);
  });

  it("includes Article 32 when user also asks to review it", () => {
    const scope = extractExplicitScope(
      "Review Article 28 and also explain how Article 32 security requirements interact with it."
    );
    assert.deepEqual(scope.articles, [28, 32]);
    assert.deepEqual(scope.contextArticles, []);
  });

  it("treats cross-referenced articles as context, not scope", () => {
    const scope = extractExplicitScope(
      "Review Article 28, considering Articles 32-36 when assessing processor assistance."
    );
    assert.deepEqual(scope.articles, [28]);
    assert.deepEqual(scope.contextArticles, [32, 33, 34, 35, 36]);
  });

  it("narrows to Article 28(3) when user says only", () => {
    const scope = extractExplicitScope("Only assess Article 28(3) mandatory clauses in this DPA.");
    assert.deepEqual(scope.articles, [28]);
    assert.deepEqual(scope.subsections, [{ article: 28, paragraph: 3 }]);
  });
});

describe("ruleIdMatchesScope", () => {
  const art28Scope = extractExplicitScope(ART28_REVIEW);

  it("allows Article 28 rules", () => {
    assert.equal(ruleIdMatchesScope("gdpr.art28.3.f", art28Scope), true);
    assert.equal(ruleIdMatchesScope("gdpr.art28.1", art28Scope), true);
  });

  it("blocks out-of-scope articles", () => {
    assert.equal(ruleIdMatchesScope("gdpr.art32", art28Scope), false);
    assert.equal(ruleIdMatchesScope("gdpr.art38", art28Scope), false);
    assert.equal(ruleIdMatchesScope("gdpr.art39.1.a-c", art28Scope), false);
  });

  it("blocks context-only articles", () => {
    const scope = extractExplicitScope(
      "Review Article 28 considering Articles 32-36."
    );
    assert.equal(ruleIdMatchesScope("gdpr.art32", scope), false);
    assert.equal(ruleIdMatchesScope("gdpr.art28.3.f", scope), true);
  });

  it("narrows to 28(3) sub-clauses when subsection scope is set", () => {
    const scope = extractExplicitScope("Only assess Article 28(3) clauses.");
    assert.equal(ruleIdMatchesScope("gdpr.art28.3.a", scope), true);
    assert.equal(ruleIdMatchesScope("gdpr.art28.3.chapeau", scope), true);
    assert.equal(ruleIdMatchesScope("gdpr.art28.4", scope), true);
    assert.equal(ruleIdMatchesScope("gdpr.art28.1", scope), false);
    assert.equal(ruleIdMatchesScope("gdpr.art28.2", scope), false);
    assert.equal(ruleIdMatchesScope("gdpr.art28.9", scope), false);
  });

  it("filters catalog-style id lists to in-scope rules only", () => {
    const scope = extractExplicitScope(ART28_REVIEW);
    const filtered = filterIdsByScope(
      [
        "gdpr.art28.3.a",
        "gdpr.art29",
        "gdpr.art32",
        "gdpr.art38",
      ],
      scope
    );
    assert.deepEqual(filtered, ["gdpr.art28.3.a"]);
  });
});
