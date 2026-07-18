/**
 * Technology Detection Engine
 *
 * Detects tracking technologies (analytics, advertising, session recording,
 * customer platforms, consent CMPs) from page signals already collected
 * during the cookie scan phases — no extra page loads required.
 *
 * Signal sources (all obtained from existing Playwright page visits):
 *   - External <script> src URLs
 *   - Loaded JS resource URLs intercepted via network events
 *   - HTML source: meta tags, data attributes, inline script content
 *   - Known global JS variables (window.__* fingerprints)
 *   - Cookie names already collected (reuses cookie scan output)
 *
 * Every detection is evidence-based: a technology is only reported when at
 * least one concrete signal matches. Confidence is derived from signal count
 * and signal strength (URL match > global var > cookie > HTML keyword).
 */

export type TechCategory =
  | "Analytics"
  | "Advertising"
  | "Session Recording"
  | "Customer Platform"
  | "Consent Platform"
  | "Tag Management"
  | "CDN / Performance";

export type DetectionMethod =
  | "script-url"
  | "global-variable"
  | "cookie-name"
  | "meta-tag"
  | "html-attribute"
  | "network-request";

export interface DetectedTechnology {
  name: string;
  category: TechCategory;
  /** All signal types that contributed to this detection */
  detectionMethods: DetectionMethod[];
  /** 0–1 confidence score */
  confidence: number;
  /** Human-readable evidence summary */
  evidence: string[];
}

// ─── Raw page signals collected by the scanner ───────────────────────────────

/**
 * All page-level signals extracted from a single Playwright page visit.
 * Collected once per page, reused for all technology detections.
 */
export interface PageSignals {
  /** All <script src="..."> and dynamically loaded JS URLs */
  scriptUrls: string[];
  /** All network request URLs intercepted during page load */
  networkUrls: string[];
  /** Raw HTML of the page <head> (first 50 KB to keep it fast) */
  headHtml: string;
  /** window.* global variable names present on the page */
  globalVars: string[];
  /** Cookie names already collected (passed in from cookie scan) */
  cookieNames: string[];
}

// ─── Technology fingerprint definitions ──────────────────────────────────────

interface TechSignal {
  /** Regex tested against script/network URLs */
  scriptPattern?: RegExp;
  /** Regex tested against window global var names */
  globalVar?: RegExp;
  /** Exact or prefix cookie name (case-insensitive) */
  cookieName?: string;
  /** Regex tested against the head HTML */
  htmlPattern?: RegExp;
  /**
   * Confidence weight for this signal (0–1).
   * script-url matches are high-confidence (0.9).
   * Global vars are medium-high (0.8).
   * Cookie names are medium (0.6).
   * HTML/meta patterns are low-medium (0.5).
   */
  weight: number;
  method: DetectionMethod;
}

interface TechDefinition {
  name: string;
  category: TechCategory;
  signals: TechSignal[];
}

// ─── Technology Fingerprint Database ─────────────────────────────────────────

const TECH_DEFINITIONS: TechDefinition[] = [
  // ── Analytics ──────────────────────────────────────────────────────────────
  {
    name: "Google Analytics",
    category: "Analytics",
    signals: [
      { scriptPattern: /google-analytics\.com\/(analytics|ga|gtag)\.js/i, weight: 0.95, method: "script-url" },
      { scriptPattern: /googletagmanager\.com\/gtag\/js/i, weight: 0.9, method: "script-url" },
      { globalVar: /^(ga|gtag|__gaTracker)$/, weight: 0.85, method: "global-variable" },
      { cookieName: "_ga", weight: 0.7, method: "cookie-name" },
      { cookieName: "_ga_", weight: 0.7, method: "cookie-name" },
      { htmlPattern: /UA-\d{4,}-\d+|G-[A-Z0-9]{8,}/i, weight: 0.6, method: "html-attribute" },
    ],
  },
  {
    name: "Google Tag Manager",
    category: "Tag Management",
    signals: [
      { scriptPattern: /googletagmanager\.com\/gtm\.js/i, weight: 0.95, method: "script-url" },
      { globalVar: /^(google_tag_manager|dataLayer)$/, weight: 0.85, method: "global-variable" },
      { htmlPattern: /GTM-[A-Z0-9]{5,}/i, weight: 0.8, method: "html-attribute" },
    ],
  },
  {
    name: "Adobe Analytics",
    category: "Analytics",
    signals: [
      { scriptPattern: /omtrdc\.net|2o7\.net|sc\.omtrdc\.net|demdex\.net/i, weight: 0.9, method: "script-url" },
      { scriptPattern: /assets\.adobedtm\.com|launch-\w+\.min\.js/i, weight: 0.85, method: "script-url" },
      { globalVar: /^(s_gi|AppMeasurement|_satellite|s\b)$/, weight: 0.8, method: "global-variable" },
      { cookieName: "s_fid", weight: 0.65, method: "cookie-name" },
      { cookieName: "s_cc", weight: 0.65, method: "cookie-name" },
    ],
  },
  {
    name: "Mixpanel",
    category: "Analytics",
    signals: [
      { scriptPattern: /cdn\.mxpnl\.com|api\.mixpanel\.com/i, weight: 0.9, method: "script-url" },
      { globalVar: /^mixpanel$/, weight: 0.85, method: "global-variable" },
      { cookieName: "__mp_opt_in_out_", weight: 0.6, method: "cookie-name" },
      { htmlPattern: /mixpanel\.init\s*\(/i, weight: 0.75, method: "html-attribute" },
    ],
  },
  {
    name: "Amplitude",
    category: "Analytics",
    signals: [
      { scriptPattern: /cdn\.amplitude\.com|api\.amplitude\.com/i, weight: 0.9, method: "script-url" },
      { globalVar: /^amplitude$/, weight: 0.85, method: "global-variable" },
      { cookieName: "amplitude_id", weight: 0.65, method: "cookie-name" },
    ],
  },

  // ── Advertising ────────────────────────────────────────────────────────────
  {
    name: "Meta Pixel",
    category: "Advertising",
    signals: [
      { scriptPattern: /connect\.facebook\.net\/[a-z_]+\/fbevents\.js/i, weight: 0.95, method: "script-url" },
      { globalVar: /^(fbq|_fbq)$/, weight: 0.9, method: "global-variable" },
      { cookieName: "_fbp", weight: 0.7, method: "cookie-name" },
      { cookieName: "_fbc", weight: 0.65, method: "cookie-name" },
      { htmlPattern: /facebook\.net\/[a-z_]+\/fbevents/i, weight: 0.8, method: "html-attribute" },
    ],
  },
  {
    name: "TikTok Pixel",
    category: "Advertising",
    signals: [
      { scriptPattern: /analytics\.tiktok\.com\/i18n\/pixel\/events\.js/i, weight: 0.95, method: "script-url" },
      { globalVar: /^ttq$/, weight: 0.9, method: "global-variable" },
      { cookieName: "tt_sessionid", weight: 0.65, method: "cookie-name" },
      { htmlPattern: /tiktok\.com\/i18n\/pixel/i, weight: 0.8, method: "html-attribute" },
    ],
  },
  {
    name: "LinkedIn Insight Tag",
    category: "Advertising",
    signals: [
      { scriptPattern: /snap\.licdn\.com\/li\.lms-analytics\/insight\.min\.js/i, weight: 0.95, method: "script-url" },
      { globalVar: /^(_linkedin_partner_id|lintrk)$/, weight: 0.85, method: "global-variable" },
      { cookieName: "li_fat_id", weight: 0.65, method: "cookie-name" },
      { cookieName: "UserMatchHistory", weight: 0.6, method: "cookie-name" },
      { htmlPattern: /linkedin\.com\/px\/li_ping/i, weight: 0.75, method: "html-attribute" },
    ],
  },
  {
    name: "X (Twitter) Pixel",
    category: "Advertising",
    signals: [
      { scriptPattern: /static\.ads-twitter\.com\/uwt\.js/i, weight: 0.95, method: "script-url" },
      { globalVar: /^twq$/, weight: 0.9, method: "global-variable" },
      { cookieName: "_twitter_sess", weight: 0.6, method: "cookie-name" },
      { htmlPattern: /ads-twitter\.com\/uwt/i, weight: 0.8, method: "html-attribute" },
    ],
  },
  {
    name: "Pinterest Tag",
    category: "Advertising",
    signals: [
      { scriptPattern: /s\.pinimg\.com\/ct\/core\.js/i, weight: 0.95, method: "script-url" },
      { globalVar: /^pintrk$/, weight: 0.9, method: "global-variable" },
      { cookieName: "_pinterest_sess", weight: 0.65, method: "cookie-name" },
      { htmlPattern: /pinimg\.com\/ct\/core/i, weight: 0.8, method: "html-attribute" },
    ],
  },

  // ── Session Recording ──────────────────────────────────────────────────────
  {
    name: "Microsoft Clarity",
    category: "Session Recording",
    signals: [
      { scriptPattern: /clarity\.ms\/tag\/[a-z0-9]+/i, weight: 0.95, method: "script-url" },
      { scriptPattern: /www\.clarity\.ms/i, weight: 0.9, method: "script-url" },
      { globalVar: /^clarity$/, weight: 0.85, method: "global-variable" },
      { cookieName: "_clsk", weight: 0.7, method: "cookie-name" },
      { cookieName: "_clck", weight: 0.7, method: "cookie-name" },
    ],
  },
  {
    name: "Hotjar",
    category: "Session Recording",
    signals: [
      { scriptPattern: /static\.hotjar\.com\/c\/hotjar-\d+\.js/i, weight: 0.95, method: "script-url" },
      { scriptPattern: /script\.hotjar\.com/i, weight: 0.9, method: "script-url" },
      { globalVar: /^(hj|hjSiteSettings|_hjSettings)$/, weight: 0.85, method: "global-variable" },
      { cookieName: "_hjid", weight: 0.7, method: "cookie-name" },
      { cookieName: "_hjSession", weight: 0.65, method: "cookie-name" },
      { htmlPattern: /hotjar\.com\/c\/hotjar/i, weight: 0.8, method: "html-attribute" },
    ],
  },
  {
    name: "FullStory",
    category: "Session Recording",
    signals: [
      { scriptPattern: /fullstory\.com\/s\/fs\.js|edge\.fullstory\.com/i, weight: 0.95, method: "script-url" },
      { globalVar: /^(FS|_fs_namespace)$/, weight: 0.85, method: "global-variable" },
      { cookieName: "fs_uid", weight: 0.65, method: "cookie-name" },
      { htmlPattern: /fullstory\.com\/s\/fs/i, weight: 0.8, method: "html-attribute" },
    ],
  },
  {
    name: "Lucky Orange",
    category: "Session Recording",
    signals: [
      { scriptPattern: /d10lpsik1i8c69\.cloudfront\.net|luckyorange\.net/i, weight: 0.9, method: "script-url" },
      { globalVar: /^(__lo_cs_added|_loq|window\.LOQ)$/, weight: 0.8, method: "global-variable" },
      { cookieName: "_lo_uid", weight: 0.65, method: "cookie-name" },
      { htmlPattern: /luckyorange\.com|luckyorange\.net/i, weight: 0.75, method: "html-attribute" },
    ],
  },

  // ── Customer Platforms ─────────────────────────────────────────────────────
  {
    name: "HubSpot",
    category: "Customer Platform",
    signals: [
      { scriptPattern: /js\.hs-scripts\.com|js\.hubspot\.com|js\.hs-analytics\.net/i, weight: 0.95, method: "script-url" },
      { globalVar: /^(_hsq|HubSpotConversations)$/, weight: 0.85, method: "global-variable" },
      { cookieName: "__hstc", weight: 0.7, method: "cookie-name" },
      { cookieName: "hubspotutk", weight: 0.7, method: "cookie-name" },
      { cookieName: "__hssc", weight: 0.65, method: "cookie-name" },
    ],
  },
  {
    name: "Segment",
    category: "Customer Platform",
    signals: [
      { scriptPattern: /cdn\.segment\.com\/analytics\.js/i, weight: 0.95, method: "script-url" },
      { scriptPattern: /api\.segment\.io/i, weight: 0.85, method: "network-request" },
      { globalVar: /^analytics$/, weight: 0.75, method: "global-variable" },
      { cookieName: "ajs_user_id", weight: 0.7, method: "cookie-name" },
      { cookieName: "ajs_anonymous_id", weight: 0.65, method: "cookie-name" },
    ],
  },
  {
    name: "Intercom",
    category: "Customer Platform",
    signals: [
      { scriptPattern: /widget\.intercom\.io\/widget\//i, weight: 0.95, method: "script-url" },
      { scriptPattern: /js\.intercomcdn\.com/i, weight: 0.9, method: "script-url" },
      { globalVar: /^(Intercom|intercomSettings)$/, weight: 0.85, method: "global-variable" },
      { cookieName: "intercom-session-", weight: 0.7, method: "cookie-name" },
      { cookieName: "intercom-id-", weight: 0.65, method: "cookie-name" },
    ],
  },
  {
    name: "Zendesk",
    category: "Customer Platform",
    signals: [
      { scriptPattern: /static\.zdassets\.com\/ekr\/snippet\.js|v2\.zopim\.com/i, weight: 0.95, method: "script-url" },
      { globalVar: /^(zE|zESettings|\$zopim)$/, weight: 0.85, method: "global-variable" },
      { cookieName: "_zendesk_session", weight: 0.65, method: "cookie-name" },
      { cookieName: "ZD-store", weight: 0.6, method: "cookie-name" },
    ],
  },

  // ── Consent Platforms (CMPs) ───────────────────────────────────────────────
  {
    name: "OneTrust",
    category: "Consent Platform",
    signals: [
      { scriptPattern: /cdn\.cookielaw\.org\/consent\//i, weight: 0.95, method: "script-url" },
      { scriptPattern: /optanon\.blob\.core\.windows\.net/i, weight: 0.9, method: "script-url" },
      { globalVar: /^(OneTrust|Optanon)$/, weight: 0.9, method: "global-variable" },
      { cookieName: "OptanonConsent", weight: 0.8, method: "cookie-name" },
      { cookieName: "OptanonAlertBoxClosed", weight: 0.7, method: "cookie-name" },
      { htmlPattern: /onetrust-consent-sdk|id="onetrust-/i, weight: 0.75, method: "html-attribute" },
    ],
  },
  {
    name: "Cookiebot",
    category: "Consent Platform",
    signals: [
      { scriptPattern: /consent\.cookiebot\.com\/uc\.js/i, weight: 0.95, method: "script-url" },
      { globalVar: /^(Cookiebot|CookieConsent)$/, weight: 0.9, method: "global-variable" },
      { cookieName: "CookieConsent", weight: 0.8, method: "cookie-name" },
      { htmlPattern: /id="CybotCookiebotDialog/i, weight: 0.8, method: "html-attribute" },
    ],
  },
  {
    name: "Usercentrics",
    category: "Consent Platform",
    signals: [
      { scriptPattern: /app\.usercentrics\.eu\/browser-ui\/latest\/loader\.js/i, weight: 0.95, method: "script-url" },
      { globalVar: /^(UC_UI|usercentrics)$/, weight: 0.9, method: "global-variable" },
      { cookieName: "uc_settings", weight: 0.7, method: "cookie-name" },
      { htmlPattern: /usercentrics-cmp/i, weight: 0.75, method: "html-attribute" },
    ],
  },
  {
    name: "TrustArc",
    category: "Consent Platform",
    signals: [
      { scriptPattern: /consent\.trustarc\.com|truste\.com\/notice/i, weight: 0.95, method: "script-url" },
      { globalVar: /^(truste|TrustArc)$/, weight: 0.85, method: "global-variable" },
      { cookieName: "notice_preferences", weight: 0.7, method: "cookie-name" },
      { cookieName: "TAconsentID", weight: 0.65, method: "cookie-name" },
    ],
  },
  {
    name: "CookieYes",
    category: "Consent Platform",
    signals: [
      { scriptPattern: /cdn-cookieyes\.com\/client-data\//i, weight: 0.95, method: "script-url" },
      { globalVar: /^(cookieyes|ckyConsent)$/, weight: 0.85, method: "global-variable" },
      { cookieName: "cookieyes-consent", weight: 0.8, method: "cookie-name" },
      { htmlPattern: /cky-consent-bar|id="cky-/i, weight: 0.75, method: "html-attribute" },
    ],
  },
];

// ─── Detection Engine ─────────────────────────────────────────────────────────

/**
 * Run all technology fingerprints against the provided page signals.
 *
 * For each technology definition, every matching signal contributes to the
 * confidence score.  The final score is capped at 1.0 and the detection is
 * only reported when at least one signal fires.
 *
 * Cookie name matching supports prefix matching (e.g. "intercom-session-"
 * matches "intercom-session-abc123") to mirror the cookie engine wildcard logic.
 */
export function detectTechnologies(signals: PageSignals): DetectedTechnology[] {
  const results: DetectedTechnology[] = [];

  for (const tech of TECH_DEFINITIONS) {
    const matchedMethods = new Set<DetectionMethod>();
    const evidence: string[] = [];
    let rawScore = 0;

    for (const signal of tech.signals) {
      // ── Script / network URL match ────────────────────────────────────────
      if (signal.scriptPattern) {
        const allUrls = [...signals.scriptUrls, ...signals.networkUrls];
        const hit = allUrls.find((u) => signal.scriptPattern!.test(u));
        if (hit) {
          matchedMethods.add(signal.method);
          rawScore += signal.weight;
          evidence.push(`${signal.method}: ${hit.length > 80 ? hit.slice(0, 80) + "…" : hit}`);
        }
      }

      // ── Global variable match ──────────────────────────────────────────────
      if (signal.globalVar) {
        const hit = signals.globalVars.find((v) => signal.globalVar!.test(v));
        if (hit) {
          matchedMethods.add(signal.method);
          rawScore += signal.weight;
          evidence.push(`global-variable: window.${hit}`);
        }
      }

      // ── Cookie name match (exact or prefix) ────────────────────────────────
      if (signal.cookieName) {
        const pattern = signal.cookieName.toLowerCase();
        const hit = signals.cookieNames.find((c) =>
          c.toLowerCase() === pattern || c.toLowerCase().startsWith(pattern)
        );
        if (hit) {
          matchedMethods.add(signal.method);
          rawScore += signal.weight;
          evidence.push(`cookie-name: ${hit}`);
        }
      }

      // ── HTML / meta tag pattern match ──────────────────────────────────────
      if (signal.htmlPattern && signals.headHtml) {
        if (signal.htmlPattern.test(signals.headHtml)) {
          matchedMethods.add(signal.method);
          rawScore += signal.weight;
          // Extract a short snippet of the match for evidence
          const m = signal.htmlPattern.exec(signals.headHtml);
          if (m) {
            const snippet = m[0].slice(0, 60);
            evidence.push(`${signal.method}: "${snippet}"`);
          }
        }
      }
    }

    // Only report when at least one signal fired
    if (matchedMethods.size === 0) continue;

    // Cap score at 1.0 (multiple weak signals can together reach certainty)
    const confidence = Math.min(rawScore, 1.0);

    results.push({
      name: tech.name,
      category: tech.category,
      detectionMethods: Array.from(matchedMethods),
      confidence: Math.round(confidence * 100) / 100,
      evidence,
    });
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

/**
 * Merge page signal sets from multiple pages.
 * Deduplicates URLs and global vars; concatenates head HTML from all pages
 * (truncated per page to avoid memory bloat).
 */
export function mergeSignals(pages: PageSignals[]): PageSignals {
  const scriptUrls = new Set<string>();
  const networkUrls = new Set<string>();
  const globalVars = new Set<string>();
  const cookieNames = new Set<string>();
  const headChunks: string[] = [];

  for (const p of pages) {
    p.scriptUrls.forEach((u) => scriptUrls.add(u));
    p.networkUrls.forEach((u) => networkUrls.add(u));
    p.globalVars.forEach((v) => globalVars.add(v));
    p.cookieNames.forEach((c) => cookieNames.add(c));
    if (p.headHtml) headChunks.push(p.headHtml);
  }

  return {
    scriptUrls: Array.from(scriptUrls),
    networkUrls: Array.from(networkUrls),
    globalVars: Array.from(globalVars),
    cookieNames: Array.from(cookieNames),
    headHtml: headChunks.join("\n"),
  };
}
