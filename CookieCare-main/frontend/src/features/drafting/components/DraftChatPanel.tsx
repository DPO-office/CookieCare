import { useRef, useEffect, useState, ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { DraftComposer } from "./DraftComposer";
import { DatePicker } from "./DatePicker";
import type { DraftChatMessage } from "../hooks/useDraftChat";
import type { DraftOpenQuestion, QuestionInputType } from "../api/draftingJobs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OTHER_LABEL = "Other (specify)";

/**
 * Fallback chip options injected when the backend omits options[] for a
 * governing-law / jurisdiction question.
 */
const GOVERNING_LAW_OPTIONS = [
  "State of Delaware",
  "State of California",
  "England and Wales",
  "Ireland",
  "Other (specify)",
];

/** Fallback options for yes/no questions. */
const YES_NO_OPTIONS = ["Yes", "No"];

// ---------------------------------------------------------------------------
// Semantic detection regexes
// ---------------------------------------------------------------------------

/** Matches "date" anywhere in a field name (e.g. effectiveDate, msa_date). */
const DATE_FIELD_RE = /date/i;

/**
 * Matches question text that is clearly asking for a calendar date.
 * Intentionally broad — catches paraphrases like "When does the agreement
 * take effect?" as well as standard "What is the effective date of …?"
 */
const DATE_QUESTION_RE =
  /\b(?:effective\s+date|execution\s+date|commencement\s+date|termination\s+date|expiry\s+date|expiration\s+date|signature\s+date|date\s+of\s+(?:last\s+)?signature|agreement\s+date|date\s+of\s+the\s+(?:principal|master)\s+(?:services\s+)?agreement|msa\s+date|start\s+date|end\s+date|contract\s+date|signing\s+date|when\s+(?:does|will|should|is)\s+(?:this|the)\s+(?:agreement|contract|dpa|order)\s+(?:take\s+effect|become\s+effective|commence|start|expire|terminate))\b/i;

/**
 * Matches field names that represent a duration / quantity
 * (e.g. "periodYears", "noticeWeeks", "confidentialityTerm").
 */
const DURATION_FIELD_RE =
  /(?:period|duration|term|years?|months?|weeks?|days?|length|horizon|window|survival|lifespan)/i;

/**
 * Matches question text that is asking for a duration or numeric quantity.
 * Examples:
 *   "How many years should the confidentiality obligation last?"
 *   "How long should the NDA survive termination?"
 *   "What is the notice period (in days)?"
 *   "For how long should the obligations survive?"
 */
const DURATION_QUESTION_RE =
  /\b(?:how\s+(?:many|long|much)|number\s+of\s+(?:years?|months?|days?|weeks?)|for\s+how\s+long|(?:how\s+long|length|duration|period|term|survive|survival|last|remain\s+in\s+(?:force|effect)|in\s+force)\b)/i;

/**
 * Matches field names clearly related to governing law / jurisdiction.
 */
const GOVERNING_LAW_FIELD_RE =
  /(?:governing|jurisdiction|law|venue|forum|choice_of_law|applicable_law)/i;

/**
 * Matches question text asking for governing law / jurisdiction.
 * Examples:
 *   "Which jurisdiction's laws should govern this agreement?"
 *   "What is the governing law for this contract?"
 *   "Under which law should disputes be resolved?"
 */
const GOVERNING_LAW_QUESTION_RE =
  /\b(?:governing\s+law|which\s+(?:jurisdiction|law|state|country)|applicable\s+law|law\s+(?:that\s+)?(?:should\s+)?govern|jurisdiction(?:'s)?\s+laws?|choice\s+of\s+law|disputes?\s+(?:be\s+)?(?:resolved|settled)\s+under|under\s+(?:which|what)\s+(?:law|jurisdiction)|venue\s+for\s+disputes?)\b/i;

/**
 * Matches yes/no questions.
 * Examples:
 *   "Should the agreement auto-renew?"
 *   "Is this agreement subject to GDPR?"
 *   "Do you want to include a non-compete clause?"
 *   "Will the parties share personal data?"
 */
const YES_NO_QUESTION_RE =
  /^\s*(?:(?:should|does|do|will|can|may|is|are|has|have|would|could)\s|(?:do\s+you\s+want|would\s+you\s+like|should\s+(?:this|the)))/i;

// ---------------------------------------------------------------------------
// resolveInputType
// ---------------------------------------------------------------------------

/**
 * Determine the effective input type for a question.
 *
 * Priority:
 *  1. Explicit `inputType` from the backend (always trusted).
 *  2. Date: field name contains "date" OR question matches date phrases.
 *  3. Duration/number: field name or question text signals a quantity/period.
 *  4. Governing law / jurisdiction: question is clearly asking for a legal
 *     jurisdiction → "chips" (options injected via resolveOptions()).
 *  5. Yes/No question: question opens with modal verb → "chips".
 *  6. options[] present → "chips".
 *  7. Default → "text".
 */
function resolveInputType(q: DraftOpenQuestion): QuestionInputType {
  // 1. Trust explicit backend hint first
  if (q.inputType) return q.inputType;

  // 2. Date
  if (DATE_FIELD_RE.test(q.field) || DATE_QUESTION_RE.test(q.question)) {
    return "date";
  }

  // 3. Duration / quantity  →  "number"
  if (DURATION_FIELD_RE.test(q.field) || DURATION_QUESTION_RE.test(q.question)) {
    return "number";
  }

  // 4. Governing law / jurisdiction → chips (options will be injected)
  if (
    GOVERNING_LAW_FIELD_RE.test(q.field) ||
    GOVERNING_LAW_QUESTION_RE.test(q.question)
  ) {
    return "chips";
  }

  // 5. Yes/No questions → chips
  if (YES_NO_QUESTION_RE.test(q.question)) {
    return "chips";
  }

  // 6. Backend-provided options
  if (q.options && q.options.length > 0) return "chips";

  // 7. Default
  return "text";
}

// ---------------------------------------------------------------------------
// resolveOptions
// ---------------------------------------------------------------------------

/**
 * Return the chip options for a question.
 *
 * - Prefers backend-provided `options[]`.
 * - Falls back to injected defaults for known semantic types (governing law,
 *   yes/no) so chips are still rendered even when the LLM omitted options.
 */
function resolveOptions(q: DraftOpenQuestion): string[] {
  // Backend options always win
  if (q.options && q.options.length > 0) return q.options;

  const inputType = resolveInputType(q);
  if (inputType !== "chips" && inputType !== "chips-multi") return [];

  // Governing law / jurisdiction default
  if (
    GOVERNING_LAW_FIELD_RE.test(q.field) ||
    GOVERNING_LAW_QUESTION_RE.test(q.question)
  ) {
    return GOVERNING_LAW_OPTIONS;
  }

  // Yes/No default
  if (YES_NO_QUESTION_RE.test(q.question)) {
    return YES_NO_OPTIONS;
  }

  return [];
}

// ---------------------------------------------------------------------------
// inferPlaceholder
// ---------------------------------------------------------------------------

/**
 * Returns a realistic "e.g. …" placeholder matched to WHAT the question
 * is asking.  Uses field name first (fast path), then falls back to
 * question text analysis.  Never returns a placeholder unrelated to the
 * question's semantic type.
 */
function inferPlaceholder(q: DraftOpenQuestion): string {
  const field = q.field.toLowerCase().replace(/[-_\s]/g, "");
  const text  = q.question.toLowerCase();

  // ── NDA / agreement parties ───────────────────────────────────────────────
  if (
    /(?:receivingparty|disclosingparty|recipient|disclosor)/.test(field) ||
    /\b(?:receiving\s+party|disclosing\s+party|recipient|disclosor)\b/.test(text)
  ) {
    return "e.g. Acme Corporation";
  }

  // ── General party / entity names ─────────────────────────────────────────
  if (
    /(?:party|parties|controller|processor|vendor|supplier|client|customer|company|organisation|organization|counterparty)/.test(field) ||
    /\b(?:full\s+(?:legal\s+)?name|name\s+of\s+the\s+(?:parties?|controller|processor|company|organisation)|legal\s+name|party\s+name)\b/.test(text)
  ) {
    return "e.g. Acme Ltd and DataCo International";
  }

  // ── Effective / commencement / start date ─────────────────────────────────
  if (
    /(?:effectivedate|commencedate|startdate)/.test(field) ||
    /effective\s+date|commencement\s+date|start\s+date/.test(text)
  ) {
    return "e.g. 1 Dec 2026";
  }

  // ── MSA / master/principal agreement date ────────────────────────────────
  if (
    /(?:msadate|principaldate|masterdate)/.test(field) ||
    /(?:principal|master)\s+(?:services\s+)?agreement|msa\s+date/.test(text)
  ) {
    return "e.g. 1 Dec 2026";
  }

  // ── Termination / expiry / end date ──────────────────────────────────────
  if (
    /(?:terminationdate|expirydate|expirationdate|enddate)/.test(field) ||
    /termination\s+date|expiry\s+date|expiration\s+date|end\s+date/.test(text)
  ) {
    return "e.g. 1 Dec 2027";
  }

  // ── Signature / execution date ───────────────────────────────────────────
  if (
    /(?:signdate|executiondate|signingdate)/.test(field) ||
    /signature\s+date|signing\s+date|execution\s+date|date\s+of\s+(?:last\s+)?signature/.test(text)
  ) {
    return "e.g. 1 Dec 2026";
  }

  // ── Any other date ────────────────────────────────────────────────────────
  if (/date/.test(field) || /\bdate\b/.test(text)) {
    return "e.g. 1 Dec 2026";
  }

  // ── Confidentiality / NDA duration ───────────────────────────────────────
  if (
    /(?:confidentialityperiod|ndaterm|confidentialityterm|survivaltermconfidentiality)/.test(field) ||
    /confidential(?:ity)?\s+(?:obligation|period|term|surviv|last)|how\s+long.*(?:confidential|nda|obligation)|(?:nda|obligation|confidential(?:ity)?)\s+(?:last|remain|survive|period|term)/.test(text)
  ) {
    return "e.g. 3 years";
  }

  // ── General retention / data period ──────────────────────────────────────
  if (
    /(?:retention|retain|storagperiod|dataretention)/.test(field) ||
    /retention\s+period|how\s+long.*(?:data|retain|keep|store)/.test(text)
  ) {
    return "e.g. 3 years after contract end";
  }

  // ── General duration / number / period ───────────────────────────────────
  if (
    DURATION_FIELD_RE.test(q.field) ||
    DURATION_QUESTION_RE.test(q.question)
  ) {
    // Try to pick up the unit from the question text
    if (/month/i.test(text)) return "e.g. 12 months";
    if (/day/i.test(text))   return "e.g. 30 days";
    if (/week/i.test(text))  return "e.g. 4 weeks";
    return "e.g. 3 years";
  }

  // ── Business purpose / data processing purpose ───────────────────────────
  if (
    /(?:purpose|businesspurpose|processingpurpose)/.test(field) ||
    /\b(?:purpose\s+of\s+(?:the\s+)?(?:processing|data|agreement|sharing|disclosure)|business\s+purpose|why\s+(?:is\s+)?(?:the\s+)?(?:data|information)|specific\s+(?:business\s+)?purpose)\b/.test(text)
  ) {
    return "e.g. Cloud hosting and analytics";
  }

  // ── Data categories ───────────────────────────────────────────────────────
  if (
    /(?:datacategor|datatype|personaldata|categories)/.test(field) ||
    /categor(?:ies|y)\s+of\s+(?:personal\s+)?data|type[s]?\s+of\s+(?:personal\s+)?data/.test(text)
  ) {
    return "e.g. Contact details, usage logs";
  }

  // ── Data subjects ─────────────────────────────────────────────────────────
  if (
    /(?:datasubject|subject)/.test(field) ||
    /\bdata\s+subject|whose\s+data\b/.test(text)
  ) {
    return "e.g. Employees, end users";
  }

  // ── Governing law / jurisdiction ─────────────────────────────────────────
  // (chips: placeholder won't be displayed, but included for completeness)
  if (
    GOVERNING_LAW_FIELD_RE.test(q.field) ||
    GOVERNING_LAW_QUESTION_RE.test(q.question)
  ) {
    return "e.g. England and Wales";
  }

  // ── Services / scope description ─────────────────────────────────────────
  if (
    /(?:service|scope|description)/.test(field) ||
    /description\s+of\s+(?:the\s+)?services?|scope\s+of/.test(text)
  ) {
    return "e.g. Software development and support services";
  }

  // ── Notice period ─────────────────────────────────────────────────────────
  if (
    /notice/.test(field) ||
    /notice\s+period/.test(text)
  ) {
    return "e.g. 30 days";
  }

  // ── Sub-processors ────────────────────────────────────────────────────────
  if (
    /(?:subprocessor|sub.?processor)/.test(field) ||
    /sub[\s-]?processor/.test(text)
  ) {
    return "e.g. AWS (hosting), Stripe (payments)";
  }

  // ── Contact / DPO ─────────────────────────────────────────────────────────
  if (
    /(?:contact|dpo|officer)/.test(field) ||
    /data\s+protection\s+officer|contact\s+(?:person|detail)/.test(text)
  ) {
    return "e.g. privacy@example.com";
  }

  // ── Long-form fallback ────────────────────────────────────────────────────
  if (resolveInputType(q) === "textarea") {
    return "e.g. Describe your answer here";
  }

  return "e.g. Your answer";
}

// ---------------------------------------------------------------------------
// Shared input class tokens
// ---------------------------------------------------------------------------

/** Original input style shared by TextInput, NumericInput, and TextareaInput. */
const INPUT_BASE =
  "w-full rounded-md border border-[#E4E4E7] bg-[#FAFAFA] px-2.5 py-1.5 text-[13px] text-[#3F3F46] " +
  "outline-none focus:border-[#A1A1AA] disabled:opacity-60 placeholder:text-[#C4C4C8]";

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

function DateInput({
  id,
  value,
  disabled,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <DatePicker
      id={id}
      value={value}
      disabled={disabled}
      onChange={onChange}
      placeholder={placeholder}
    />
  );
}

function TextInput({
  id,
  value,
  disabled,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={INPUT_BASE}
    />
  );
}

/**
 * Numeric input for duration / quantity questions.
 * Renders as type="text" with inputMode="numeric" to retain placeholder
 * support across browsers while restricting the virtual keyboard on mobile.
 */
function NumericInput({
  id,
  value,
  disabled,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Allow digits, spaces, and common unit words (e.g. "3 years", "30 days")
    const raw = e.target.value;
    // Only strip characters that are clearly not part of a valid answer
    onChange(raw);
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={value}
      disabled={disabled}
      onChange={handleChange}
      placeholder={placeholder}
      className={INPUT_BASE}
    />
  );
}

function TextareaInput({
  id,
  value,
  disabled,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      disabled={disabled}
      rows={3}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${INPUT_BASE} resize-none`}
    />
  );
}

/**
 * Chip group for single-select ("chips") and multi-select ("chips-multi").
 * Handles "Other (specify)" conditional text reveal.
 */
function ChipsInput({
  id,
  options,
  multi,
  value,
  disabled,
  onChange,
}: {
  id: string;
  options: string[];
  multi: boolean;
  /** Pipe-separated for multi; plain string for single. */
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  // Derive selected set from pipe-separated value
  const selected = new Set(value ? value.split("|").filter(Boolean) : []);

  // "Other (specify)" text lives in separate state but is
  // serialised back into the value on every change.
  const otherInitial = (() => {
    for (const v of selected) {
      if (!options.includes(v)) return v;
    }
    return "";
  })();
  const [otherText, setOtherText] = useState(otherInitial);

  const hasOtherOption = options.includes(OTHER_LABEL);
  const otherSelected  = selected.has(OTHER_LABEL) || (!!otherText && selected.has(otherText));

  function buildValue(nextSelected: Set<string>, nextOther: string): string {
    const parts: string[] = [];
    for (const s of nextSelected) {
      if (s === OTHER_LABEL) continue; // replace sentinel with actual text
      parts.push(s);
    }
    if ((nextSelected.has(OTHER_LABEL) || otherSelected) && nextOther.trim()) {
      parts.push(nextOther.trim());
    } else if (nextSelected.has(OTHER_LABEL) && !nextOther.trim()) {
      // Keep sentinel so chip stays highlighted until user types
      parts.push(OTHER_LABEL);
    }
    return parts.join("|");
  }

  function toggleChip(opt: string) {
    if (disabled) return;
    const next = new Set(selected);
    if (multi) {
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
    } else {
      // Radio behaviour
      if (next.has(opt)) {
        next.clear(); // deselect
      } else {
        next.clear();
        next.add(opt);
      }
    }
    onChange(buildValue(next, otherText));
  }

  function handleOtherTextChange(text: string) {
    setOtherText(text);
    const next = new Set(selected);
    if (!next.has(OTHER_LABEL)) next.add(OTHER_LABEL);
    onChange(buildValue(next, text));
  }

  const showOtherInput = hasOtherOption && (selected.has(OTHER_LABEL) || otherSelected);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSel =
            opt === OTHER_LABEL
              ? otherSelected || selected.has(OTHER_LABEL)
              : selected.has(opt);
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => toggleChip(opt)}
              className={`px-2.5 py-1 rounded-md text-[12px] border transition-colors ${
                isSel
                  ? "border-[#3F3F46] bg-[#3F3F46] text-white"
                  : "border-[#E4E4E7] bg-[#FAFAFA] text-[#52525B] hover:border-[#A1A1AA]"
              } disabled:opacity-60`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {showOtherInput && (
        <TextInput
          id={`${id}-other`}
          value={otherText}
          disabled={disabled}
          onChange={handleOtherTextChange}
          placeholder="e.g. Specify your answer"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolved display value for the read-only "submitted" state
// ---------------------------------------------------------------------------

function formatSubmittedAnswer(q: DraftOpenQuestion, raw: string): string {
  if (!raw) return "—";
  const inputType = resolveInputType(q);
  if (inputType === "chips" || inputType === "chips-multi") {
    return raw
      .split("|")
      .filter(Boolean)
      .filter((v) => v !== OTHER_LABEL)
      .join(", ");
  }
  if (inputType === "date") {
    try {
      const d = new Date(raw + "T00:00:00");
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }
    } catch {
      /* fall through */
    }
  }
  return raw;
}

// ---------------------------------------------------------------------------
// AskQuestionCard
// ---------------------------------------------------------------------------

function AskQuestionCard({
  messageId,
  content,
  questions,
  resolved,
  disabled,
  onSubmit,
}: {
  messageId: string;
  content: string;
  questions: DraftOpenQuestion[];
  resolved?: boolean;
  disabled?: boolean;
  onSubmit?: (messageId: string, answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) initial[q.id] = "";
    return initial;
  });

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  /**
   * An answer is "filled" when:
   * - date / text / textarea / number: non-empty trimmed string
   * - chips (single): something selected and "Other" sentinel replaced
   * - chips-multi: at least one chip selected and "Other" sentinel replaced
   */
  function isFilled(q: DraftOpenQuestion): boolean {
    const raw = (answers[q.id] || "").trim();
    if (!raw) return false;
    const inputType = resolveInputType(q);
    if (inputType === "chips" || inputType === "chips-multi") {
      const parts = raw.split("|").filter(Boolean);
      if (parts.length === 0) return false;
      if (parts.includes(OTHER_LABEL)) return false; // sentinel still present
    }
    return true;
  }

  const allFilled = questions.every(isFilled);

  /**
   * Normalise answers before submission:
   * - Strip "Other (specify)" sentinel (already replaced by actual text)
   * - Collapse pipe-separated chip values to comma-separated string
   */
  function buildFinalAnswers(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const q of questions) {
      const raw = answers[q.id] || "";
      const inputType = resolveInputType(q);
      if (inputType === "chips" || inputType === "chips-multi") {
        out[q.id] = raw
          .split("|")
          .filter(Boolean)
          .filter((v) => v !== OTHER_LABEL)
          .join(", ");
      } else {
        out[q.id] = raw.trim();
      }
    }
    return out;
  }

  return (
    <div className="flex items-start gap-2.5 max-w-[95%]">
      <div className="w-full rounded-xl border border-[#E4E4E7] bg-white px-4 py-3.5 shadow-sm">
        <p className="text-[13.5px] text-[#3F3F46] leading-[1.65] mb-3">{content}</p>
        <div className="space-y-3.5">
          {questions.map((q) => {
            const inputType = resolveInputType(q);
            const options   = resolveOptions(q);
            const placeholder = inferPlaceholder(q);
            return (
              <div key={q.id} className="space-y-1.5">
                <label
                  htmlFor={q.id}
                  className="block text-[12.5px] font-medium text-[#52525B] leading-snug"
                >
                  {q.question}
                  {q.severity === "critical" && (
                    <span className="ml-1 text-[#DC2626]">*</span>
                  )}
                </label>

                {/* ── Date picker ── */}
                {inputType === "date" && (
                  <DateInput
                    id={q.id}
                    value={answers[q.id] || ""}
                    disabled={!!(resolved || disabled)}
                    onChange={(v) => setAnswer(q.id, v)}
                    placeholder={placeholder}
                  />
                )}

                {/* ── Single-select chips ── */}
                {inputType === "chips" && (
                  <ChipsInput
                    id={q.id}
                    options={options}
                    multi={false}
                    value={answers[q.id] || ""}
                    disabled={!!(resolved || disabled)}
                    onChange={(v) => setAnswer(q.id, v)}
                  />
                )}

                {/* ── Multi-select chips ── */}
                {inputType === "chips-multi" && (
                  <ChipsInput
                    id={q.id}
                    options={options}
                    multi={true}
                    value={answers[q.id] || ""}
                    disabled={!!(resolved || disabled)}
                    onChange={(v) => setAnswer(q.id, v)}
                  />
                )}

                {/* ── Textarea (long free-form) ── */}
                {inputType === "textarea" && (
                  <TextareaInput
                    id={q.id}
                    value={answers[q.id] || ""}
                    disabled={!!(resolved || disabled)}
                    onChange={(v) => setAnswer(q.id, v)}
                    placeholder={placeholder}
                  />
                )}

                {/* ── Numeric (duration / quantity) ── */}
                {inputType === "number" && (
                  <NumericInput
                    id={q.id}
                    value={answers[q.id] || ""}
                    disabled={!!(resolved || disabled)}
                    onChange={(v) => setAnswer(q.id, v)}
                    placeholder={placeholder}
                  />
                )}

                {/* ── Text (short free-form, default) ── */}
                {inputType === "text" && (
                  <TextInput
                    id={q.id}
                    value={answers[q.id] || ""}
                    disabled={!!(resolved || disabled)}
                    onChange={(v) => setAnswer(q.id, v)}
                    placeholder={placeholder}
                  />
                )}

                {/* Read-only submitted display */}
                {resolved && (
                  <p className="text-[12px] text-[#71717A]">
                    {formatSubmittedAnswer(q, answers[q.id] || "")}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {!resolved && (
          <button
            type="button"
            disabled={disabled || !allFilled}
            onClick={() => onSubmit?.(messageId, buildFinalAnswers())}
            className="mt-3.5 w-full rounded-lg bg-[#18181B] text-white text-[13px] font-medium py-2 disabled:opacity-40 hover:bg-[#27272A] transition-colors"
          >
            Continue drafting
          </button>
        )}
        {resolved && (
          <p className="mt-3 text-[12px] text-[#71717A] italic">Answers submitted.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel props & supporting components
// ---------------------------------------------------------------------------

interface DraftChatPanelProps {
  title: string;
  messages: DraftChatMessage[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  onFileSelect: (file: File) => void;
  onRemoveFile: () => void;
  attachedFileName?: string;
  isLoading?: boolean;
  isParsing?: boolean;
  isDragging: boolean;
  composerPlaceholder?: string;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  /** Called when user submits answers for an ASK card. */
  onAskSubmit?: (messageId: string, answers: Record<string, string>) => void;
}

function FollowUpCard({
  author,
  isAi,
  isProgress,
  children,
}: {
  author: string;
  isAi?: boolean;
  isProgress?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={`draft-followup-card${isAi ? " is-ai" : ""}`}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            isAi ? "bg-[#EEF2FF] text-[#4F5BD9]" : "bg-[#0F172A] text-white"
          }`}
        >
          {isAi ? <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} /> : author.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
            {author}
          </p>
          {isProgress && (
            <p className="m-0 mt-0.5 text-[11px] text-[#98A2B3]">Working…</p>
          )}
        </div>
      </div>
      <div
        className={`text-[13px] leading-[1.65] whitespace-pre-wrap ${
          isProgress ? "text-[#667085]" : "text-[#1a1a1a]"
        }`}
      >
        {children}
      </div>
    </article>
  );
}

export default function DraftChatPanel({
  title,
  messages,
  inputValue,
  onInputChange,
  onSubmit,
  onFileSelect,
  onRemoveFile,
  attachedFileName,
  isLoading = false,
  isParsing = false,
  isDragging,
  composerPlaceholder = "Ask a follow-up…",
  onDragOver,
  onDragLeave,
  onDrop,
  onAskSubmit,
}: DraftChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const visibleCount = messages.filter((m) => m.kind !== "progress").length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden font-sans">
      <header className="flex min-h-[56px] shrink-0 items-center justify-between gap-3 border-b border-slate-200/60 px-5 py-3">
        <div className="min-w-0">
          <p className="m-0 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
            Ask AI
          </p>
          <p className="m-0 mt-0.5 truncate text-[15px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
            {title || "Follow-ups"}
          </p>
        </div>
        <span className="score-badge shrink-0 bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9]">
          {visibleCount}
        </span>
      </header>

      <div className="draft-chat-stage relative min-h-0 flex-1">
        {/*
          pb-32: extra bottom padding so the last question card never sits
          behind the floating composer bar.
        */}
        <div className="scrollbar-hide h-full space-y-3.5 overflow-y-auto px-4 pb-28 pt-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#4F5BD9] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <Sparkles className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <p className="m-0 max-w-[220px] text-[13px] leading-relaxed text-[#667085]">
                Ask a follow-up about this draft — tighten a clause, change tone, or add a section.
              </p>
            </div>
          )}
          {messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <FollowUpCard key={msg.id} author="You">
                  {msg.content}
                </FollowUpCard>
              );
            }

            if (msg.kind === "ask" && msg.questions?.length) {
              return (
                <AskQuestionCard
                  key={msg.id}
                  messageId={msg.id}
                  content={msg.content}
                  questions={msg.questions}
                  resolved={msg.askResolved}
                  disabled={isLoading}
                  onSubmit={onAskSubmit}
                />
              );
            }

            if (msg.kind === "example") {
              return (
                <FollowUpCard key={msg.id} author="LORA" isAi>
                  {msg.content}
                </FollowUpCard>
              );
            }

            return (
              <FollowUpCard
                key={msg.id}
                author="LORA"
                isAi
                isProgress={msg.kind === "progress"}
              >
                {msg.content}
              </FollowUpCard>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#FAFBFD] via-[#FAFBFD]/90 to-transparent px-4 pb-4 pt-8">
          <div className="pointer-events-auto">
            <DraftComposer
              variant="chat"
              value={inputValue}
              onChange={onInputChange}
              onSubmit={onSubmit}
              onFileSelect={onFileSelect}
              onRemoveFile={onRemoveFile}
              attachedFileName={attachedFileName}
              isLoading={isLoading}
              isParsing={isParsing}
              isDragging={isDragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              placeholder={composerPlaceholder}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
