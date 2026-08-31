// Semantic Retrieval plan, R0 exit gate — manual verification script.
// "A unit test embeds 3 strings and gets 3× 768-dim vectors; cosine of
// 'delete on termination' vs 'how long processing lasts' > cosine vs an
// unrelated clause." This is exactly the recall gap reported against the
// Mastercard DPA (duration proved by a termination/deletion clause).
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/llm/__fixtures__/embedding-verify.ts
// from CookieCare-main/backend/.

import "../../config/index.js";
import { executeEmbedding } from "../index.js";
import { GEMINI_EMBEDDING_DIMENSIONS } from "../config/model-specs.js";

const QUERY =
  "A clause establishing how long the processor may process the data — e.g. " +
  "tied to the term of the underlying Agreement, or running until return/" +
  "deletion is triggered on termination.";

const DURATION_BY_TERMINATION =
  "Upon termination of the Agreement and/or relevant SOW, Supplier will " +
  "securely delete existing copies of the Personal Data unless applicable " +
  "local Law requires storage of the Personal Data.";

const UNRELATED =
  "Supplier shall implement appropriate technical and organizational " +
  "measures, including encryption of Personal Data at rest and in transit, " +
  "role-based access controls, and regular penetration testing.";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  console.log("Embedding 3 texts (query, duration-by-termination clause, unrelated security clause)…");
  const [queryVec, durationVec, unrelatedVec] = await executeEmbedding([
    QUERY,
    DURATION_BY_TERMINATION,
    UNRELATED,
  ]);

  for (const [label, vec] of [
    ["query", queryVec],
    ["duration-by-termination", durationVec],
    ["unrelated (security)", unrelatedVec],
  ] as const) {
    if (!vec) {
      console.log(`  [FAIL] ${label}: embedding returned null`);
      continue;
    }
    console.log(`  [OK] ${label}: dims=${vec.length} (expected ${GEMINI_EMBEDDING_DIMENSIONS})`);
  }

  if (!queryVec || !durationVec || !unrelatedVec) {
    console.error("\nOne or more embeddings failed — cannot compute cosine comparison.");
    process.exitCode = 1;
    return;
  }

  const simDuration = cosine(queryVec, durationVec);
  const simUnrelated = cosine(queryVec, unrelatedVec);

  console.log(`\ncosine(query, duration-by-termination) = ${simDuration.toFixed(4)}`);
  console.log(`cosine(query, unrelated/security)      = ${simUnrelated.toFixed(4)}`);

  if (simDuration > simUnrelated) {
    console.log(
      `\n[PASS] Duration query is closer to the termination/deletion clause than to the ` +
        `unrelated security clause — this is the exact recall gap that made VERIFY say ` +
        `"these are termination clauses, not duration" on the real Mastercard DPA. ` +
        `Semantic retrieval closes it; lexical scoring could not.`
    );
  } else {
    console.error(
      `\n[FAIL] Duration query did NOT rank the termination/deletion clause above the ` +
        `unrelated clause. Embedding model or dimensionality may be misconfigured.`
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[embedding-verify] failed:", err);
  process.exitCode = 1;
});
