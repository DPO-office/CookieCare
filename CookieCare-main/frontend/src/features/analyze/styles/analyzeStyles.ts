/** Analyze-specific styles */
export const ANALYZE_STYLES = `
.analyze-options-panel {
  background: #FFFFFF;
  border: 1px solid #E4E4E7;
  border-radius: 14px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.06),
    0 12px 28px -4px rgba(0, 0, 0, 0.10);
}

.lib-modal-cat-label {
  flex: 1 1 auto;
  min-width: 0;
  line-height: 1.4;
  overflow-wrap: break-word;
}

.lib-modal-list-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  color: #18181b;
  overflow-wrap: break-word;
  white-space: normal;
}

.lib-modal-list-desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.55;
  color: #a1a1aa;
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
  color: #52525b;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

/* ── Analysis report view ── */
.analyze-report-card {
  background: #ffffff;
  border: 1px solid #ebebeb;
  border-radius: 22px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.04),
    0 8px 24px rgba(0, 0, 0, 0.05);
}

.analyze-report-prose .md-content {
  font-size: 15px;
  line-height: 1.75;
  color: #3f3f46;
  max-width: none;
}

.analyze-report-prose .md-content h2,
.analyze-report-prose .md-content h3 {
  color: #18181b;
  margin-top: 1.75rem;
}

.analyze-report-prose .md-content h2:first-child,
.analyze-report-prose .md-content h3:first-child {
  margin-top: 0;
}

.analyze-report-prose .md-content p {
  margin-bottom: 0.9rem;
}

.analyze-report-composer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 20px;
  background: #ffffff;
  border: 1px solid #e4e4e7;
  border-radius: 999px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.04),
    0 6px 20px rgba(0, 0, 0, 0.05);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.analyze-report-composer:focus-within {
  border-color: #d4d4d8;
  box-shadow:
    0 0 0 3px rgba(24, 24, 27, 0.05),
    0 1px 3px rgba(0, 0, 0, 0.04);
}
`;
