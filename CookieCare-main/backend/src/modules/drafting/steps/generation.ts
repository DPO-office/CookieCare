
import { DraftState } from '../models/draft-state';
import { LLMTask, LLMProvider, PROVIDER_TASK_PRESETS } from "../config/model-specs.js";
import { executeCompletion, executeJsonCompletion } from "../llm/index.js";
import dotenv from "dotenv"

dotenv.config()
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

    // 1. Dispatch execution call using the pre-compiled context environment prompt block
    let rawModelOutput = await executeCompletion(
        state.context.assembledPrompt,
        state.context.systemPrompt,LLMTask.COMPLEX_DRAFT,provider
    );

    // 2. Perform lightweight validation and single retry for Reactive mode
    if (state.request.intent === "REACTIVE" && state.request.sourceText) {
      const isValid = performLightweightValidation(state, rawModelOutput);
      if (!isValid) {
        console.warn("[REACTIVE VALIDATION] Validation failed. Retrying once with correction prompt...");
        const retryUserPrompt = `${state.context.assembledPrompt}\n\n[WARNING: VALIDATION FAILED]\nYou changed the document type or metadata. Return the SAME agreement with revisions only. Make sure all original parties (Party A: "${state.requirements?.partyA || 'Not specified'}", Party B: "${state.requirements?.partyB || 'Not specified'}"), Effective Date ("${state.requirements?.effectiveDate || 'Not specified'}"), document type, and title are preserved exactly. Do not output a letter, memo, or summary.`;
        rawModelOutput = await executeCompletion(
            retryUserPrompt,
            state.context.systemPrompt,LLMTask.COMPLEX_DRAFT,provider
        );
      }
    }

    // 3. Programmatically sanitize the document data stream
    const cleanedDocumentText = cleanMarkdownArtifacts(rawModelOutput);

    // 4. Increment document version tracking variables smoothly
    const currentVersion = state.draft ? state.draft.version + 1 : 1;

    // 5. Return immutably mutated state footprint
    return {
      ...state,
      draft: {
        rawOutput: rawModelOutput,
        formattedDocument: cleanedDocumentText,
        version: currentVersion,
        parentVersionId: state.draft ? `v${state.draft.version}` : undefined
      },
      metadata: {
        ...state.metadata,
        generatedAt: new Date().toISOString(),
        generationParameters: {
          ...state.metadata.generationParameters,
          provider,
          task: LLMTask.COMPLEX_DRAFT,
          model: modelUsed,
          runtimeConfig,
        },
        modelUsed
      }
    };

  } catch (error) {
    console.error('Fatal execution exception within generation step component:', error);
    throw new Error(`Generation Layer Failure: ${(error as Error).message}`);
  }
};