
import { DraftState } from '../models/draft-state';
import { LLMTask, LLMProvider, PROVIDER_TASK_PRESETS, TaskModelConfig, resolveOutputTokenCeiling } from "../config/model-specs.js";
import { executeBoundedCompletion } from "../llm/index.js";
import { parseSections, renderSections } from "../utils/document-sections.js";
import dotenv from "dotenv"

dotenv.config()

/**
 * OUTPUT BUDGETING
 * A static maxOutputTokens is the wrong knob for legal drafting: an NDA needs ~3k tokens
 * while an MSA with annexes or a full rewrite of an uploaded vendor agreement needs several
 * times that. Undershooting silently produces a document that stops mid-clause.
 *
 * We therefore size the budget per request from what the pipeline already knows (skeleton
 * size, clause count, source/template length), and treat truncation as recoverable rather
 * than final — see generateUntilComplete below.
 */
const APPROX_CHARS_PER_TOKEN = 4;
const TOKENS_PER_SKELETON_SECTION = 500;
const TOKENS_PER_CLAUSE = 220;
/** Legal prose overruns estimates far more often than it undershoots them. */
const BUDGET_HEADROOM = 1.35;
/** A full rewrite reproduces the source plus the inserted/expanded language. */
const REWRITE_EXPANSION = 1.25;
const MAX_CONTINUATION_PASSES = 3;
const CONTINUATION_TAIL_CHARS = 3000;
const MAX_DISCARDABLE_TAIL_CHARS = 1200;

function estimateTokens(text?: string | null): number {
  return text ? Math.ceil(text.length / APPROX_CHARS_PER_TOKEN) : 0;
}

function estimateOutputTokenBudget(state: DraftState, runtimeConfig: TaskModelConfig): number {
  const floor = runtimeConfig.maxOutputTokens ?? 4096;
  const ceiling = resolveOutputTokenCeiling(runtimeConfig.model);

  // REACTIVE / REFINEMENT return the whole document, so the source sets the lower bound.
  const sourceText = state.request.sourceText || state.request.uploadedDocumentText;
  const rewriteCost = estimateTokens(sourceText) * REWRITE_EXPANSION;

  // PROACTIVE / BASIC compose from a skeleton and a clause set.
  const skeletonCost = (state.context?.documentSkeleton?.length ?? 0) * TOKENS_PER_SKELETON_SECTION;
  const clauseCost =
    ((state.requirements?.requiredClauses?.length ?? 0) +
      (state.requirements?.optionalClauses?.length ?? 0)) *
    TOKENS_PER_CLAUSE;

  // The baseline template approximates the shape of the finished document.
  const templateCost = estimateTokens(state.retrieval?.matchedTemplate);

  const estimated = Math.ceil(
    Math.max(rewriteCost, skeletonCost + clauseCost, templateCost) * BUDGET_HEADROOM
  );

  return Math.min(Math.max(estimated, floor), ceiling);
}

/**
 * A cut-off response ends on an arbitrary token, so pick a clean point to resume from:
 * the last paragraph break, or — when the trailing block is too large to discard — the last
 * word boundary, so a continuation never splices onto half a word. Returns the joiner to use
 * when the continuation is appended.
 */
function resolveResumePoint(text: string): { resumeFrom: string; joiner: string } {
  const trimmed = text.trimEnd();

  const paragraphBreak = trimmed.lastIndexOf("\n");
  if (paragraphBreak > 0 && trimmed.length - paragraphBreak <= MAX_DISCARDABLE_TAIL_CHARS) {
    return { resumeFrom: trimmed.slice(0, paragraphBreak).trimEnd(), joiner: "\n\n" };
  }

  const wordBreak = trimmed.lastIndexOf(" ");
  return wordBreak > 0
    ? { resumeFrom: trimmed.slice(0, wordBreak), joiner: " " }
    : { resumeFrom: trimmed, joiner: " " };
}

function buildContinuationPrompt(basePrompt: string, draftSoFar: string): string {
  const tail = draftSoFar.slice(-CONTINUATION_TAIL_CHARS);
  return [
    basePrompt,
    `# PARTIAL DRAFT (ALREADY DELIVERED TO THE USER)`,
    `The document below was cut off because the previous response ran out of output space. ` +
      `Only its final portion is shown.\n\n${tail}`,
    `# CONTINUATION TASK\n` +
      `Resume the document from exactly where the partial draft stops and write it through to the end, ` +
      `including the closing provisions and signature block.\n` +
      `- Do NOT restate the title, preamble, or any clause already present above.\n` +
      `- Do NOT summarise what came before or add commentary about continuing.\n` +
      `- Keep the same numbering sequence, headings style, tone and formatting as the partial draft.\n` +
      `- Your output is appended verbatim to the text above, so begin with the very next line of the agreement.`
  ].join('\n\n');
}

/**
 * Run the drafting call and, if the model reports it stopped on the token ceiling, continue
 * the same document instead of returning a half-finished agreement. Continuations append to
 * the text we already have, so a long document costs extra passes but never restarts.
 */
async function generateUntilComplete(
  state: DraftState,
  provider: LLMProvider,
  userPrompt: string,
  maxOutputTokens: number
): Promise<{ text: string; passes: number; truncated: boolean }> {
  const systemPrompt = state.context!.systemPrompt;
  const onToken = state.onToken;
  // Continuation deltas stream out the same way, so the live preview keeps filling in. The
  // preview can briefly show the trailing fragment we discard at the resume point; the
  // document returned here is the authoritative one.
  const onDelta = onToken ? (delta: string) => onToken(delta) : undefined;

  let outcome = await executeBoundedCompletion(
    userPrompt,
    systemPrompt,
    LLMTask.COMPLEX_DRAFT,
    provider,
    { maxOutputTokens, onDelta }
  );

  let document = outcome.text;
  let passes = 0;

  while (outcome.truncated && passes < MAX_CONTINUATION_PASSES) {
    passes += 1;
    console.warn(
      `[GENERATION] Output hit the ${maxOutputTokens}-token ceiling. Continuation pass ${passes}/${MAX_CONTINUATION_PASSES}.`
    );
    await state.onProgress?.(72, "Draft is long — continuing the remaining sections...");

    const { resumeFrom, joiner } = resolveResumePoint(document);

    outcome = await executeBoundedCompletion(
      buildContinuationPrompt(userPrompt, resumeFrom),
      systemPrompt,
      LLMTask.COMPLEX_DRAFT,
      provider,
      { maxOutputTokens, onDelta }
    );

    // Each pass is its own response and can arrive in its own markdown fence.
    const continuation = cleanMarkdownArtifacts(outcome.text);
    if (!continuation) break;
    document = `${resumeFrom}${joiner}${continuation}`;
  }

  if (outcome.truncated) {
    console.error(
      `[GENERATION] Document still incomplete after ${passes} continuation pass(es). ` +
        `Validation will flag the missing sections.`
    );
  }

  return { text: document, passes, truncated: outcome.truncated };
}
/**
 * Clean LLM Artifact Pollution.
 * LLMs frequently wrap legal text inside markdown wrappers (e.g., ```markdown ... ```).
 * This function programmatically strips those out so it doesn't ruin document layouts.
 */
function cleanMarkdownArtifacts(rawText: string): string {
  let cleanedText = rawText.trim();
  
  // Strip opening backticks
  if (cleanedText.startsWith('```markdown')) {
    cleanedText = cleanedText.replace(/^```markdown\s*/i, '');
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```\s*/, '');
  }
  
  // Strip closing backticks
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.replace(/\s*```$/, '');
  }
  
  return cleanedText.trim();
}

function performLightweightValidation(state: DraftState, output: string): boolean {
  if (!state.request.sourceText) return true;

  const originalText = state.request.sourceText;
  const originalLower = originalText.toLowerCase();
  const outputLower = output.toLowerCase();

  // 1. Document title/header match check
  const extractedTitle = state.requirements?.agreementTitle;
  const originalTitleSnippet = extractedTitle || originalText.split('\n').map(l => l.trim()).find(l => l.length > 0) || "";
  if (originalTitleSnippet.length > 3) {
    const cleanOrigTitle = originalTitleSnippet
      .replace(/\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()
      .trim();
    const outputSnippet = output.slice(0, 1000).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (cleanOrigTitle.length > 3 && !outputSnippet.includes(cleanOrigTitle)) {
      console.warn(`[REACTIVE VALIDATION] Title mismatch: "${originalTitleSnippet}" (cleaned: "${cleanOrigTitle}") not found in output header.`);
      return false;
    }
  }

  // 2. Agreement type matches the original
  const origType = (state.requirements?.contractType || "").toLowerCase().trim();
  if (origType.length > 1) {
    const isNda = origType.includes("nda") || origType.includes("non-disclosure");
    const outputContainsType = outputLower.includes(origType) || 
      (isNda && (outputLower.includes("non-disclosure") || outputLower.includes("confidentiality")));
    
    if (!outputContainsType) {
      console.warn(`[REACTIVE VALIDATION] Contract type mismatch: "${origType}" not found in output.`);
      return false;
    }
  }

  // 3. Original parties still exist
  const partyA = state.requirements?.partyA;
  const partyB = state.requirements?.partyB;
  if (partyA && partyA.length > 2) {
    const cleanPartyA = partyA.toLowerCase().trim();
    if (!outputLower.includes(cleanPartyA)) {
      console.warn(`[REACTIVE VALIDATION] Party A mismatch: "${partyA}" missing in output.`);
      return false;
    }
  }
  if (partyB && partyB.length > 2) {
    const cleanPartyB = partyB.toLowerCase().trim();
    if (!outputLower.includes(cleanPartyB)) {
      console.warn(`[REACTIVE VALIDATION] Party B mismatch: "${partyB}" missing in output.`);
      return false;
    }
  }
  
  // Fallback to checking the parties array
  if ((!partyA || partyA.length <= 2) && (!partyB || partyB.length <= 2)) {
    const parties = state.requirements?.parties || [];
    for (const party of parties) {
      const cleanParty = party.toLowerCase().trim();
      if (cleanParty.length > 2 && !outputLower.includes(cleanParty)) {
        console.warn(`[REACTIVE VALIDATION] Party array mismatch: "${party}" missing in output.`);
        return false;
      }
    }
  }

  // 4. Effective Date matches the original
  const effectiveDate = state.requirements?.effectiveDate;
  if (effectiveDate && effectiveDate.length > 3 && effectiveDate.toLowerCase() !== "not specified") {
    const cleanDate = effectiveDate.toLowerCase().replace(/[^a-zA-Z0-9]/g, "").trim();
    const cleanOutput = outputLower.replace(/[^a-zA-Z0-9]/g, "");
    if (cleanDate.length > 3 && !cleanOutput.includes(cleanDate)) {
      console.warn(`[REACTIVE VALIDATION] Effective Date mismatch: "${effectiveDate}" missing in output.`);
      return false;
    }
  }

  // 5. Output is still the same agreement (not a dispute/rebuttal letter)
  const isLetter = /dear|re:|notice of claim|rebuttal letter|dispute response/i.test(output.slice(0, 600));
  if (isLetter) {
    console.warn(`[REACTIVE VALIDATION] Format mismatch: Output appears to be a letter instead of an agreement.`);
    return false;
  }

  return true;
}

export const generationStep = async (state: DraftState,provider:LLMProvider = LLMProvider.GEMINI): Promise<DraftState> => {
  if (!state.context || !state.context.assembledPrompt) {
    throw new Error('Generation Step Aborted: Context has not been assembled. state.context.assembledPrompt is null.');
  }

  try {
    const runtimeConfig = PROVIDER_TASK_PRESETS[provider][LLMTask.COMPLEX_DRAFT];
    const modelUsed = typeof state.metadata.generationParameters?.model === "string"
      ? state.metadata.generationParameters.model
      : runtimeConfig.model;

    // 1. Size the output budget for this specific document, then dispatch the execution call
    //    using the pre-compiled context environment prompt block. When a token callback is
    //    present (initial drafting job) the tokens stream to the client so the document
    //    appears live. If the model runs out of room, the draft is continued rather than
    //    truncated.
    const maxOutputTokens = estimateOutputTokenBudget(state, runtimeConfig);
    console.log(
      `[GENERATION] Output token budget: ${maxOutputTokens} (preset floor ${runtimeConfig.maxOutputTokens ?? 4096}, model ceiling ${resolveOutputTokenCeiling(runtimeConfig.model)}).`
    );

    let generated = await generateUntilComplete(
      state,
      provider,
      state.context.assembledPrompt,
      maxOutputTokens
    );
    let rawModelOutput = generated.text;

    // 2. Perform lightweight validation and single retry for Reactive mode
    if (state.request.intent === "REACTIVE" && state.request.sourceText) {
      const isValid = performLightweightValidation(state, rawModelOutput);
      if (!isValid) {
        console.warn("[REACTIVE VALIDATION] Validation failed. Retrying once with correction prompt...");
        const retryUserPrompt = `${state.context.assembledPrompt}\n\n[WARNING: VALIDATION FAILED]\nYou changed the document type or metadata. Return the SAME agreement with revisions only. Make sure all original parties (Party A: "${state.requirements?.partyA || 'Not specified'}", Party B: "${state.requirements?.partyB || 'Not specified'}"), Effective Date ("${state.requirements?.effectiveDate || 'Not specified'}"), document type, and title are preserved exactly. Do not output a letter, memo, or summary.`;
        generated = await generateUntilComplete(
          { ...state, onToken: undefined },
          provider,
          retryUserPrompt,
          maxOutputTokens
        );
        rawModelOutput = generated.text;
      }
    }

    // 3. Programmatically strip only structural markdown wrappers (```markdown fences).
    //    Content-level defects are handled at the correct layers, NOT patched here:
    //    - "(c)" -> "©" corruption is fixed in the frontend renderer (markdownToHtml)
    //    - [● NAME]/[● TITLE] signature placeholders are prevented by the system prompt
    //      and, if they slip through, flagged as critical by validation -> regen loop.
    const cleanedDocumentText = cleanMarkdownArtifacts(rawModelOutput);

    // 3b. Parse into structured sections (Phase 1). The rendered join is the
    //     canonical formattedDocument; if parsing yields nothing (edge case) we
    //     fall back to the cleaned text so we never regress.
    const sections = parseSections(cleanedDocumentText);
    const formattedDocument = renderSections(sections) || cleanedDocumentText;

    // 4. Increment document version tracking variables smoothly
    const currentVersion = state.draft ? state.draft.version + 1 : 1;

    // 5. Return immutably mutated state footprint (with a memory-log entry)
    const historyEntry = {
      version: currentVersion,
      actor: "model" as const,
      action: state.request.intent === "REFINEMENT" ? "full-regen" : "generate",
      instruction: state.request.rawInstructions || undefined,
      changedSectionIds: sections.map((s) => s.id),
      timestamp: new Date().toISOString()
    };

    return {
      ...state,
      draft: {
        rawOutput: rawModelOutput,
        formattedDocument,
        sections,
        version: currentVersion,
        parentVersionId: state.draft ? `v${state.draft.version}` : undefined
      },
      history: [...(state.history ?? []), historyEntry],
      metadata: {
        ...state.metadata,
        generatedAt: new Date().toISOString(),
        generationParameters: {
          ...state.metadata.generationParameters,
          provider,
          task: LLMTask.COMPLEX_DRAFT,
          model: modelUsed,
          runtimeConfig,
          maxOutputTokens,
          continuationPasses: generated.passes,
          // True only if the document is STILL cut short after exhausting continuations.
          outputTruncated: generated.truncated
        },
        modelUsed
      }
    };

  } catch (error) {
    console.error('Fatal execution exception within generation step component:', error);
    throw new Error(`Generation Layer Failure: ${(error as Error).message}`);
  }
};