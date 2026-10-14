/**
 * Consent Intelligence Analyzer
 *
 * Pure-evidence consent banner analysis and CMP detection.
 * No AI inference — everything is derived from DOM signals actually collected
 * by the Playwright scanner.
 *
 * Produces:
 *   - ConsentBannerAnalysis   (banner presence, buttons, position, state, timing)
 *   - CMPDetectionResult      (platform name, evidence, confidence)
 *   - ComplianceEvaluation[]  (per-regulation findings: GDPR, ePrivacy, CCPA, DPDP, LGPD)
 *   - ConsentQuality          (quality findings derived from collected evidence)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BannerPosition = "top" | "bottom" | "modal" | "popup" | "unknown";
export type DefaultConsentState = "opt-in" | "opt-out" | "mixed" | "unknown";

export interface ConsentBannerAnalysis {
  bannerDetected: boolean;
  acceptButtonFound: boolean;
  rejectButtonFound: boolean;
  customizeButtonFound: boolean;
  closeButtonFound: boolean;
  defaultConsentState: DefaultConsentState;
  bannerPosition: BannerPosition;
  equalProminence: boolean | "unknown";
  cookiesBeforeConsent: boolean;
  consentChangesCookieBehaviour: boolean;
  /** Raw evidence snippets that led to each conclusion */
  evidence: string[];
}

export interface CMPDetectionResult {
  detected: boolean;
  name: string | null;
  detectionMethod: string[];
  confidence: number;
  evidence: string[];
}

export type ComplianceStatus = "compliant" | "likely_compliant" | "non_compliant" | "unable_to_verify";

export interface ComplianceFinding {
  id: string;
  title: string;
  status: ComplianceStatus;
  severity: "low" | "medium" | "high" | "critical";
  impact: string;
  finding: string;
  recommendation: string;
  evidenceUsed: string[];
}

export interface RegulationEvaluation {
  regulation: "GDPR" | "ePrivacy" | "CCPA" | "DPDP" | "LGPD";
  overallStatus: ComplianceStatus;
  score: number;          // 0–100
  findings: ComplianceFinding[];
}

export type ConsentQualityIssue =
  | "cookies_before_consent"
  | "third_party_cookies_before_consent"
  | "marketing_cookies_before_consent"
  | "missing_reject_button"
  | "missing_customize_option"
  | "missing_cookie_policy"
  | "missing_privacy_policy";

export interface ConsentQualityFinding {
  issue: ConsentQualityIssue;
  detected: boolean;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  recommendation: string;
}

export interface ConsentQuality {
  overallScore: number;       // 0–100
  findings: ConsentQualityFinding[];
}

// ─── Input contract ───────────────────────────────────────────────────────────

export interface ConsentAnalysisInput {
  /** DOM signals captured from the page before any consent interaction */
  preConsentDomSignals: DomConsentSignals | null;
  /** Cookies present before any consent interaction */
  preConsentCookieNames: string[];
  /** All cookie names collected across all scan phases */
  allCookieNames: string[];
  /** All enriched cookies from the full scan */
  allCookies: EnrichedCookieSnapshot[];
  /** Whether the scanner's consent banner click succeeded (accept flow) */
  acceptClickSucceeded: boolean;
  /** Whether the scanner's consent banner click succeeded (reject flow) */
  rejectClickSucceeded: boolean;
  /** Cookie count after accept vs before consent */
  cookieCountBeforeConsent: number;
  cookieCountAfterAccept: number;
  /** Page signals (scripts, global vars, HTML) from all visited pages */
  scriptUrls: string[];
  networkUrls: string[];
  headHtmlAll: string;
  globalVars: string[];
  /** Compliance page presence */
  hasPrivacyPolicy: boolean;
  hasCookiePolicy: boolean;
  privacyPolicyUrl: string | null;
  cookiePolicyUrl: string | null;
}

/** Minimal cookie shape needed for compliance evaluation */
export interface EnrichedCookieSnapshot {
  name: string;
  category: string;
  isFirstParty: boolean;
  partyType: "first-party" | "third-party";
  isSession: boolean;
}

/** Raw DOM evidence captured from the page by Playwright */
export interface DomConsentSignals {
  /** Full outer HTML of any detected consent banner element (capped 8KB) */
  bannerHtml: string;
  /** Whether an accept button was found and its text */
  acceptButton: { found: boolean; text: string; selector: string } | null;
  /** Whether a reject/decline button was found */
  rejectButton: { found: boolean; text: string; selector: string } | null;
  /** Whether a customize/preferences button was found */
  customizeButton: { found: boolean; text: string; selector: string } | null;
  /** Whether a close (X) button was found on the banner */
  closeButton: { found: boolean; text: string; selector: string } | null;
  /** Detected position of the banner relative to the viewport */
  position: BannerPosition;
  /** Whether consent checkboxes were pre-checked (indicates opt-in default) */
  preCheckedBoxes: boolean;
  /** Whether all non-essential checkboxes were unchecked (opt-out default) */
  allUnchecked: boolean;
  /** CMP-specific data attributes or class names found */
  cmpAttributes: string[];
}

// ─── CMP fingerprint database ─────────────────────────────────────────────────

interface CmpFingerprint {
  name: string;
  scriptPatterns: RegExp[];
  globalVars: RegExp[];
  cookieNames: string[];
  htmlPatterns: RegExp[];
  domAttributes: RegExp[];
}

const CMP_FINGERPRINTS: CmpFingerprint[] = [
  {
    name: "OneTrust",
    scriptPatterns: [/cdn\.cookielaw\.org/i, /optanon\.blob\.core\.windows\.net/i],
    globalVars: [/^(OneTrust|Optanon)$/],
    cookieNames: ["OptanonConsent", "OptanonAlertBoxClosed"],
    htmlPatterns: [/onetrust-consent-sdk/i, /id="onetrust-/i, /class="onetrust-/i],
    domAttributes: [/data-onetrust/i],
  },
  {
    name: "Cookiebot",
    scriptPatterns: [/consent\.cookiebot\.com/i],
    globalVars: [/^(Cookiebot|CookieConsent)$/],
    cookieNames: ["CookieConsent"],
    htmlPatterns: [/id="CybotCookiebotDialog/i, /class="CybotCookiebot/i],
    domAttributes: [/data-cookieconsent/i],
  },
  {
    name: "Usercentrics",
    scriptPatterns: [/app\.usercentrics\.eu/i, /privacy-proxy\.usercentrics\.eu/i],
    globalVars: [/^(UC_UI|usercentrics|__ucCmp)$/],
    cookieNames: ["uc_settings", "uc_user_interaction"],
    htmlPatterns: [/usercentrics-cmp/i, /uc-banner/i],
    domAttributes: [/data-usercentrics/i],
  },
  {
    name: "TrustArc",
    scriptPatterns: [/consent\.trustarc\.com/i, /truste\.com\/notice/i],
    globalVars: [/^(truste|TrustArc|truste_eu)$/],
    cookieNames: ["notice_preferences", "TAconsentID", "truste.eu.7777"],
    htmlPatterns: [/truste-consent/i, /trustarc/i],
    domAttributes: [/data-trustarc/i],
  },
  {
    name: "CookieYes",
    scriptPatterns: [/cdn-cookieyes\.com/i],
    globalVars: [/^(cookieyes|ckyConsent)$/],
    cookieNames: ["cookieyes-consent"],
    htmlPatterns: [/cky-consent-bar/i, /id="cky-/i, /class="cky-/i],
    domAttributes: [/data-cky/i],
  },
  {
    name: "Quantcast",
    scriptPatterns: [/quantcast\.mgr\.consensu\.org/i, /cmp\.quantcast\.com/i],
    globalVars: [/^(__tcfapi|__cmp)$/],
    cookieNames: ["euconsent", "euconsent-v2"],
    htmlPatterns: [/quantcast-choice/i, /qc-cmp/i],
    domAttributes: [/data-qchoice/i],
  },
  {
    name: "Didomi",
    scriptPatterns: [/sdk\.privacy-center\.org/i, /notice\.didomi\.com/i],
    globalVars: [/^(Didomi|didomi)$/],
    cookieNames: ["didomi_token", "euconsent-v2"],
    htmlPatterns: [/didomi-popup/i, /didomi-notice/i],
    domAttributes: [/data-didomi/i],
  },
  {
    name: "Osano",
    scriptPatterns: [/cmp\.osano\.com/i],
    globalVars: [/^Osano$/],
    cookieNames: ["osano_consentmanager"],
    htmlPatterns: [/osano-cm-window/i],
    domAttributes: [/data-osano/i],
  },
];

// ─── CMP Detection ────────────────────────────────────────────────────────────

export function detectCMP(input: ConsentAnalysisInput): CMPDetectionResult {
  const allUrls = [...input.scriptUrls, ...input.networkUrls];
  const headHtml = input.headHtmlAll;
  const bannerHtml = input.preConsentDomSignals?.bannerHtml ?? "";
  const combinedHtml = headHtml + bannerHtml;
  const cmpAttrs = input.preConsentDomSignals?.cmpAttributes ?? [];

  for (const cmp of CMP_FINGERPRINTS) {
    const evidence: string[] = [];
    const methods: string[] = [];
    let score = 0;

    for (const pat of cmp.scriptPatterns) {
      const hit = allUrls.find((u) => pat.test(u));
      if (hit) {
        score += 0.9;
        methods.push("script-url");
        evidence.push(`Script URL: ${hit.slice(0, 100)}`);
        break;
      }
    }

    for (const gv of cmp.globalVars) {
      const hit = input.globalVars.find((v) => gv.test(v));
      if (hit) {
        score += 0.8;
        methods.push("global-variable");
        evidence.push(`Global var: window.${hit}`);
        break;
      }
    }

    for (const cn of cmp.cookieNames) {
      const hit = input.allCookieNames.find(
        (c) => c.toLowerCase() === cn.toLowerCase() || c.toLowerCase().startsWith(cn.toLowerCase())
      );
      if (hit) {
        score += 0.7;
        methods.push("cookie-name");
        evidence.push(`Cookie: ${hit}`);
        break;
      }
    }

    for (const hp of cmp.htmlPatterns) {
      if (hp.test(combinedHtml)) {
        const m = hp.exec(combinedHtml);
        score += 0.6;
        methods.push("html-dom");
        evidence.push(`HTML pattern: "${m ? m[0].slice(0, 60) : hp.source}"`);
        break;
      }
    }

    for (const da of cmp.domAttributes) {
      const attrHit = cmpAttrs.find((a) => da.test(a));
      if (attrHit) {
        score += 0.7;
        methods.push("dom-attribute");
        evidence.push(`DOM attribute: ${attrHit}`);
        break;
      }
    }

    if (evidence.length > 0) {
      return {
        detected: true,
        name: cmp.name,
        detectionMethod: [...new Set(methods)],
        confidence: Math.min(Math.round(score * 100) / 100, 1.0),
        evidence,
      };
    }
  }

  // Generic IAB TCF detection (covers many CMPs)
  const tcfEvidence: string[] = [];
  const tcfMethods: string[] = [];

  if (input.globalVars.includes("__tcfapi")) {
    tcfEvidence.push("Global var: window.__tcfapi (IAB TCF 2.0)");
    tcfMethods.push("global-variable");
  }
  if (input.globalVars.includes("__cmp")) {
    tcfEvidence.push("Global var: window.__cmp (IAB CMP 1.1)");
    tcfMethods.push("global-variable");
  }
  const euconsent = input.allCookieNames.find((c) => c.toLowerCase().startsWith("euconsent"));
  if (euconsent) {
    tcfEvidence.push(`Cookie: ${euconsent} (IAB TCF consent string)`);
    tcfMethods.push("cookie-name");
  }

  if (tcfEvidence.length > 0) {
    return {
      detected: true,
      name: "IAB TCF-compliant CMP (vendor unidentified)",
      detectionMethod: tcfMethods,
      confidence: 0.65,
      evidence: tcfEvidence,
    };
  }

  return {
    detected: false,
    name: null,
    detectionMethod: [],
    confidence: 0,
    evidence: [],
  };
}

// ─── Consent Banner Analysis ──────────────────────────────────────────────────

export function analyzeConsentBanner(input: ConsentAnalysisInput): ConsentBannerAnalysis {
  const dom = input.preConsentDomSignals;
  const evidence: string[] = [];

  // Banner detection: DOM signals OR scanner click success OR CMP cookie present
  const cmpCookiePresent = input.allCookieNames.some((c) =>
    ["OptanonConsent", "CookieConsent", "cookieyes-consent", "uc_settings",
     "notice_preferences", "TAconsentID", "osano_consentmanager", "didomi_token",
     "euconsent", "euconsent-v2"].some((k) => c.toLowerCase().startsWith(k.toLowerCase()))
  );
  const bannerDetected =
    input.acceptClickSucceeded ||
    input.rejectClickSucceeded ||
    cmpCookiePresent ||
    (dom !== null && dom.bannerHtml.length > 50);

  if (bannerDetected) evidence.push("Consent banner interaction or CMP cookie confirmed.");

  // Button detection from DOM signals or click success
  const acceptButtonFound =
    input.acceptClickSucceeded || (dom?.acceptButton?.found ?? false);
  const rejectButtonFound =
    input.rejectClickSucceeded || (dom?.rejectButton?.found ?? false);
  const customizeButtonFound = dom?.customizeButton?.found ?? false;
  const closeButtonFound = dom?.closeButton?.found ?? false;

  if (acceptButtonFound) {
    evidence.push(dom?.acceptButton?.text
      ? `Accept button found: "${dom.acceptButton.text}" (${dom.acceptButton.selector})`
      : "Accept button found (click succeeded).");
  }
  if (rejectButtonFound) {
    evidence.push(dom?.rejectButton?.text
      ? `Reject button found: "${dom.rejectButton.text}" (${dom.rejectButton.selector})`
      : "Reject button found (click succeeded).");
  }
  if (customizeButtonFound && dom?.customizeButton) {
    evidence.push(`Customize button found: "${dom.customizeButton.text}" (${dom.customizeButton.selector})`);
  }
  if (closeButtonFound && dom?.closeButton) {
    evidence.push(`Close button found: "${dom.closeButton.text}"`);
  }

  // Default consent state
  let defaultConsentState: DefaultConsentState = "unknown";
  if (dom !== null) {
    if (dom.preCheckedBoxes && !dom.allUnchecked) {
      defaultConsentState = "opt-in";
      evidence.push("Pre-checked consent checkboxes detected (opt-in default).");
    } else if (dom.allUnchecked && !dom.preCheckedBoxes) {
      defaultConsentState = "opt-out";
      evidence.push("All non-essential checkboxes were unchecked (opt-out default).");
    } else if (dom.preCheckedBoxes && dom.allUnchecked) {
      defaultConsentState = "mixed";
      evidence.push("Mixed checkbox state detected.");
    }
  }

  // Banner position
  const bannerPosition: BannerPosition = dom?.position ?? "unknown";
  if (bannerPosition !== "unknown") {
    evidence.push(`Banner position: ${bannerPosition}.`);
  }

  // Equal prominence: both accept and reject buttons present = potentially equal
  const equalProminence: boolean | "unknown" =
    !bannerDetected
      ? "unknown"
      : acceptButtonFound && rejectButtonFound
      ? true
      : acceptButtonFound && !rejectButtonFound
      ? false
      : "unknown";

  if (equalProminence === false) {
    evidence.push("Accept button present but no equivalent Reject button detected (unequal prominence).");
  } else if (equalProminence === true) {
    evidence.push("Both Accept and Reject buttons detected (equal prominence possible).");
  }

  // Cookies before consent
  const cookiesBeforeConsent = input.preConsentCookieNames.length > 0;
  if (cookiesBeforeConsent) {
    evidence.push(`${input.preConsentCookieNames.length} cookie(s) set before any consent interaction.`);
  } else if (bannerDetected) {
    evidence.push("No cookies detected before consent interaction.");
  }

  // Consent changes cookie behaviour
  const consentChangesCookieBehaviour =
    bannerDetected && input.cookieCountAfterAccept > input.cookieCountBeforeConsent;
  if (consentChangesCookieBehaviour) {
    evidence.push(
      `Cookie count increased from ${input.cookieCountBeforeConsent} (pre-consent) ` +
      `to ${input.cookieCountAfterAccept} (post-accept) — consent changes cookie behaviour.`
    );
  }

  return {
    bannerDetected,
    acceptButtonFound,
    rejectButtonFound,
    customizeButtonFound,
    closeButtonFound,
    defaultConsentState,
    bannerPosition,
    equalProminence,
    cookiesBeforeConsent,
    consentChangesCookieBehaviour,
    evidence,
  };
}

// ─── Enterprise Compliance Evaluation ────────────────────────────────────────

function v(condition: boolean, evidenceTrue: string, evidenceFalse?: string): string {
  return condition ? evidenceTrue : (evidenceFalse ?? "UNABLE TO VERIFY — evidence not collected.");
}

export function evaluateCompliance(
  input: ConsentAnalysisInput,
  banner: ConsentBannerAnalysis,
  cmp: CMPDetectionResult
): RegulationEvaluation[] {
  const cookies = input.allCookies;
  const nonEssential = cookies.filter(
    (c) => !["Necessary", "Functional", "necessary", "functional"].includes(c.category)
  );
  const thirdParty = cookies.filter((c) => c.partyType === "third-party");
  const marketing = cookies.filter((c) =>
    ["Marketing", "Advertising", "marketing", "advertising"].includes(c.category)
  );
  const preConsentSet = input.preConsentCookieNames;
  const preConsentCookies = cookies.filter((c) => preConsentSet.includes(c.name));
  const preConsentNonEssential = preConsentCookies.filter(
    (c) => !["Necessary", "Functional", "necessary", "functional"].includes(c.category)
  );
  const preConsent3P = preConsentCookies.filter((c) => c.partyType === "third-party");
  const preConsentMarketing = preConsentCookies.filter(
    (c) => ["Marketing", "Advertising", "marketing", "advertising"].includes(c.category)
  );

  // ── GDPR ──────────────────────────────────────────────────────────────────
  const gdprFindings: ComplianceFinding[] = [];

  gdprFindings.push({
    id: "gdpr_1",
    title: "Consent Mechanism (Art. 6(1)(a), Art. 7)",
    status: banner.bannerDetected
      ? banner.acceptButtonFound
        ? "likely_compliant"
        : "non_compliant"
      : "non_compliant",
    severity: "critical",
    impact: "Processing without a valid consent mechanism is unlawful under GDPR Art. 6.",
    finding: banner.bannerDetected
      ? banner.acceptButtonFound
        ? "VERIFIED: Consent banner detected with an Accept button present."
        : "VERIFIED: Consent banner detected but no Accept button identified — consent may not be freely given."
      : "VERIFIED: No consent banner or mechanism detected on the scanned page.",
    recommendation: "Implement a GDPR-compliant CMP that captures freely given, specific, informed, and unambiguous consent.",
    evidenceUsed: banner.evidence.filter((e) => e.toLowerCase().includes("banner") || e.toLowerCase().includes("accept")),
  });

  gdprFindings.push({
    id: "gdpr_2",
    title: "Right to Withdraw Consent / Reject Option (Art. 7(3))",
    status: banner.rejectButtonFound ? "likely_compliant" : banner.bannerDetected ? "non_compliant" : "unable_to_verify",
    severity: "high",
    impact: "Withdrawal must be as easy as giving consent. Absence of a reject button violates Art. 7(3).",
    finding: banner.rejectButtonFound
      ? "VERIFIED: Reject/Decline button found on the consent banner."
      : banner.bannerDetected
      ? "VERIFIED: Consent banner found but no Reject button detected — consent withdrawal is not equally easy."
      : "UNABLE TO VERIFY — no consent banner detected.",
    recommendation: "Add a clearly visible Reject/Decline All button that is at least as prominent as the Accept button.",
    evidenceUsed: banner.evidence.filter((e) => e.toLowerCase().includes("reject") || e.toLowerCase().includes("decline")),
  });

  gdprFindings.push({
    id: "gdpr_3",
    title: "Cookies Loaded Before Consent (Art. 5(1)(a), Art. 6)",
    status: preConsentNonEssential.length === 0
      ? banner.bannerDetected ? "likely_compliant" : "unable_to_verify"
      : "non_compliant",
    severity: "critical",
    impact: "Setting non-essential cookies before consent constitutes unlawful processing.",
    finding: preConsentNonEssential.length > 0
      ? `VERIFIED: ${preConsentNonEssential.length} non-essential cookie(s) set before consent: ${preConsentNonEssential.slice(0, 5).map((c) => c.name).join(", ")}`
      : preConsentCookies.length > 0
      ? `VERIFIED: ${preConsentCookies.length} cookie(s) present before consent; all appear essential/functional.`
      : banner.bannerDetected
      ? "VERIFIED: No cookies detected before consent interaction."
      : "UNABLE TO VERIFY — no consent banner interaction recorded.",
    recommendation: "Block all non-essential cookies until explicit consent is given using a hold-back mechanism.",
    evidenceUsed: banner.evidence.filter((e) => e.toLowerCase().includes("before consent")),
  });

  gdprFindings.push({
    id: "gdpr_4",
    title: "Privacy Policy Availability (Art. 13/14 Transparency)",
    status: input.hasPrivacyPolicy ? "likely_compliant" : "non_compliant",
    severity: "high",
    impact: "GDPR Art. 13/14 requires transparent information about processing.",
    finding: input.hasPrivacyPolicy
      ? `VERIFIED: Privacy policy found at ${input.privacyPolicyUrl}.`
      : "VERIFIED: No publicly reachable privacy policy was found at standard paths.",
    recommendation: "Publish a complete privacy policy at a well-known path (e.g. /privacy-policy).",
    evidenceUsed: [input.privacyPolicyUrl ? `Privacy policy URL: ${input.privacyPolicyUrl}` : "Privacy policy: not found"],
  });

  gdprFindings.push({
    id: "gdpr_5",
    title: "Cookie Policy Availability (Art. 13 + ePrivacy)",
    status: input.hasCookiePolicy ? "likely_compliant" : "non_compliant",
    severity: "medium",
    impact: "Users must be informed about cookies used, their purpose, and retention.",
    finding: input.hasCookiePolicy
      ? `VERIFIED: Cookie policy found at ${input.cookiePolicyUrl}.`
      : "VERIFIED: No publicly reachable cookie policy found at standard paths.",
    recommendation: "Publish a dedicated cookie policy page listing all cookies, their purpose, and retention periods.",
    evidenceUsed: [input.cookiePolicyUrl ? `Cookie policy URL: ${input.cookiePolicyUrl}` : "Cookie policy: not found"],
  });

  gdprFindings.push({
    id: "gdpr_6",
    title: "Granular Consent / Preferences (Art. 7, WP29 Guidelines)",
    status: banner.customizeButtonFound ? "likely_compliant" : banner.bannerDetected ? "non_compliant" : "unable_to_verify",
    severity: "medium",
    impact: "Bundled consent without granular options is not freely given under GDPR.",
    finding: banner.customizeButtonFound
      ? "VERIFIED: Customize/Manage Preferences option detected on banner."
      : banner.bannerDetected
      ? "VERIFIED: No Customize/Manage Preferences option found — consent may not be granular."
      : "UNABLE TO VERIFY — no consent banner detected.",
    recommendation: "Provide granular consent options by cookie category (Analytics, Marketing, etc.).",
    evidenceUsed: banner.evidence.filter((e) => e.toLowerCase().includes("custom")),
  });

  const gdprCompliant = gdprFindings.filter((f) => f.status === "compliant" || f.status === "likely_compliant").length;
  const gdprScore = Math.round((gdprCompliant / gdprFindings.length) * 100);

  const gdpr: RegulationEvaluation = {
    regulation: "GDPR",
    overallStatus: gdprScore >= 70 ? "likely_compliant" : gdprScore >= 40 ? "unable_to_verify" : "non_compliant",
    score: gdprScore,
    findings: gdprFindings,
  };

  // ── ePrivacy ──────────────────────────────────────────────────────────────
  const epFindings: ComplianceFinding[] = [];

  epFindings.push({
    id: "ep_1",
    title: "Prior Consent for Non-Essential Cookies (Art. 5(3) ePrivacy)",
    status: preConsentNonEssential.length === 0
      ? banner.bannerDetected ? "likely_compliant" : "unable_to_verify"
      : "non_compliant",
    severity: "critical",
    impact: "ePrivacy requires prior informed consent before any non-essential cookie is set.",
    finding: preConsentNonEssential.length > 0
      ? `VERIFIED: ${preConsentNonEssential.length} non-essential cookie(s) set before consent.`
      : banner.bannerDetected
      ? "VERIFIED: No non-essential cookies detected before consent interaction."
      : "UNABLE TO VERIFY — no consent interaction recorded.",
    recommendation: "Use a hold-back mechanism: no non-essential cookie/storage access until consent event fires.",
    evidenceUsed: [`Pre-consent non-essential cookies: ${preConsentNonEssential.length}`],
  });

  epFindings.push({
    id: "ep_2",
    title: "Consent Required for Third-Party Cookies (Art. 5(3) ePrivacy)",
    status: preConsent3P.length === 0
      ? "likely_compliant"
      : "non_compliant",
    severity: "high",
    impact: "Third-party cookies require explicit prior consent under ePrivacy.",
    finding: preConsent3P.length > 0
      ? `VERIFIED: ${preConsent3P.length} third-party cookie(s) set before consent: ${preConsent3P.slice(0, 5).map((c) => c.name).join(", ")}`
      : `VERIFIED: No third-party cookies detected before consent. Total third-party cookies in scan: ${thirdParty.length}.`,
    recommendation: "Ensure all third-party scripts are blocked until explicit consent.",
    evidenceUsed: [`Pre-consent 3rd party cookies: ${preConsent3P.length}`, `Total 3rd party cookies: ${thirdParty.length}`],
  });

  epFindings.push({
    id: "ep_3",
    title: "Clear Information Before Consent (Art. 5(3) ePrivacy)",
    status: input.hasCookiePolicy && banner.bannerDetected ? "likely_compliant" : banner.bannerDetected ? "non_compliant" : "unable_to_verify",
    severity: "medium",
    impact: "Users must be clearly informed about cookie use before consent.",
    finding: v(input.hasCookiePolicy && banner.bannerDetected,
      "VERIFIED: Cookie policy found and consent banner present.",
      "UNABLE TO VERIFY or non-compliant: cookie policy or consent banner not confirmed."),
    recommendation: "Link cookie policy from the consent banner so users can review it before consenting.",
    evidenceUsed: [v(input.hasCookiePolicy, `Cookie policy: ${input.cookiePolicyUrl}`, "Cookie policy: not found")],
  });

  const epCompliant = epFindings.filter((f) => f.status === "compliant" || f.status === "likely_compliant").length;
  const epScore = Math.round((epCompliant / epFindings.length) * 100);

  const eprivacy: RegulationEvaluation = {
    regulation: "ePrivacy",
    overallStatus: epScore >= 70 ? "likely_compliant" : epScore >= 40 ? "unable_to_verify" : "non_compliant",
    score: epScore,
    findings: epFindings,
  };

  // ── CCPA ──────────────────────────────────────────────────────────────────
  const ccpaFindings: ComplianceFinding[] = [];

  const hasDoNotSellSignal = input.globalVars.some((v) =>
    /usPrivacy|__usp|doNotSell|gpc/i.test(v)
  ) || input.allCookieNames.some((c) => /us_privacy|usprivacy/i.test(c));

  ccpaFindings.push({
    id: "ccpa_1",
    title: "Do Not Sell / Do Not Share Signal (CCPA §1798.135)",
    status: hasDoNotSellSignal ? "likely_compliant" : "unable_to_verify",
    severity: "high",
    impact: "CCPA requires a clear 'Do Not Sell My Personal Information' mechanism for California consumers.",
    finding: hasDoNotSellSignal
      ? "VERIFIED: USPrivacy string or GPC signal detected."
      : "UNABLE TO VERIFY — no USPrivacy/GPC signal found in collected page signals. May exist via link or other mechanism not captured by DOM scan.",
    recommendation: "Implement a visible 'Do Not Sell or Share My Personal Information' link and honour GPC signals.",
    evidenceUsed: hasDoNotSellSignal
      ? input.globalVars.filter((v) => /usPrivacy|__usp|doNotSell|gpc/i.test(v)).map((v) => `Global var: ${v}`)
      : ["No USPrivacy/GPC signal in captured page signals"],
  });

  ccpaFindings.push({
    id: "ccpa_2",
    title: "Privacy Policy Disclosure (CCPA §1798.130)",
    status: input.hasPrivacyPolicy ? "likely_compliant" : "non_compliant",
    severity: "high",
    impact: "CCPA requires businesses to disclose data practices in a publicly accessible privacy policy.",
    finding: v(input.hasPrivacyPolicy,
      `VERIFIED: Privacy policy found at ${input.privacyPolicyUrl}.`,
      "VERIFIED: No publicly reachable privacy policy found."),
    recommendation: "Ensure privacy policy includes CCPA-required disclosures: categories of PI collected, sources, business purpose, third parties.",
    evidenceUsed: [input.privacyPolicyUrl ?? "Privacy policy: not found"],
  });

  ccpaFindings.push({
    id: "ccpa_3",
    title: "Opt-Out of Sale of Marketing Data (CCPA §1798.120)",
    status: marketing.length === 0 ? "likely_compliant" : "unable_to_verify",
    severity: "medium",
    impact: "Marketing/advertising cookies may constitute a 'sale' of PI under CCPA.",
    finding: marketing.length > 0
      ? `UNABLE TO VERIFY — ${marketing.length} marketing/advertising cookie(s) detected. Cannot confirm opt-out mechanism without visiting all pages.`
      : "VERIFIED: No marketing cookies detected in this scan.",
    recommendation: "For each marketing cookie or pixel, ensure a compliant opt-out mechanism exists for California residents.",
    evidenceUsed: [`Marketing cookies: ${marketing.length}`],
  });

  const ccpaCompliant = ccpaFindings.filter((f) => f.status === "compliant" || f.status === "likely_compliant").length;
  const ccpaScore = Math.round((ccpaCompliant / ccpaFindings.length) * 100);

  const ccpa: RegulationEvaluation = {
    regulation: "CCPA",
    overallStatus: ccpaScore >= 70 ? "likely_compliant" : "unable_to_verify",
    score: ccpaScore,
    findings: ccpaFindings,
  };

  // ── DPDP (India) ──────────────────────────────────────────────────────────
  const dpdpFindings: ComplianceFinding[] = [];

  dpdpFindings.push({
    id: "dpdp_1",
    title: "Notice Before Consent (DPDPA 2023 §5)",
    status: banner.bannerDetected && input.hasPrivacyPolicy ? "likely_compliant" : "unable_to_verify",
    severity: "high",
    impact: "DPDPA requires a clear notice describing personal data collected and purpose.",
    finding: banner.bannerDetected && input.hasPrivacyPolicy
      ? "VERIFIED: Consent banner and privacy policy present — notice before consent appears in place."
      : "UNABLE TO VERIFY — insufficient evidence to confirm DPDPA-compliant notice.",
    recommendation: "Ensure consent notice specifically describes the personal data, purpose, and names the Data Fiduciary.",
    evidenceUsed: [banner.bannerDetected ? "Banner detected" : "No banner", v(input.hasPrivacyPolicy, `Privacy policy: ${input.privacyPolicyUrl}`, "No privacy policy")],
  });

  dpdpFindings.push({
    id: "dpdp_2",
    title: "Consent Must Be Free, Specific, Informed (DPDPA 2023 §6)",
    status: banner.bannerDetected && banner.acceptButtonFound && banner.rejectButtonFound ? "likely_compliant" : "unable_to_verify",
    severity: "high",
    impact: "DPDPA requires consent that is free (choice to reject), specific, informed, and unambiguous.",
    finding: banner.bannerDetected
      ? banner.acceptButtonFound && banner.rejectButtonFound
        ? "VERIFIED: Both Accept and Reject buttons present on banner."
        : "UNABLE TO VERIFY — banner detected but missing reject option or banner not captured."
      : "UNABLE TO VERIFY — no consent banner detected.",
    recommendation: "Ensure the consent mechanism provides clear Accept and Reject options with equal ease.",
    evidenceUsed: banner.evidence.slice(0, 3),
  });

  dpdpFindings.push({
    id: "dpdp_3",
    title: "Cookies Set Without Consent (DPDPA §4 — Lawfulness)",
    status: preConsentNonEssential.length === 0 ? "likely_compliant" : "non_compliant",
    severity: "critical",
    impact: "Processing personal data without consent is unlawful under DPDPA §4.",
    finding: preConsentNonEssential.length > 0
      ? `VERIFIED: ${preConsentNonEssential.length} non-essential cookies set before consent.`
      : "VERIFIED: No non-essential cookies detected before consent.",
    recommendation: "Block all non-essential cookies until valid consent is obtained.",
    evidenceUsed: [`Pre-consent non-essential cookies: ${preConsentNonEssential.length}`],
  });

  const dpdpCompliant = dpdpFindings.filter((f) => f.status === "compliant" || f.status === "likely_compliant").length;
  const dpdpScore = Math.round((dpdpCompliant / dpdpFindings.length) * 100);

  const dpdp: RegulationEvaluation = {
    regulation: "DPDP",
    overallStatus: dpdpScore >= 70 ? "likely_compliant" : "unable_to_verify",
    score: dpdpScore,
    findings: dpdpFindings,
  };

  // ── LGPD (Brazil) ─────────────────────────────────────────────────────────
  const lgpdFindings: ComplianceFinding[] = [];

  lgpdFindings.push({
    id: "lgpd_1",
    title: "Legal Basis for Processing (LGPD Art. 7)",
    status: banner.bannerDetected && banner.acceptButtonFound ? "likely_compliant" : "unable_to_verify",
    severity: "high",
    impact: "LGPD requires a specific legal basis for each processing activity.",
    finding: banner.bannerDetected && banner.acceptButtonFound
      ? "VERIFIED: Consent mechanism detected — consent appears to be the legal basis."
      : "UNABLE TO VERIFY — no consent mechanism confirmed.",
    recommendation: "Document the specific LGPD legal basis for each cookie and processing activity.",
    evidenceUsed: banner.evidence.slice(0, 2),
  });

  lgpdFindings.push({
    id: "lgpd_2",
    title: "Right to Revoke Consent / Opt-Out (LGPD Art. 8, Art. 18)",
    status: banner.rejectButtonFound ? "likely_compliant" : banner.bannerDetected ? "non_compliant" : "unable_to_verify",
    severity: "high",
    impact: "LGPD grants data subjects the right to revoke consent at any time.",
    finding: banner.rejectButtonFound
      ? "VERIFIED: Reject option detected on consent banner."
      : banner.bannerDetected
      ? "VERIFIED: Banner detected but no reject/revoke option confirmed."
      : "UNABLE TO VERIFY — no consent banner detected.",
    recommendation: "Provide a clear, accessible revoke/reject consent option and honour it immediately.",
    evidenceUsed: banner.evidence.filter((e) => e.toLowerCase().includes("reject") || e.toLowerCase().includes("revoke")),
  });

  lgpdFindings.push({
    id: "lgpd_3",
    title: "Transparency / Privacy Notice (LGPD Art. 9)",
    status: input.hasPrivacyPolicy ? "likely_compliant" : "non_compliant",
    severity: "high",
    impact: "LGPD requires clear information about processing activities.",
    finding: v(input.hasPrivacyPolicy,
      `VERIFIED: Privacy policy found at ${input.privacyPolicyUrl}.`,
      "VERIFIED: No publicly reachable privacy policy found."),
    recommendation: "Ensure privacy notice covers LGPD Art. 9 requirements: purpose, retention, data subject rights, data controller identity.",
    evidenceUsed: [input.privacyPolicyUrl ?? "Privacy policy: not found"],
  });

  const lgpdCompliant = lgpdFindings.filter((f) => f.status === "compliant" || f.status === "likely_compliant").length;
  const lgpdScore = Math.round((lgpdCompliant / lgpdFindings.length) * 100);

  const lgpd: RegulationEvaluation = {
    regulation: "LGPD",
    overallStatus: lgpdScore >= 70 ? "likely_compliant" : lgpdScore >= 40 ? "unable_to_verify" : "non_compliant",
    score: lgpdScore,
    findings: lgpdFindings,
  };

  return [gdpr, eprivacy, ccpa, dpdp, lgpd];
}

// ─── Consent Quality ──────────────────────────────────────────────────────────

export function evaluateConsentQuality(
  input: ConsentAnalysisInput,
  banner: ConsentBannerAnalysis
): ConsentQuality {
  const cookies = input.allCookies;
  const preConsentSet = new Set(input.preConsentCookieNames);
  const preConsentCookies = cookies.filter((c) => preConsentSet.has(c.name));
  const preConsent3P = preConsentCookies.filter((c) => c.partyType === "third-party");
  const preConsentMarketing = preConsentCookies.filter(
    (c) => ["Marketing", "Advertising", "marketing", "advertising"].includes(c.category)
  );

  const findings: ConsentQualityFinding[] = [
    {
      issue: "cookies_before_consent",
      detected: banner.cookiesBeforeConsent,
      severity: "critical",
      description: banner.cookiesBeforeConsent
        ? `${input.preConsentCookieNames.length} cookie(s) were set before the user provided any consent.`
        : "No cookies detected before consent interaction.",
      recommendation: "Implement a strict hold-back: block all non-essential cookies until after the consent event.",
    },
    {
      issue: "third_party_cookies_before_consent",
      detected: preConsent3P.length > 0,
      severity: "critical",
      description: preConsent3P.length > 0
        ? `${preConsent3P.length} third-party cookie(s) set before consent: ${preConsent3P.slice(0, 5).map((c) => c.name).join(", ")}.`
        : "No third-party cookies detected before consent.",
      recommendation: "Block all third-party scripts and cookies until explicit consent is received.",
    },
    {
      issue: "marketing_cookies_before_consent",
      detected: preConsentMarketing.length > 0,
      severity: "critical",
      description: preConsentMarketing.length > 0
        ? `${preConsentMarketing.length} marketing/advertising cookie(s) set before consent: ${preConsentMarketing.slice(0, 5).map((c) => c.name).join(", ")}.`
        : "No marketing cookies detected before consent.",
      recommendation: "Marketing cookies require explicit opt-in consent. Block them until consent is granted.",
    },
    {
      issue: "missing_reject_button",
      detected: banner.bannerDetected && !banner.rejectButtonFound,
      severity: "high",
      description: banner.bannerDetected
        ? banner.rejectButtonFound
          ? "Reject/Decline button is present on the consent banner."
          : "Consent banner detected but no Reject All / Decline option was found."
        : "No consent banner detected — reject button check not applicable.",
      recommendation: "Add a 'Reject All' or 'Decline' button that is at least as prominent as 'Accept All'.",
    },
    {
      issue: "missing_customize_option",
      detected: banner.bannerDetected && !banner.customizeButtonFound,
      severity: "medium",
      description: banner.bannerDetected
        ? banner.customizeButtonFound
          ? "Customize/Manage Preferences option is present."
          : "Consent banner detected but no Customize/Manage Preferences option found."
        : "No consent banner detected — customize check not applicable.",
      recommendation: "Provide granular consent options by cookie category (Analytics, Marketing, Functional).",
    },
    {
      issue: "missing_cookie_policy",
      detected: !input.hasCookiePolicy,
      severity: "medium",
      description: input.hasCookiePolicy
        ? `Cookie policy found at ${input.cookiePolicyUrl}.`
        : "No publicly reachable cookie policy found at standard paths.",
      recommendation: "Publish a dedicated cookie policy listing all cookies used, their purpose, and retention period.",
    },
    {
      issue: "missing_privacy_policy",
      detected: !input.hasPrivacyPolicy,
      severity: "high",
      description: input.hasPrivacyPolicy
        ? `Privacy policy found at ${input.privacyPolicyUrl}.`
        : "No publicly reachable privacy policy found at standard paths.",
      recommendation: "Publish a comprehensive privacy policy at a well-known path (e.g. /privacy-policy).",
    },
  ];

  const issuesFound = findings.filter((f) => f.detected).length;
  const criticalIssues = findings.filter((f) => f.detected && f.severity === "critical").length;
  const highIssues = findings.filter((f) => f.detected && f.severity === "high").length;
  const totalScore = Math.max(0,
    100 - (criticalIssues * 20) - (highIssues * 10) - ((issuesFound - criticalIssues - highIssues) * 5)
  );

  return { overallScore: totalScore, findings };
}
