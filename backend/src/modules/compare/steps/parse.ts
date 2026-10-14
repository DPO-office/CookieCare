/**
 * parse.ts — Step 1 of the Compare pipeline
 *
 * Responsibility: extract clean text from both uploaded document buffers and
 * populate CompareState.parsed.
 *
 * Deterministic only — no LLM involvement.
 * Reuses the shared extractText utility that the rest of the backend uses
 * (controllers/documents.ts, modules/drafting/api/controller.ts).
 */

import { extractText } from "../../../utils/extractText.js";
import { CompareState, DocumentMeta } from "../models/compare-state.js";
import {
  normaliseExtractedText,
  countWords,
  detectLanguage,
} from "../utils/normalise-text.js";

/**
 * Build a DocumentMeta descriptor from a clean text string and upload info.
 */
function buildMeta(
  text: string,
  fileName: string,
  mimeType: string
): DocumentMeta {
  return {
    fileName,
    mimeType,
    wordCount: countWords(text),
    charCount: text.length,
    detectedLanguage: detectLanguage(text),
  };
}

/**
 * parseStep — Stage 1 of the compare pipeline.
 *
 * Extracts and normalises text from both uploaded files, then returns an
 * enriched CompareState with the `parsed` field populated.
 *
 * Throws if extraction fails or either document contains insufficient text
 * for further processing.
 */
export async function parseStep(state: CompareState): Promise<CompareState> {
  const { original, revised } = state.files;

  // ── Extract text from both documents ────────────────────────────────────
  let resultA: import("../../../utils/extractText.js").ExtractionResult;
  let resultB: import("../../../utils/extractText.js").ExtractionResult;

  try {
    resultA = await extractText(original.buffer, original.mimeType);
  } catch (err: any) {
    throw new Error(
      `[parseStep] Failed to extract text from original document "${original.fileName}": ${err.message}`
    );
  }

  try {
    resultB = await extractText(revised.buffer, revised.mimeType);
  } catch (err: any) {
    throw new Error(
      `[parseStep] Failed to extract text from revised document "${revised.fileName}": ${err.message}`
    );
  }

  // ── Normalise ────────────────────────────────────────────────────────────
  const textA = normaliseExtractedText(resultA.text);
  const textB = normaliseExtractedText(resultB.text);

  // ── Sanity guard: reject near-empty documents ────────────────────────────
  // 150-char threshold matches the DPA review route pattern.
  if (textA.length < 150) {
    throw new Error(
      `[parseStep] Original document "${original.fileName}" contains insufficient text for comparison (${textA.length} chars). Please ensure the file is not empty or image-only.`
    );
  }
  if (textB.length < 150) {
    throw new Error(
      `[parseStep] Revised document "${revised.fileName}" contains insufficient text for comparison (${textB.length} chars). Please ensure the file is not empty or image-only.`
    );
  }

  const metaA = buildMeta(textA, original.fileName, original.mimeType);
  const metaB = buildMeta(textB, revised.fileName, revised.mimeType);

  console.log(
    `[parseStep] Extraction complete — ` +
      `original: "${original.fileName}" ${metaA.wordCount}w ${metaA.charCount}c lang=${metaA.detectedLanguage} | ` +
      `revised: "${revised.fileName}" ${metaB.wordCount}w ${metaB.charCount}c lang=${metaB.detectedLanguage}`
  );

  return {
    ...state,
    parsed: { textA, textB, metaA, metaB, pageBreaksA: resultA.pageBreaks, pageBreaksB: resultB.pageBreaks },
  };
}
