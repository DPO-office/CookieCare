/**
 * Page classifier.
 *
 * Determines the type of a page (privacy policy, cookie policy, DPA, etc.)
 * using a combination of URL pattern matching and page title / content signals.
 *
 * Designed to be fast — no Playwright needed for the URL-based pass.  A content
 * pass is optional and only used when url-confidence is low.
 */

import { ClassifiedPage, PageType } from "./types.js";
import { logger } from "../../utils/logger.js";

const TAG = "[PageClassifier]";

// ─── URL-based signal rules ───────────────────────────────────────────────────

interface UrlRule {
  patterns: RegExp[];
  type: PageType;
  confidence: number;
}

const URL_RULES: UrlRule[] = [
  {
    patterns: [/\/privacy[-_]?policy/i, /\/privacy$/i, /\/datenschutz/i],
    type: "privacy_policy",
    confidence: 0.95,
  },
  {
    patterns: [/\/cookie[-_]?policy/i, /\/cookies$/i, /\/cookie-notice/i],
    type: "cookie_policy",
    confidence: 0.95,
  },
  {
    patterns: [
      /\/terms[-_]?(of[-_]?service|and[-_]?conditions)?$/i,
      /\/tos$/i,
      /\/nutzungsbedingungen/i,
    ],
    type: "terms",
    confidence: 0.9,
  },
  {
    patterns: [/\/legal$/i, /\/legal[-_]?notice/i, /\/impressum/i],
    type: "legal",
    confidence: 0.9,
  },
  {
    patterns: [/\/security$/i, /\/security[-_]?policy/i, /\/vulnerability/i],
    type: "security",
    confidence: 0.85,
  },
  {
    patterns: [/\/trust$/i, /\/trust[-_]?center/i, /\/trustcenter/i],
    type: "trust_center",
    confidence: 0.9,
  },
  {
    patterns: [/\/dpa$/i, /\/data[-_]?processing[-_]?agreement/i],
    type: "dpa",
    confidence: 0.92,
  },
  {
    patterns: [
      /\/responsible[-_]?ai/i,
      /\/ai[-_]?principles/i,
      /\/ai[-_]?policy/i,
    ],
    type: "responsible_ai",
    confidence: 0.88,
  },
  {
    patterns: [/\/ai$/i, /\/artificial[-_]?intelligence/i, /\/ai[-_]?safety/i],
    type: "ai_policy",
    confidence: 0.7,
  },
  {
    patterns: [/\/ethics$/i, /\/ethical[-_]?ai/i, /\/ai[-_]?ethics/i],
    type: "ethics",
    confidence: 0.85,
  },
  {
    patterns: [/\/governance$/i, /\/data[-_]?governance/i],
    type: "governance",
    confidence: 0.82,
  },
  {
    patterns: [/\/safety$/i, /\/ai[-_]?safety/i, /\/about\/safety/i, /\/safety[-_]?research/i],
    type: "responsible_ai",
    confidence: 0.9,
  },
  {
    patterns: [/\/policies$/i, /\/usage[-_]?policies/i, /\/use[-_]?policies/i],
    type: "responsible_ai",
    confidence: 0.82,
  },
  {
    patterns: [/\/model[-_]?spec$/i, /\/model[-_]?card/i, /\/system[-_]?card/i],
    type: "responsible_ai",
    confidence: 0.88,
  },
  {
    patterns: [/\/transparency$/i, /\/transparency[-_]?report/i],
    type: "trust_center",
    confidence: 0.85,
  },
  {
    patterns: [/\/charter$/i, /\/ai[-_]?charter/i],
    type: "responsible_ai",
    confidence: 0.85,
  },
];

// ─── Title/content-based signal rules ────────────────────────────────────────

interface TextRule {
  keywords: RegExp[];
  type: PageType;
  confidence: number;
}

const TEXT_RULES: TextRule[] = [
  {
    keywords: [/privacy\s+policy/i, /data\s+privacy/i, /personal\s+data/i],
    type: "privacy_policy",
    confidence: 0.8,
  },
  {
    keywords: [/cookie\s+policy/i, /use\s+of\s+cookies/i, /cookie\s+preferences/i],
    type: "cookie_policy",
    confidence: 0.8,
  },
  {
    keywords: [/terms\s+of\s+service/i, /terms\s+and\s+conditions/i, /terms\s+of\s+use/i],
    type: "terms",
    confidence: 0.75,
  },
  {
    keywords: [/legal\s+notice/i, /legal\s+information/i, /legal\s+disclaimer/i],
    type: "legal",
    confidence: 0.75,
  },
  {
    keywords: [/security\s+policy/i, /responsible\s+disclosure/i, /vulnerability\s+report/i],
    type: "security",
    confidence: 0.75,
  },
  {
    keywords: [/trust\s+center/i, /security\s+compliance/i, /data\s+protection\s+compliance/i],
    type: "trust_center",
    confidence: 0.75,
  },
  {
    keywords: [/data\s+processing\s+agreement/i, /data\s+processor/i, /controller.*processor/i],
    type: "dpa",
    confidence: 0.8,
  },
  {
    keywords: [
      /responsible\s+(use\s+of\s+)?ai/i,
      /ethical\s+ai/i,
      /ai\s+principles/i,
      /ai\s+governance/i,
    ],
    type: "responsible_ai",
    confidence: 0.78,
  },
];

/**
 * Classify a page by its URL alone.
 * Fast — no network request needed.
 */
export function classifyByUrl(url: string): ClassifiedPage {
  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch {
    return { url, pageType: "other", confidence: 0 };
  }

  for (const rule of URL_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(pathname)) {
        logger.debug(`${TAG} URL match: ${url} → ${rule.type} (${rule.confidence})`);
        return { url, pageType: rule.type, confidence: rule.confidence };
      }
    }
  }

  return { url, pageType: "other", confidence: 0 };
}

/**
 * Classify a page using its title and/or extracted text content.
 * Used as a secondary signal when URL classification confidence is low.
 */
export function classifyByContent(
  url: string,
  title: string,
  text: string
): ClassifiedPage {
  const combined = `${title} ${text.slice(0, 2000)}`;

  let bestType: PageType = "other";
  let bestConfidence = 0;

  for (const rule of TEXT_RULES) {
    const matchCount = rule.keywords.filter((kw) => kw.test(combined)).length;
    if (matchCount > 0) {
      const confidence = Math.min(
        rule.confidence * (1 + (matchCount - 1) * 0.05),
        0.97
      );
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestType = rule.type;
      }
    }
  }

  if (bestType !== "other") {
    logger.debug(`${TAG} Content match: ${url} → ${bestType} (${bestConfidence.toFixed(2)})`);
  }

  return { url, pageType: bestType, confidence: bestConfidence };
}

/**
 * Classify a page using all available signals.
 * URL takes priority; content is used as a tiebreaker or fallback.
 */
export function classifyPage(
  url: string,
  title?: string,
  text?: string
): ClassifiedPage {
  const urlResult = classifyByUrl(url);

  if (urlResult.confidence >= 0.85) {
    return urlResult;
  }

  if (title || text) {
    const contentResult = classifyByContent(url, title ?? "", text ?? "");
    if (contentResult.confidence > urlResult.confidence) {
      return contentResult;
    }
  }

  return urlResult;
}

/**
 * Classify multiple pages at once.
 * Returns only pages that have a non-"other" classification.
 */
export function classifyPages(
  pages: Array<{ url: string; title?: string; text?: string }>
): ClassifiedPage[] {
  return pages
    .map((p) => classifyPage(p.url, p.title, p.text))
    .filter((p) => p.pageType !== "other");
}
