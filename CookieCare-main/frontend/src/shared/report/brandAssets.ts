/**
 * Brand asset helpers for the enterprise report generator.
 *
 * Branding hierarchy:
 *   Primary  → Lexify AI  (the product / platform)
 *   Secondary → Randstad Digital (the client)
 *
 * Logos are loaded at runtime from the public folder via fetch → base64,
 * so they render correctly in html2canvas (no CORS/taint issues).
 * SVG fallbacks are provided for cases where the fetch is not yet resolved.
 */

/** Randstad official brand blue */
export const RANDSTAD_BLUE  = "#2175D9";
/** Lexify primary brand indigo */
export const LEXIFY_INDIGO  = "#4F46E5";
/** Dark navy used for headings / cover */
export const REPORT_DARK    = "#0f172a";
/** Page background */
export const REPORT_PAGE_BG = "#ffffff";

// ─── Async logo loader ────────────────────────────────────────────────────────
// Each call fetches the image once and caches the result.

let _lexifyLogoB64: string | null = null;
let _randstadLogoB64: string | null = null;

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror   = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Pre-loads both logos into base64. Call once before building report pages.
 * Uses the new Randstad Digital combined logo asset.
 */
export async function preloadLogos(): Promise<void> {
  if (!_lexifyLogoB64) {
    _lexifyLogoB64   = await fetchAsBase64("/favicon.png");
  }
  if (!_randstadLogoB64) {
    // Uses the new Randstad Digital logo (replaces old Randstad_logo.png)
    _randstadLogoB64 = await fetchAsBase64("/Randstad_digital_logo.jpg");
  }
}

export function getLexifyLogoB64():   string | null { return _lexifyLogoB64;   }
export function getRandstadLogoB64(): string | null { return _randstadLogoB64; }

// ─── SVG fallbacks (used only if image fails to load) ────────────────────────

/** Lexify shield-check SVG — for dark backgrounds */
export const LEXIFY_SHIELD_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
    <rect width="40" height="40" rx="10" fill="#0f172a"/>
    <path d="M20 6 L31 10.5 L31 22 Q31 30 20 35 Q9 30 9 22 L9 10.5 Z"
          fill="none" stroke="#6366f1" stroke-width="2"/>
    <polyline points="13,21 18,26 27,15"
              fill="none" stroke="#6366f1" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`
)}`;

/**
 * Randstad Digital fallback SVG — used only if the JPG asset fails to load.
 * The actual logo asset is /Randstad_digital_logo.jpg
 */
export const RANDSTAD_WORDMARK_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 38">
    <text x="0" y="26"
          font-family="'Arial Rounded MT Bold','Arial',Helvetica,sans-serif"
          font-size="22" font-weight="900" fill="#2175D9" letter-spacing="-0.3">randstad digital</text>
  </svg>`
)}`;
