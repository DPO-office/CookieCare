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
  font-size: 13px;
  font-weight: 500;
  color: #98A2B3;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 150ms ease;
}
.analyze-link:hover {
  color: #1a1a1a;
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

.analyze-report-prose .md-content {
  font-size: 15.5px;
  line-height: 1.75;
  color: #344054;
  letter-spacing: -0.011em;
  max-width: none;
}

.analyze-report-prose .md-content h2,
.analyze-report-prose .md-content h3 {
  color: #1a1a1a;
  font-weight: 650;
  letter-spacing: -0.02em;
  margin-top: 2rem;
  margin-bottom: 0.65rem;
}

.analyze-report-prose .md-content h2 {
  font-size: 1.15rem;
  line-height: 1.35;
}

.analyze-report-prose .md-content h3 {
  font-size: 1.02rem;
  line-height: 1.4;
}

.analyze-report-prose .md-content h2:first-child,
.analyze-report-prose .md-content h3:first-child {
  margin-top: 0;
}

.analyze-report-prose .md-content p {
  margin-bottom: 0.9rem;
}

.analyze-report-prose .md-content ul,
.analyze-report-prose .md-content ol {
  margin: 0.5rem 0 1rem;
  padding-left: 1.15rem;
}

.analyze-report-prose .md-content li {
  margin-bottom: 0.65rem;
  color: #667085;
}

.analyze-report-prose .md-content strong {
  color: #1a1a1a;
  font-weight: 650;
}

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
  background: #EBF2FD;
  color: #1a1a1a;
  border-radius: 20px 20px 6px 20px;
  font-size: 14.5px;
  line-height: 1.55;
  letter-spacing: -0.01em;
  box-shadow: 0 0 0 1px rgba(33, 117, 217, 0.10);
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
`;
