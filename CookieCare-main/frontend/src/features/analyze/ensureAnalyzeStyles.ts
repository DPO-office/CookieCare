import { ANALYZE_STYLES } from "./styles/analyzeStyles";

let mounted = false;

/** Inject analyze CSS once — avoids re-parsing a large style block on every render. */
export function ensureAnalyzeStyles(): void {
  if (mounted || typeof document === "undefined") return;
  const existing = document.querySelector("[data-analyze-styles]");
  if (existing) {
    mounted = true;
    return;
  }
  const el = document.createElement("style");
  el.setAttribute("data-analyze-styles", "true");
  el.textContent = ANALYZE_STYLES;
  document.head.appendChild(el);
  mounted = true;
}
