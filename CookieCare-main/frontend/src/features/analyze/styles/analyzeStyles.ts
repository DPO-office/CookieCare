/** Analyze landing + report — aligned with DPA / dashboard surfaces. */
export const ANALYZE_STYLES = `
.analyze-landing .pcl-heading {
  font-size: clamp(1.75rem, 4vw, 2.125rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: #1a1a1a;
}

.analyze-landing .pcl-composer {
  border-radius: 24px;
  border: none;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
  transition: box-shadow 180ms ease;
}
.analyze-landing .pcl-composer:focus-within {
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.14);
}

.analyze-landing .pcl-input {
  color: #1a1a1a;
  font-weight: 400;
  min-height: 72px;
  max-height: 168px;
  line-height: 1.55;
  overflow-y: auto;
  resize: none;
  field-sizing: fixed;
  scrollbar-width: thin;
}
.analyze-landing .pcl-input::-webkit-resizer {
  display: none;
}
.analyze-landing .pcl-input::placeholder {
  color: #98A2B3;
}

.analyze-icon-btn {
  width: 2.125rem;
  height: 2.125rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #EEF2FF;
  color: #4F5BD9;
  flex-shrink: 0;
  cursor: pointer;
  border: none;
  transition: background 150ms ease, color 150ms ease, opacity 150ms ease;
}
.analyze-icon-btn:hover:not(:disabled) {
  background: #e4e9ff;
}
.analyze-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
/* Active state — shown when a library resource (template/clause/rulebook) is selected */
.analyze-enter-btn {
  width: 2.375rem;
  height: 2.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  flex-shrink: 0;
  cursor: pointer;
  border: none;
  color: #fff;
  transition: opacity 150ms ease, transform 120ms ease;
}
.analyze-enter-btn:not(:disabled):hover {
  opacity: 0.9;
}
.analyze-enter-btn:not(:disabled):active {
  transform: scale(0.96);
}
.analyze-enter-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.analyze-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.95rem;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 500;
  color: #344054;
  background: #fff;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}
.analyze-chip:hover {
  background: #f0f4ff;
  border-color: #d0d5dd;
  color: #1a1a1a;
}
.analyze-chip svg {
  color: #4F5BD9;
  flex-shrink: 0;
}

.analyze-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #4F5BD9;
  background: #EEF2FF;
  border: 1.5px solid #C7D2FE;
  border-radius: 999px;
  padding: 6px 16px;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
}
.analyze-link:hover {
  background: #E0E7FF;
  color: #3730A3;
  border-color: #A5B4FC;
}

.analyze-options-panel {
  background: #fff;
  border-radius: 22px;
  padding: 8px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06), 0 16px 40px rgba(16,24,40,0.10);
  font-family: var(--font-sans);
}

/* History button — top-right of analyze landing */
.analyze-history-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px 7px 11px;
  border-radius: 9999px;
  border: 1px solid rgba(16,24,40,0.08);
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #667085;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04);
  white-space: nowrap;
}
.analyze-history-btn:hover {
  background: #ffffff;
  color: #1a1a1a;
  box-shadow: 0 1px 3px rgba(16,24,40,0.08), 0 0 0 1px rgba(16,24,40,0.08);
}
.analyze-history-btn svg {
  color: #4F5BD9;
}
.analyze-depth-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(16,24,40,0.08);
  border-radius: 9999px;
  padding: 3px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 1px 2px rgba(16,24,40,0.04);
}

.analyze-depth-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: #98A2B3;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
  white-space: nowrap;
  line-height: 1;
}
.analyze-depth-btn:hover:not(:disabled):not(.is-active) {
  color: #3F3F46;
}
.analyze-depth-btn.is-active {
  background: #ffffff;
  color: #1a1a1a;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(16,24,40,0.10), 0 0 0 1px rgba(16,24,40,0.06);
}
.analyze-depth-btn.is-active svg {
  color: #4F5BD9;
}
.analyze-depth-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Analysis options panel scrollbar — hidden but functional */
.analyze-options-panel::-webkit-scrollbar {
  display: none;
}

/* ── Depth dropdown (Gemini-style inline picker) ─────────────────────── */
.analyze-depth-dropdown-root {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.analyze-depth-dropdown-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px 5px 10px;
  border-radius: 9999px;
  border: 1px solid rgba(16,24,40,0.10);
  background: rgba(255,255,255,0.80);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #344054;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04);
  transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease, color 150ms ease;
  line-height: 1;
}
.analyze-depth-dropdown-trigger:hover:not(:disabled) {
  background: #ffffff;
  border-color: rgba(16,24,40,0.18);
  box-shadow: 0 1px 3px rgba(16,24,40,0.08);
  color: #1a1a1a;
}
.analyze-depth-dropdown-trigger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.analyze-depth-dropdown-icon {
  display: inline-flex;
  align-items: center;
  color: #4F5BD9;
}

.analyze-depth-dropdown-label {
  font-size: 12px;
  font-weight: 500;
  color: inherit;
}

.analyze-depth-dropdown-chevron {
  width: 11px;
  height: 11px;
  color: #98A2B3;
  transition: transform 180ms ease;
  flex-shrink: 0;
}
.analyze-depth-dropdown-chevron.is-open {
  transform: rotate(180deg);
}

.analyze-depth-dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 160px;
  background: #ffffff;
  border-radius: 16px;
  padding: 6px;
  box-shadow:
    0 1px 2px rgba(16,24,40,0.04),
    0 0 0 1px rgba(16,24,40,0.06),
    0 12px 32px rgba(16,24,40,0.12);
  z-index: 9999;
  animation: analyze-dropdown-in 140ms ease;
}
@keyframes analyze-dropdown-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1);    }
}

.analyze-depth-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 120ms ease;
}
.analyze-depth-dropdown-item:hover {
  background: #F7F8FB;
}
.analyze-depth-dropdown-item.is-active {
  background: #EEF2FF;
}

.analyze-depth-dropdown-item-icon {
  display: inline-flex;
  align-items: center;
  color: #4F5BD9;
  flex-shrink: 0;
}

.analyze-depth-dropdown-item-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.3;
  flex: 1;
  min-width: 0;
}

.analyze-depth-dropdown-item-check {
  font-size: 11px;
  color: #4F5BD9;
  font-weight: 700;
  flex-shrink: 0;
  margin-left: auto;
}

/* References side panel */
.analyze-refs-panel {
  width: 280px;
  min-width: 280px;
  max-width: 280px;
  flex-shrink: 0;
  background: #FAFAFA;
  border-left: 1px solid rgba(16,24,40,0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.analyze-refs-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 12px;
  text-decoration: none;
  transition: background 130ms ease;
}
.analyze-refs-item:hover {
  background: #EEF2FF;
}
.analyze-refs-item:hover .analyze-refs-title {
  color: #4F5BD9;
}

.analyze-refs-citation {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 6px;
  background: #EEF2FF;
  color: #4F5BD9;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

.analyze-refs-title {
  font-size: 12.5px;
  font-weight: 500;
  color: #344054;
  line-height: 1.45;
  word-break: break-word;
  transition: color 130ms ease;
}

.lib-modal-cat-label {
  flex: 1 1 auto;
  min-width: 0;
  line-height: 1.4;
  overflow-wrap: break-word;
}

.lib-modal-list-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.45;
  color: #1a1a1a;
  overflow-wrap: break-word;
  white-space: normal;
}

.lib-modal-list-desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.55;
  color: #667085;
  overflow-wrap: break-word;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.lib-modal-preview-text {
  font-size: 14px;
  line-height: 1.7;
  color: #667085;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.analyze-report-card {
  background: #ffffff;
  border-radius: 24px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
}

/* ── Analyze report prose — ChatGPT-style ──────────────────────────────── */
.analyze-report-prose .md-content {
  font-size: 15px;
  line-height: 1.8;
  color: #1F2937;
  letter-spacing: -0.008em;
  max-width: none;
}

/* Section headings: bold, spaced, numbered feel */
.analyze-report-prose .md-content h1 {
  font-size: 1.3rem;
  font-weight: 700;
  color: #111827;
  letter-spacing: -0.025em;
  margin-top: 2.25rem;
  margin-bottom: 0.5rem;
  line-height: 1.3;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #E9EAEC;
}

.analyze-report-prose .md-content h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #111827;
  letter-spacing: -0.02em;
  margin-top: 2rem;
  margin-bottom: 0.45rem;
  line-height: 1.35;
}

.analyze-report-prose .md-content h3 {
  font-size: 0.975rem;
  font-weight: 650;
  color: #1F2937;
  letter-spacing: -0.015em;
  margin-top: 1.5rem;
  margin-bottom: 0.35rem;
  line-height: 1.4;
}

.analyze-report-prose .md-content h4 {
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
  margin-top: 1.25rem;
  margin-bottom: 0.3rem;
}

.analyze-report-prose .md-content h1:first-child,
.analyze-report-prose .md-content h2:first-child,
.analyze-report-prose .md-content h3:first-child,
.analyze-report-prose .md-content h4:first-child {
  margin-top: 0;
}

.analyze-report-prose .md-content p {
  margin-bottom: 0.85rem;
  color: #374151;
}

/* Lists */
.analyze-report-prose .md-content ul,
.analyze-report-prose .md-content ol {
  margin: 0.4rem 0 1rem;
  padding-left: 1.35rem;
}

.analyze-report-prose .md-content li {
  margin-bottom: 0.45rem;
  color: #374151;
  line-height: 1.7;
}

.analyze-report-prose .md-content li > p {
  margin-bottom: 0.25rem;
}

.analyze-report-prose .md-content strong {
  color: #111827;
  font-weight: 700;
}

/* Blockquote — callout style */
.analyze-report-prose .md-content blockquote {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border-left: 3px solid #6366F1;
  background: #F5F3FF;
  border-radius: 0 8px 8px 0;
  color: #4338CA;
  font-size: 14px;
}

/* Horizontal rule between major sections */
.analyze-report-prose .md-content hr {
  border: none;
  border-top: 1px solid #E9EAEC;
  margin: 1.75rem 0;
}

/* ── Prose container: constrain text, free tables ─────────────────────────
   The outer container has no max-width so tables can use full available
   width. Message blocks (avatar + content) are constrained for readability
   but wider than before to give tables room to breathe.

   data-has-refs="true"  → refs panel visible  → 720px
   data-has-refs="false" → full report          → 900px (was 768px)
   ────────────────────────────────────────────────────────────────────── */
.analyze-prose-container {
  width: 100%;
}

/* Message blocks: readable prose width */
.analyze-prose-container > div {
  max-width: 900px;
  margin-left: auto;
  margin-right: auto;
}

.analyze-prose-container[data-has-refs="true"] > div {
  max-width: 720px;
}

/* ── Tables inside analyze prose ────────────────────────────────────────── */
.analyze-report-prose .md-content .md-table-wrap {
  width: 100%;
  margin-top: 1rem;
  margin-bottom: 1.25rem;
  border-radius: 10px;
  /* No horizontal scroll — the table always fits the content width */
  overflow-x: visible;
  overflow-y: visible;
}

.analyze-report-prose .md-content table {
  font-size: 13px;
  line-height: 1.5;
  /* fixed: honour percentage widths exactly; never let content fight for space */
  table-layout: fixed;
  width: 100%;
  /* Neutralise index.css overrides that would re-introduce max-content sizing */
  min-width: 0;
}

.analyze-report-prose .md-content thead tr {
  position: static;
}

.analyze-report-prose .md-content thead th {
  padding: 9px 14px;
  font-size: 11px;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  min-width: 0;
  max-width: none;
}

.analyze-report-prose .md-content tbody td {
  padding: 11px 14px;
  overflow-wrap: anywhere;
  word-break: break-word;
  min-width: 0;
  max-width: none;
}

/* ── 4-column compliance table: percentage column widths (total = 100%) ───
   Actual column order from the LLM output:
   col 1  Category / Requirement  20%  — short label
   col 2  Status                  16%  — badge / short phrase
   col 3  Evidence / Clause       28%  — clamped prose, expand on demand
   col 4  Finding                 36%  — AI commentary, primary reading column
   ────────────────────────────────────────────────────────────────────── */
.analyze-report-prose .md-content table th:nth-child(1),
.analyze-report-prose .md-content table td:nth-child(1) { width: 20%; } /* Category */

.analyze-report-prose .md-content table th:nth-child(2),
.analyze-report-prose .md-content table td:nth-child(2) { width: 16%; overflow: hidden; } /* Status */

.analyze-report-prose .md-content table th:nth-child(3),
.analyze-report-prose .md-content table td:nth-child(3) { width: 28%; } /* Evidence / Clause */

.analyze-report-prose .md-content table th:nth-child(4),
.analyze-report-prose .md-content table td:nth-child(4) { width: 36%; } /* Finding */

/* 5-column+ tables: revert to auto so the browser distributes extra columns */
.analyze-report-prose .md-content table.md-table-many-cols {
  table-layout: auto;
  width: 100%;
}

/* ── Evidence / clause cell: 3-line clamp with expand ────────────────────
   .md-clause-text          — clamped to 3 lines by default
   .md-clause-text.md-clause-expanded — full text, clamp removed
   .md-clause-toggle        — "Show more" / "Show less" button

   Critical: -webkit-line-clamp only works when ALL four properties are set
   on the SAME element: display:-webkit-box, -webkit-box-orient:vertical,
   overflow:hidden, and -webkit-line-clamp. The td itself must NOT have
   overflow:hidden or it will clip the expanded state.
   ────────────────────────────────────────────────────────────────────── */
.md-clause-text {
  display: -webkit-box !important;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  /* Reset any block-level margin that td children might pick up */
  margin: 0;
  padding: 0;
}

.md-clause-text.md-clause-expanded {
  /* Remove the box model that enables the clamp */
  display: block !important;
  -webkit-line-clamp: unset;
  overflow: visible;
}

.md-clause-toggle {
  display: block;
  margin-top: 6px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  color: #4F5BD9;
  line-height: 1;
  transition: color 130ms ease;
  text-align: left;
}
.md-clause-toggle:hover {
  color: #3730A3;
}

/* ── Status badge pills (scoped to analyze prose) ────────────────────────
   markdownToHtml.ts injects <span class="md-status md-status-{variant}">
   around cells that match a known status keyword. These rules render them
   as compact coloured pill badges matching the reference design.
   ────────────────────────────────────────────────────────────────────── */
.analyze-report-prose .md-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 500;
  /* Allow wrapping inside the column — never bleed into adjacent cells */
  white-space: normal;
  word-break: break-word;
  line-height: 1.4;
}

.analyze-report-prose .md-status::before {
  content: "";
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 5px; /* vertically centre with first line of text */
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.analyze-report-prose .md-status-green  { background: rgba(22, 163, 74, 0.10);  color: #16A34A; }
.analyze-report-prose .md-status-yellow { background: rgba(245, 158, 11, 0.12); color: #B45309; }
.analyze-report-prose .md-status-orange { background: rgba(234, 88, 12, 0.12);  color: #C2410C; }
.analyze-report-prose .md-status-red    { background: rgba(220, 38, 38, 0.10);  color: #DC2626; }
.analyze-report-prose .md-status-grey   { background: rgba(107, 114, 128, 0.10); color: #4B5563; }

/* Streaming caret */
.analyze-report-prose.is-streaming .md-content::after {
  content: "";
  display: inline-block;
  width: 0.45em;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.12em;
  background: #4F5BD9;
  animation: analyze-stream-caret 0.9s steps(1) infinite;
}

@keyframes analyze-stream-caret {
  50% { background: transparent; }
}

.analyze-report-composer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 20px;
  background: #ffffff;
  border-radius: 28px;
  box-shadow:
    0 1px 2px rgba(16,24,40,0.04),
    0 0 0 1px rgba(16,24,40,0.06),
    0 18px 40px rgba(15,23,42,0.08);
  transition: box-shadow 150ms ease;
}

.analyze-report-composer:focus-within {
  box-shadow:
    0 0 0 3px rgba(79, 91, 217, 0.14),
    0 1px 2px rgba(16,24,40,0.04),
    0 18px 40px rgba(15,23,42,0.10);
}

@keyframes analyze-status-shimmer {
  0% { background-position: 140% 0; }
  100% { background-position: -40% 0; }
}

.analyze-status-shimmer {
  display: inline-block;
  font-size: 16.5px;
  font-weight: 650;
  letter-spacing: -0.032em;
  line-height: 1.2;
  background: linear-gradient(
    90deg,
    #98A2B3 0%,
    #667085 32%,
    #111827 47%,
    #4F5BD9 51%,
    #111827 55%,
    #667085 70%,
    #98A2B3 100%
  );
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: analyze-status-shimmer 1.55s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .analyze-status-shimmer {
    animation: none;
    background: none;
    -webkit-background-clip: unset;
    background-clip: unset;
    color: #111827;
  }
}

.analyze-chat-session {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
}

.analyze-user-bubble {
  background: #6366F1;
  color: #ffffff;
  border-radius: 18px 18px 4px 18px;
  font-size: 14.5px;
  line-height: 1.55;
  letter-spacing: -0.01em;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
}

.analyze-composer-fade {
  background: linear-gradient(to top, #eaf2ff 55%, rgba(234, 242, 255, 0));
}

.lib-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(16, 24, 40, 0.28);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-family: var(--font-sans);
}

.lib-modal-overlay--right {
  align-items: stretch;
  justify-content: flex-end;
  padding: 12px;
}

.lib-modal-shell-root {
  display: flex;
  flex-direction: column;
  width: min(94vw, 1120px);
  height: min(82dvh, 680px);
  max-height: min(82dvh, 680px);
  margin: 0 auto;
  background: #fff;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06), 0 24px 48px rgba(16,24,40,0.12);
  font-family: var(--font-sans);
}

.lib-modal-cat-btn {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  border: none;
  border-radius: 9999px;
  background: transparent;
  color: #667085;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}
.lib-modal-cat-btn:hover {
  background: #F7F8FB;
  color: #1a1a1a;
}
.lib-modal-cat-btn.is-active {
  background: #111827;
  color: #fff;
  font-weight: 600;
}

.lib-modal-search {
  width: 100%;
  border-radius: 9999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  padding: 10px 40px 10px 40px;
  font-size: 13px;
  color: #1a1a1a;
  outline: none;
  transition: box-shadow 150ms ease, border-color 150ms ease;
}
.lib-modal-search::placeholder { color: #98A2B3; }
.lib-modal-search:focus {
  border-color: #d0d5dd;
  box-shadow: 0 0 0 3px rgba(79, 91, 217, 0.08);
}

.lib-modal-list-item {
  padding: 16px 24px;
  cursor: pointer;
  border-bottom: 1px solid rgba(16,24,40,0.06);
  transition: background 120ms ease;
}
.lib-modal-list-item:hover { background: #F7F8FB; }
.lib-modal-list-item.is-selected { background: #F7F8FB; }

/* Thin vertical rule between the two groups */
.acb-divider {
  width: 1px;
  height: 20px;
  background: rgba(16,24,40,0.09);
  margin: 0 16px;
  flex-shrink: 0;
}

/* ── Below-composer settings row ────────────────────────────────────────
   Two compact inline dropdowns: "Output: Narrative ▾  ·  Documents: Combined ▾"
   Intentionally quiet — muted text, no backgrounds, no borders.
   ────────────────────────────────────────────────────────────────────── */
.analyze-settings-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 9px;
}

.analyze-settings-dot {
  font-size: 13px;
  color: #D0D5DD;
  line-height: 1;
  user-select: none;
  margin: 0 2px;
}

/* ── Each setting control ────────────────────────────────────────── */
.analyze-setting-root {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.analyze-setting-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background 130ms ease;
  line-height: 1;
}
.analyze-setting-trigger:hover:not(:disabled) {
  background: rgba(16,24,40,0.05);
}
.analyze-setting-trigger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.analyze-setting-label {
  font-size: 12.5px;
  font-weight: 400;
  color: #98A2B3;
  white-space: nowrap;
}

.analyze-setting-value {
  font-size: 12.5px;
  font-weight: 600;
  color: #344054;
  white-space: nowrap;
}

.analyze-setting-chevron {
  width: 11px;
  height: 11px;
  color: #98A2B3;
  flex-shrink: 0;
  transition: transform 160ms ease;
}
.analyze-setting-chevron.is-open {
  transform: rotate(180deg);
}

/* ── Dropdown menu ───────────────────────────────────────────────── */
.analyze-setting-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 130px;
  background: #ffffff;
  border-radius: 14px;
  padding: 5px;
  box-shadow:
    0 1px 2px rgba(16,24,40,0.04),
    0 0 0 1px rgba(16,24,40,0.07),
    0 8px 24px rgba(16,24,40,0.10);
  z-index: 9999;
  animation: analyze-setting-in 130ms ease;
}

@keyframes analyze-setting-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-3px) scale(0.98); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1);    }
}

.analyze-setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  color: #344054;
  text-align: left;
  transition: background 110ms ease;
}
.analyze-setting-item:hover {
  background: #F7F8FB;
}
.analyze-setting-item.is-active {
  background: #EEF2FF;
  color: #1a1a1a;
  font-weight: 600;
}

.analyze-setting-check {
  font-size: 11px;
  color: #4F5BD9;
  font-weight: 700;
  margin-left: 8px;
  flex-shrink: 0;
}
`;
