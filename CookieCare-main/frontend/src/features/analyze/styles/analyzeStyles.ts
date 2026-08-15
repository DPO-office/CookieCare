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
  margin-top: 1.75rem;
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
  font-weight: 600;
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

.analyze-chat-session {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
}

.analyze-user-bubble {
  background: #111827;
  color: #ffffff;
  border-radius: 20px 20px 6px 20px;
  font-size: 14.5px;
  line-height: 1.55;
  letter-spacing: -0.01em;
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
