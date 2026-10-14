import { useRef, useEffect, useState, useMemo, ReactNode } from "react";
import { Sparkles, HelpCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { DraftComposer } from "./DraftComposer";
import { DatePicker } from "./DatePicker";
import type { DraftChatMessage } from "../hooks/useDraftChat";
import type { DraftOpenQuestion, QuestionInputType } from "../api/draftingJobs";

const LORA_MARK = "/images/logo/favicon.png";

export function LoraAvatar({
  isLoading = false,
  size = 26,
  className = "",
}: {
  isLoading?: boolean;
  size?: number;
  className?: string;
}) {
  const boxSize = size + 10;
  const center = boxSize / 2;
  const radius = boxSize / 2 - 1.5;

  return (
    <div
      className={`relative shrink-0 flex items-center justify-center ${className}`}
      style={{ width: boxSize, height: boxSize }}
    >
      {isLoading && (
        <svg
          className="absolute inset-0 w-full h-full animate-spin text-[#4F5BD9]"
          viewBox={`0 0 ${boxSize} ${boxSize}`}
          fill="none"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="currentColor"
            strokeOpacity="0.16"
            strokeWidth="2"
          />
          <path
            d={`M ${center} ${center - radius} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      )}
      <img
        src={LORA_MARK}
        alt="LORA"
        width={size}
        height={size}
        className={`relative rounded-[7px] object-cover shadow-sm transition-transform duration-200 ${
          isLoading ? "scale-[0.88]" : ""
        }`}
        style={{ width: size, height: size }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OTHER_LABEL = "Other (specify)";

/**
 * Fallback chip options injected when the backend omits options[] for a
 * governing-law / country jurisdiction question.
 */
const GOVERNING_LAW_OPTIONS = [
  "Republic of Ireland",
  "Germany",
  "England and Wales (UK)",
  "United States (Delaware)",
  "India",
  "Other (specify)",
];

/**
 * Fallback chip options injected when asking for a statutory privacy regime.
 */
const PRIVACY_REGIME_OPTIONS = [
  "GDPR (European Union)",
  "UK GDPR (England & Wales)",
  "CCPA / CPRA (United States)",
  "DPDPA (India)",
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
 * Matches field names clearly related to privacy / data protection regimes.
 */
const PRIVACY_REGIME_FIELD_RE =
  /(?:privacy_?regime|regime|privacy_?law|data_?protection_?law)/i;

/**
 * Matches question text asking for a data protection / privacy regime.
 */
const PRIVACY_REGIME_QUESTION_RE =
  /\b(?:data\s+protection\s+law|privacy\s+regime|gdpr|dpdpa|ccpa|cpra)\b/i;

export function isPrivacyRegimeQuestion(q: DraftOpenQuestion): boolean {
  return (
    PRIVACY_REGIME_FIELD_RE.test(q.field) ||
    PRIVACY_REGIME_QUESTION_RE.test(q.question)
  );
}

/**
 * Matches field names clearly related to governing law / jurisdiction / country.
 */
const GOVERNING_LAW_FIELD_RE =
  /(?:governing_?law|jurisdiction|venue|forum|choice_of_law|applicable_law|country)/i;

/**
 * Matches question text asking for governing law / jurisdiction / country.
 */
const GOVERNING_LAW_QUESTION_RE =
  /\b(?:governing\s+law|which\s+(?:jurisdiction|country|state)|applicable\s+law|law\s+(?:that\s+)?(?:should\s+)?govern|jurisdiction(?:'s)?\s+laws?|choice\s+of\s+law|legal\s+venue|venue\s+for\s+disputes?)\b/i;

export function isGoverningLawQuestion(q: DraftOpenQuestion): boolean {
  if (isPrivacyRegimeQuestion(q)) return false;
  return (
    GOVERNING_LAW_FIELD_RE.test(q.field) ||
    GOVERNING_LAW_QUESTION_RE.test(q.question)
  );
}

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

  // 4. Privacy regime or governing law → chips (options will be injected)
  if (isPrivacyRegimeQuestion(q) || isGoverningLawQuestion(q)) {
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
function withIndiaOption(options: string[]): string[] {
  if (
    options.some(
      (opt) =>
        opt.toLowerCase().includes("india") ||
        opt.toLowerCase().includes("dpdpa")
    )
  ) {
    return options;
  }
  const otherIdx = options.findIndex((opt) => opt === OTHER_LABEL);
  if (otherIdx < 0) return [...options, "DPDPA (India)"];
  return [...options.slice(0, otherIdx), "DPDPA (India)", ...options.slice(otherIdx)];
}

function displayQuestion(q: DraftOpenQuestion): string {
  if (isPrivacyRegimeQuestion(q)) {
    return "Which data protection law should this agreement follow?";
  }
  if (isGoverningLawQuestion(q)) {
    return "Which country's governing law should apply?";
  }
  if (q.question && q.question.trim().length > 0) {
    return q.question.trim();
  }
  return q.field || "Please provide details";
}

function displayReason(q: DraftOpenQuestion): string {
  if (isPrivacyRegimeQuestion(q)) {
    return "The clauses to draft depend on the statutory privacy regime (e.g. GDPR, UK GDPR, CCPA, DPDPA).";
  }
  if (isGoverningLawQuestion(q)) {
    return "Governing law determines the court jurisdiction and dispute forum governing this agreement.";
  }
  return q.reasonRequired || "";
}

function resolveOptions(q: DraftOpenQuestion): string[] {
  const isLaw = isGoverningLawQuestion(q);
  const isPrivacy = isPrivacyRegimeQuestion(q);

  if (isLaw) {
    const rawOpts = q.options && q.options.length > 0 ? q.options : GOVERNING_LAW_OPTIONS;
    const cleanOpts = rawOpts.filter((opt) => !/\b(eu|european union)\b/i.test(opt));
    return withIndiaOption(cleanOpts.length >= 3 ? cleanOpts : GOVERNING_LAW_OPTIONS);
  }

  if (isPrivacy) {
    const rawOpts = q.options && q.options.length > 0 ? q.options : PRIVACY_REGIME_OPTIONS;
    return withIndiaOption(rawOpts);
  }

  const inputType = resolveInputType(q);
  if (inputType !== "chips" && inputType !== "chips-multi") return [];

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
  // ── 0. AI or Backend provided explicit example / placeholder ───────────────
  const explicit = (q.placeholder || q.example || "").trim();
  if (explicit) {
    if (
      explicit.toLowerCase().startsWith("select") ||
      explicit.toLowerCase().startsWith("choose")
    ) {
      return explicit;
    }
    return explicit.startsWith("e.g.") ? explicit : `e.g. ${explicit}`;
  }

  const field = q.field.toLowerCase().replace(/[-_\s]/g, "");
  const text  = q.question.toLowerCase();

  // ── 1. Name AND Address (e.g. legal name & address of client / counterparty) ───
  if (
    (/\b(?:address|street|city|state|zip|location|office)\b/.test(text) || /address/.test(field)) &&
    (/\b(?:name|company|entity|party|client|counterparty|vendor|supplier|contractor)\b/.test(text) ||
     /(?:name|company|entity|party|client|counterparty|vendor)/.test(field))
  ) {
    return "e.g. Acme Corp, 100 Innovation Way, Suite 400, Wilmington, DE 19801";
  }

  // ── 2. Address only ────────────────────────────────────────────────────────
  if (
    /address/.test(field) ||
    /\b(?:registered\s+office|principal\s+address|street\s+address|official\s+address)\b/.test(text) ||
    /\b(?:address)\b/.test(text)
  ) {
    return "e.g. 100 Innovation Way, Suite 400, Wilmington, DE 19801";
  }

  // ── 3. Authorized Signatories / Signers ─────────────────────────────────────
  if (
    /(?:signator|signer|authorizedsign)/.test(field) ||
    /\b(?:signator(?:y|ies)|signers?|authorized\s+to\s+sign|signing\s+officers?)\b/.test(text)
  ) {
    return "e.g. Jane Doe (CEO) & John Smith (VP)";
  }

  // ── 4. Single entity signals check (prevents dual-party placeholder when single party is asked) ──
  const isSinglePartyAsk =
    /\b(?:first|second|party\s*[12ab]|disclosing|receiving|client|vendor|supplier|customer|employer|employee|contractor|fiduciary|processor)\b/i.test(text) ||
    /(?:first|second|partya|partyb|party1|party2|disclosing|receiving|client|vendor|customer|employer|employee)/.test(field);

  // ── 5. Both parties together (only when explicitly asking for both) ───────────
  if (
    !isSinglePartyAsk &&
    (field === "parties" ||
      /\b(?:both\s+parties|parties\s+to\s+this|names\s+of\s+both|contracting\s+parties)\b/.test(text))
  ) {
    return "e.g. Acme Ltd and DataCo International";
  }

  // ── 6. Single party / entity name (Client, Counterparty, Party A, Party B, etc.) ──
  if (
    isSinglePartyAsk ||
    /(?:firstcompany|secondcompany|partya|partyb|party1|party2|disclosingparty|receivingparty|recipient|disclosor|client|customer|vendor|supplier|controller|processor|employer|employee|contractor|fiduciary)/.test(field) ||
    /\b(?:first\s+company|second\s+company|counterparty|client|vendor|supplier|data\s+controller|data\s+processor|data\s+fiduciary|employee|employer|contractor|receiving\s+party|disclosing\s+party)\b/.test(text)
  ) {
    return "e.g. Acme Technologies Inc.";
  }

  // ── 7. General party / entity names fallback ───────────────────────────────
  if (
    /(?:party|parties|controller|processor|vendor|supplier|client|customer|company|organisation|organization|counterparty)/.test(field) ||
    /\b(?:full\s+(?:legal\s+)?name|name\s+of\s+the\s+(?:parties?|controller|processor|company|organisation)|legal\s+name|party\s+name)\b/.test(text)
  ) {
    return "e.g. Acme Technologies Inc.";
  }

  // ── 7. Effective / commencement / start date ─────────────────────────────────
  if (
    /(?:effectivedate|commencedate|startdate)/.test(field) ||
    /effective\s+date|commencement\s+date|start\s+date/.test(text)
  ) {
    return "e.g. 1 Dec 2026";
  }

  // ── 8. MSA / master/principal agreement date ────────────────────────────────
  if (
    /(?:msadate|principaldate|masterdate)/.test(field) ||
    /(?:principal|master)\s+(?:services\s+)?agreement|msa\s+date/.test(text)
  ) {
    return "e.g. 1 Dec 2026";
  }

  // ── 9. Termination / expiry / end date ──────────────────────────────────────
  if (
    /(?:terminationdate|expirydate|expirationdate|enddate)/.test(field) ||
    /termination\s+date|expiry\s+date|expiration\s+date|end\s+date/.test(text)
  ) {
    return "e.g. 1 Dec 2027";
  }

  // ── 10. Signature / execution date ───────────────────────────────────────────
  if (
    /(?:signdate|executiondate|signingdate)/.test(field) ||
    /signature\s+date|signing\s+date|execution\s+date|date\s+of\s+(?:last\s+)?signature/.test(text)
  ) {
    return "e.g. 1 Dec 2026";
  }

  // ── 11. Any other date ────────────────────────────────────────────────────────
  if (/date/.test(field) || /\bdate\b/.test(text)) {
    return "e.g. 1 Dec 2026";
  }

  // ── 12. Confidentiality / NDA duration ───────────────────────────────────────
  if (
    /(?:confidentialityperiod|ndaterm|confidentialityterm|survivaltermconfidentiality)/.test(field) ||
    /confidential(?:ity)?\s+(?:obligation|period|term|surviv|last)|how\s+long.*(?:confidential|nda|obligation)|(?:nda|obligation|confidential(?:ity)?)\s+(?:last|remain|survive|period|term)/.test(text)
  ) {
    return "e.g. 3 years";
  }

  // ── 13. General retention / data period ──────────────────────────────────────
  if (
    /(?:retention|retain|storagperiod|dataretention)/.test(field) ||
    /retention\s+period|how\s+long.*(?:data|retain|keep|store)/.test(text)
  ) {
    return "e.g. 3 years after contract end";
  }

  // ── 14. Liability cap ───────────────────────────────────────────────────────
  if (
    /(?:liability|liabilitycap|caponliability)/.test(field) ||
    /\b(?:liability\s+cap|limit\s+of\s+liability|limitation\s+of\s+liability|cap\s+on\s+liability)\b/.test(text)
  ) {
    return "e.g. 12 months' fees (or $1,000,000)";
  }

  // ── 15. Breach notification SLA ─────────────────────────────────────────────
  if (
    /(?:breach|breachnotification|breachnotice|breachsla)/.test(field) ||
    /\b(?:breach\s+(?:notification|notice|window|hours?|sla)|security\s+incident)\b/.test(text)
  ) {
    return "e.g. 48 hours (or 72 hours)";
  }

  // ── 16. Sub-processor / Audit notice period ─────────────────────────────────
  if (
    /(?:subprocessor|auditnotice|subprocessornotice)/.test(field) ||
    /\b(?:sub[\s-]?processor\s+(?:notice|objection)|audit\s+notice)\b/.test(text)
  ) {
    return "e.g. 30 days";
  }

  // ── 17. Payment terms / fees ────────────────────────────────────────────────
  if (
    /(?:payment|paymentterms|fee|fees|pricing)/.test(field) ||
    /\b(?:payment\s+terms?|fees?|invoic|billing)\b/.test(text)
  ) {
    return "e.g. Net 30 days";
  }

  // ── 18. General duration / number / period ───────────────────────────────────
  if (
    DURATION_FIELD_RE.test(q.field) ||
    DURATION_QUESTION_RE.test(q.question)
  ) {
    if (/month/i.test(text)) return "e.g. 12 months";
    if (/day/i.test(text))   return "e.g. 30 days";
    if (/week/i.test(text))  return "e.g. 4 weeks";
    return "e.g. 3 years";
  }

  // ── 19. Business purpose / data processing purpose ───────────────────────────
  if (
    /(?:purpose|businesspurpose|processingpurpose)/.test(field) ||
    /\b(?:purpose\s+of\s+(?:the\s+)?(?:processing|data|agreement|sharing|disclosure)|business\s+purpose|why\s+(?:is\s+)?(?:the\s+)?(?:data|information)|specific\s+(?:business\s+)?purpose)\b/.test(text)
  ) {
    return "e.g. Evaluating commercial partnership and sharing confidential information";
  }

  // ── 20. Data categories ───────────────────────────────────────────────────────
  if (
    /(?:datacategor|datatype|personaldata|categories)/.test(field) ||
    /categor(?:ies|y)\s+of\s+(?:personal\s+)?data|type[s]?\s+of\s+(?:personal\s+)?data/.test(text)
  ) {
    return "e.g. Contact details, usage logs, user IDs";
  }

  // ── 21. Data subjects ─────────────────────────────────────────────────────────
  if (
    /(?:datasubject|subject)/.test(field) ||
    /\bdata\s+subject|whose\s+data\b/.test(text)
  ) {
    return "e.g. Employees, end users, customers";
  }

  // ── 22. Services / scope description ─────────────────────────────────────────
  if (
    /(?:service|scope|description)/.test(field) ||
    /description\s+of\s+(?:the\s+)?services?|scope\s+of/.test(text)
  ) {
    return "e.g. Software development, hosting, and technical support";
  }

  // ── 23. Notice period ─────────────────────────────────────────────────────────
  if (/notice/.test(field) || /notice\s+period/.test(text)) {
    return "e.g. 30 days";
  }

  // ── 24. Contact / DPO ─────────────────────────────────────────────────────────
  if (
    /(?:contact|dpo|officer)/.test(field) ||
    /data\s+protection\s+officer|contact\s+(?:person|detail)/.test(text)
  ) {
    return "e.g. privacy@example.com";
  }

  // ── 25. Long-form fallback ────────────────────────────────────────────────────
  if (resolveInputType(q) === "textarea") {
    return "e.g. Describe your answer here";
  }

  return "e.g. Your answer";
}

// ---------------------------------------------------------------------------
// Shared input class tokens
// ---------------------------------------------------------------------------

/** Premium input style shared by TextInput, NumericInput, and TextareaInput. */
const INPUT_BASE =
  "w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 py-2 text-[13px] font-medium text-[#0F172A] " +
  "outline-none transition-all duration-150 focus:border-[#4F5BD9] focus:bg-white focus:ring-2 focus:ring-[#4F5BD9]/15 " +
  "disabled:opacity-60 placeholder:text-[#94A3B8] placeholder:font-normal";

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

/**
 * Strips 'e.g. ', 'example: ', outer quotes and ignores generic directive text
 * so pressing Tab fills a clean, production-ready value.
 */
export function cleanPlaceholderValue(placeholder?: string): string {
  if (!placeholder) return "";
  let clean = placeholder.trim();
  clean = clean.replace(/^(?:e\.?g\.?|example|ex\.?)\s*[:\-–]?\s*/i, "");
  clean = clean.replace(/^["'“](.*)["'”]$/, "$1").trim();
  if (/^(?:select|choose|specify|enter|describe|provide|your\s+answer)\b/i.test(clean)) {
    return "";
  }
  return clean;
}

function TabBadge({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`flex items-center gap-1 rounded bg-slate-200/90 hover:bg-[#4F5BD9] hover:text-white px-2 py-0.5 text-[10.5px] font-semibold text-slate-600 transition-all shadow-xs cursor-pointer border border-slate-300/70 select-none animate-in fade-in duration-150 ${className}`}
      title="Press Tab to fill example"
    >
      <span>Tab ⇥</span>
    </button>
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
  const candidate = cleanPlaceholderValue(placeholder);
  const [isFocused, setIsFocused] = useState(false);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab" && !e.shiftKey) {
      if (!value.trim() && candidate) {
        e.preventDefault();
        onChange(candidate);
      }
    }
  }

  return (
    <div className="relative w-full">
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_BASE} ${candidate ? "pr-18" : ""}`}
      />
      {isFocused && !value.trim() && candidate && (
        <TabBadge
          onClick={() => onChange(candidate)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2"
        />
      )}
    </div>
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
  const candidate = cleanPlaceholderValue(placeholder);
  const [isFocused, setIsFocused] = useState(false);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab" && !e.shiftKey) {
      if (!value.trim() && candidate) {
        e.preventDefault();
        onChange(candidate);
      }
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Allow digits, spaces, and common unit words (e.g. "3 years", "30 days")
    const raw = e.target.value;
    onChange(raw);
  }

  return (
    <div className="relative w-full">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        placeholder={placeholder}
        className={`${INPUT_BASE} ${candidate ? "pr-18" : ""}`}
      />
      {isFocused && !value.trim() && candidate && (
        <TabBadge
          onClick={() => onChange(candidate)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2"
        />
      )}
    </div>
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
  const candidate = cleanPlaceholderValue(placeholder);
  const [isFocused, setIsFocused] = useState(false);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && !e.shiftKey) {
      if (!value.trim() && candidate) {
        e.preventDefault();
        onChange(candidate);
      }
    }
  }

  return (
    <div className="relative w-full">
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        rows={3}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_BASE} resize-none ${candidate ? "pb-8" : ""}`}
      />
      {isFocused && !value.trim() && candidate && (
        <TabBadge
          onClick={() => onChange(candidate)}
          className="absolute right-2.5 bottom-2.5"
        />
      )}
    </div>
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
  placeholder,
}: {
  id: string;
  options: string[];
  multi: boolean;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const hasOtherOption = options.includes(OTHER_LABEL);
  const candidate = cleanPlaceholderValue(placeholder);

  const matchedOpt = useMemo(() => {
    if (!candidate || !options.length) return undefined;
    const lower = candidate.toLowerCase();
    return options.find(
      (opt) =>
        opt !== OTHER_LABEL &&
        (opt.toLowerCase() === lower ||
          opt.toLowerCase().includes(lower) ||
          lower.includes(opt.toLowerCase()))
    );
  }, [candidate, options]);

  // Track standard options that are selected
  const selectedStandard = useMemo(() => {
    if (!value) return new Set<string>();
    const items = value.split("|").filter(Boolean);
    return new Set(items.filter((item) => options.includes(item) && item !== OTHER_LABEL));
  }, [value, options]);

  // Extract initial custom other text (if any item is not a standard option)
  const initialOtherText = useMemo(() => {
    if (!value) return "";
    const items = value.split("|").filter(Boolean);
    const custom = items.find((item) => !options.includes(item) && item !== OTHER_LABEL);
    return custom ?? "";
  }, [value, options]);

  const [otherText, setOtherText] = useState(initialOtherText);

  // Determine if "Other (specify)" is currently active
  const isOtherActive = useMemo(() => {
    if (!hasOtherOption) return false;
    if (!value) return false;
    const items = value.split("|").filter(Boolean);
    return (
      items.includes(OTHER_LABEL) ||
      items.some((item) => !options.includes(item))
    );
  }, [hasOtherOption, value, options]);

  // Sync internal otherText state when value changes externally
  useEffect(() => {
    if (initialOtherText && initialOtherText !== otherText) {
      setOtherText(initialOtherText);
    }
  }, [initialOtherText]);

  function toggleChip(opt: string) {
    if (disabled) return;

    if (opt === OTHER_LABEL) {
      if (multi) {
        if (isOtherActive) {
          // Deselect Other
          const nextParts = Array.from(selectedStandard);
          onChange(nextParts.join("|"));
        } else {
          // Select Other
          const customVal = otherText.trim() || OTHER_LABEL;
          const nextParts = [...Array.from(selectedStandard), customVal];
          onChange(nextParts.join("|"));
        }
      } else {
        // Single select radio
        if (isOtherActive) {
          onChange("");
        } else {
          const customVal = otherText.trim() || OTHER_LABEL;
          onChange(customVal);
        }
      }
      return;
    }

    // Standard option clicked
    if (multi) {
      const next = new Set(selectedStandard);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);

      const parts = Array.from(next);
      if (isOtherActive) {
        parts.push(otherText.trim() || OTHER_LABEL);
      }
      onChange(parts.join("|"));
    } else {
      // Single select radio: deselect if already selected, otherwise select opt and deactivate Other
      if (selectedStandard.has(opt) && !isOtherActive) {
        onChange("");
      } else {
        onChange(opt);
      }
    }
  }

  function handleOtherTextChange(text: string) {
    setOtherText(text);
    const customVal = text.trim() ? text : OTHER_LABEL;

    if (multi) {
      const parts = Array.from(selectedStandard);
      parts.push(customVal);
      onChange(parts.join("|"));
    } else {
      onChange(customVal);
    }
  }

  const showOtherInput = hasOtherOption && isOtherActive;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSel =
            opt === OTHER_LABEL ? isOtherActive : selectedStandard.has(opt);
          const isRecommended = !value && opt === matchedOpt;
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => toggleChip(opt)}
              onKeyDown={(e) => {
                if (e.key === "Tab" && !e.shiftKey && !value && matchedOpt) {
                  e.preventDefault();
                  toggleChip(matchedOpt);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                isSel
                  ? "border-[#4F5BD9] bg-[#4F5BD9] text-white shadow-sm"
                  : isRecommended
                  ? "border-[#4F5BD9]/50 bg-indigo-50/70 text-[#4F5BD9] hover:bg-indigo-100/60"
                  : "border-slate-200/80 bg-slate-50/80 text-slate-600 hover:border-slate-300 hover:bg-slate-100/70"
              } disabled:opacity-60`}
            >
              <span>{opt}</span>
              {isRecommended && (
                <span className="rounded bg-[#4F5BD9]/15 text-[#4F5BD9] px-1 py-0.2 text-[9.5px] font-semibold">
                  Tab ⇥
                </span>
              )}
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
    const unique = Array.from(
      new Set(
        raw
          .split("|")
          .filter(Boolean)
          .filter((v) => v !== OTHER_LABEL)
      )
    );
    return unique.join(", ");
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

function deduplicateQuestions(raw: DraftOpenQuestion[]): DraftOpenQuestion[] {
  const result: DraftOpenQuestion[] = [];
  let seenPrivacy = false;
  let seenLaw = false;
  let seenDate = false;
  const seenFields = new Set<string>();

  for (const q of raw) {
    if (isPrivacyRegimeQuestion(q)) {
      if (seenPrivacy) continue;
      seenPrivacy = true;
    } else if (isGoverningLawQuestion(q)) {
      if (seenLaw) continue;
      seenLaw = true;
    }

    const isDate =
      DATE_FIELD_RE.test(q.field) || DATE_QUESTION_RE.test(q.question);
    if (isDate) {
      if (seenDate) continue;
      seenDate = true;
    }

    const fieldKey = (q.field || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (fieldKey && seenFields.has(fieldKey)) {
      continue;
    }
    if (fieldKey) seenFields.add(fieldKey);

    result.push(q);
  }

  return result;
}

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
  const filteredQuestions = useMemo(
    () => deduplicateQuestions(questions),
    [questions]
  );

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

  const allFilled = filteredQuestions.every(isFilled);

  /**
   * Normalise answers before submission:
   * - Strip "Other (specify)" sentinel (already replaced by actual text)
   * - Collapse pipe-separated chip values to comma-separated string
   * - Forward governing law answer to any duplicate law fields that were hidden
   */
  function buildFinalAnswers(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const q of filteredQuestions) {
      const raw = answers[q.id] || "";
      const inputType = resolveInputType(q);
      if (inputType === "chips" || inputType === "chips-multi") {
        const unique = Array.from(
          new Set(
            raw
              .split("|")
              .filter(Boolean)
              .filter((v) => v !== OTHER_LABEL)
          )
        );
        out[q.id] = unique.join(", ");
      } else {
        out[q.id] = raw.trim();
      }
    }

    // Forward answers to any duplicate fields that were hidden from UI
    for (const q of questions) {
      if (!out[q.id]) {
        if (isPrivacyRegimeQuestion(q)) {
          const privQ = filteredQuestions.find(isPrivacyRegimeQuestion);
          if (privQ && out[privQ.id]) {
            out[q.id] = out[privQ.id];
          }
        } else if (isGoverningLawQuestion(q)) {
          const lawQ = filteredQuestions.find(isGoverningLawQuestion);
          if (lawQ && out[lawQ.id]) {
            out[q.id] = out[lawQ.id];
          }
        }
      }
    }

    return out;
  }

  return (
    <article className="draft-followup-card is-ai">
      <div className="mb-3 flex items-start gap-2.5">
        <LoraAvatar isLoading={false} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="m-0 text-[13px] font-semibold tracking-[-0.01em] text-[#0F172A]">
              LORA
            </p>
            {resolved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Details provided
              </span>
            ) : (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10.5px] font-semibold text-[#4F5BD9]">
                {filteredQuestions.length}{" "}
                {filteredQuestions.length === 1
                  ? "detail required"
                  : "details required"}
              </span>
            )}
          </div>
          <p className="m-0 mt-1 text-[12.5px] text-[#475467] leading-relaxed">
            {content || "Please provide the following details to complete your draft:"}
          </p>
        </div>
      </div>

      <div className="pl-[36px] space-y-3.5">
        {resolved ? (
          <div className="space-y-2">
            {filteredQuestions.map((q) => {
              const ans = formatSubmittedAnswer(q, answers[q.id] || "");
              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-200/70 bg-white/90 p-2.5 shadow-sm"
                >
                  <p className="m-0 text-[11px] font-medium text-[#64748B]">
                    {displayQuestion(q)}
                  </p>
                  <p className="m-0 mt-1 text-[13px] font-semibold text-[#0F172A]">
                    {ans || <span className="text-slate-400 italic font-normal">Not specified</span>}
                  </p>
                </div>
              );
            })}
            <div className="flex items-center gap-1.5 pt-1 text-[11.5px] font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Answers incorporated into draft</span>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {filteredQuestions.map((q) => {
                const inputType = resolveInputType(q);
                const options = resolveOptions(q);
                const placeholder = inferPlaceholder(q);
                return (
                  <div
                    key={q.id}
                    className="space-y-1.5 rounded-xl border border-slate-200/70 bg-white/90 p-3 shadow-sm transition-all focus-within:border-[#4F5BD9]/50 focus-within:shadow-[0_2px_8px_rgba(79,91,217,0.08)]"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <label
                        htmlFor={q.id}
                        className="block text-[13px] font-semibold text-[#1E293B] leading-snug"
                      >
                        {displayQuestion(q)}
                        {q.severity === "critical" && (
                          <span className="ml-1 text-[#EF4444] font-bold" title="Required">*</span>
                        )}
                      </label>
                      {q.severity === "critical" && (
                        <span className="shrink-0 rounded bg-rose-50 border border-rose-200/60 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">
                          Required
                        </span>
                      )}
                    </div>

                    {displayReason(q) && (
                      <p className="m-0 text-[11.5px] text-[#64748B] leading-relaxed">
                        {displayReason(q)}
                      </p>
                    )}

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
                        placeholder={placeholder}
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
                        placeholder={placeholder}
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
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              disabled={disabled || !allFilled}
              onClick={() => onSubmit?.(messageId, buildFinalAnswers())}
              className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4F5BD9] to-[#3B46B8] py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(79,91,217,0.24)] transition-all hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>Submit & Resume Drafting</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </article>
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
  progressMessage?: string;
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
  const isLora = isAi || author === "LORA";

  return (
    <article className={`draft-followup-card${isAi ? " is-ai" : ""}${isProgress ? " is-progress" : ""}`}>
      <div className="mb-2.5 flex items-center gap-2.5">
        {isLora ? (
          <LoraAvatar isLoading={isProgress} size={28} />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-[11px] font-semibold text-white">
            {author.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="m-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
              {author}
            </p>
          </div>
          {isProgress ? (
            <p className="m-0 mt-0.5 text-[11px]">
              <span className="draft-status-shimmer">Working…</span>
            </p>
          ) : (
            <p className="m-0 mt-0.5 text-[11px] text-[#98A2B3]">
              {isLora ? "AI Legal Assistant" : "You"}
            </p>
          )}
        </div>
      </div>
      <div
        className={`text-[13px] leading-[1.65] whitespace-pre-wrap ${
          isProgress ? "text-[#475467] font-medium" : "text-[#1a1a1a]"
        }`}
      >
        {isProgress ? (
          <div className="draft-status-shimmer text-[13.5px]">
            {children}
          </div>
        ) : (
          children
        )}
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
  progressMessage,
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
  }, [messages, isLoading]);

  const visibleCount = messages.filter((m) => m.kind !== "progress").length;
  const hasActiveProgressMsg = messages.some((m) => m.kind === "progress");

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
        <div className="flex items-center gap-2">
          <span className="score-badge shrink-0 bg-[#EEF2FF] text-[11px] font-medium text-[#4F5BD9]">
            {visibleCount}
          </span>
        </div>
      </header>

      <div className="draft-chat-stage relative min-h-0 flex-1">
        {/*
          pb-32: extra bottom padding so the last question card never sits
          behind the floating composer bar.
        */}
        <div className="scrollbar-hide h-full space-y-3.5 overflow-y-auto px-4 pb-28 pt-4">
          {messages.length === 0 && !isLoading && (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <img
                src={LORA_MARK}
                alt="LORA"
                width={36}
                height={36}
                className="mb-3 h-9 w-9 shrink-0 rounded-[10px] object-cover shadow-[0_1px_3px_rgba(16,24,40,0.08)]"
              />
              <p className="m-0 max-w-[220px] text-[13px] leading-relaxed text-[#667085]">
                Ask a follow-up about this draft — tighten a clause, change tone, or add a section.
              </p>
            </div>
          )}

          {messages.length === 0 && isLoading && (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <LoraAvatar isLoading={true} size={40} className="mb-3.5" />
              <p className="m-0 text-[14px] font-semibold text-[#1a1a1a] mb-1">
                <span className="draft-status-shimmer">{progressMessage || "Drafting agreement…"}</span>
              </p>
              <p className="m-0 max-w-[240px] text-[12.5px] leading-relaxed text-[#667085]">
                Synthesizing clauses, enforcing compliance rules, and assembling your draft.
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

          {isLoading && !hasActiveProgressMsg && messages.length > 0 && (
            <FollowUpCard author="LORA" isAi isProgress>
              <span className="draft-status-shimmer">
                {progressMessage || "Thinking…"}
              </span>
            </FollowUpCard>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#FAFBFD] via-[#FAFBFD]/90 to-transparent px-3.5 pb-3.5 pt-6">
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
