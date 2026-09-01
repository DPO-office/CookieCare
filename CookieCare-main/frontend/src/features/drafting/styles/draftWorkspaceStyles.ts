export const DRAFT_WORKSPACE_STYLES = `
.draft-workspace {
  font-family: var(--font-sans);
  color: #667085;
}

.draft-workspace .overflow-y-auto,
.draft-editor-canvas,
.draft-followup-rail,
.draft-chat-stage {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.draft-workspace .overflow-y-auto::-webkit-scrollbar,
.draft-editor-canvas::-webkit-scrollbar,
.draft-followup-rail::-webkit-scrollbar,
.draft-chat-stage::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
.draft-workspace ::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.draft-workspace-shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.draft-workspace-panel {
  background: transparent;
  overflow: hidden;
}

.draft-card {
  background: #ffffff;
  border-radius: 24px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
}

.draft-workspace-header {
  height: auto;
  min-height: 56px;
  padding: 12px 18px;
  background: transparent;
  border: none;
}

.draft-icon-ghost {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: #98A2B3;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}
.draft-icon-ghost:hover {
  background: #EEF2FF;
  color: #4F5BD9;
}

.draft-history-btn {
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
.draft-history-btn:hover {
  background: #ffffff;
  color: #1a1a1a;
  box-shadow: 0 1px 3px rgba(16,24,40,0.08), 0 0 0 1px rgba(16,24,40,0.08);
}
.draft-history-btn svg {
  color: #4F5BD9;
}
.draft-export-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: opacity 150ms ease, transform 120ms ease;
}
.draft-export-btn:hover {
  opacity: 0.9;
}
.draft-export-btn:active {
  transform: scale(0.98);
}

/* ── Chat panel ─────────────────────────────────────────────────────────── */
.draft-followup-rail {
  min-width: 260px;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid rgb(226 232 240 / 0.6);
  box-shadow:
    0 1px 2px rgba(16, 24, 40, 0.04),
    0 12px 32px rgba(15, 23, 42, 0.08);
}

.draft-followup-card {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid rgb(226 232 240 / 0.7);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
  padding: 14px 16px;
  margin: 0 0 4px;
}
.draft-followup-card.is-ai {
  background: #F8FAFC;
}

.draft-chat-stage {
  background: #FAFBFD;
}

/* ── Resize handle (invisible grip; hover reveals a hairline) ──────────── */
.draft-resize-handle {
  width: 10px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}
.draft-resize-handle::before {
  content: '';
  position: absolute;
  top: 16px;
  bottom: 16px;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: transparent;
  border-radius: 99px;
  transition: background 0.15s ease;
}
.draft-resize-handle:hover::before,
.draft-resize-handle:active::before {
  background: #4F5BD9;
}

/* ── Editor canvas ─────────────────────────────────────────────────────── */
.draft-editor-canvas {
  background: transparent;
}

.draft-editor-paper {
  width: 100%;
  max-width: 920px;
  background: #FFFFFF;
  border: none;
  border-radius: 22px;
  box-shadow:
    0 25px 50px -12px rgba(15, 23, 42, 0.18),
    0 8px 16px -8px rgba(15, 23, 42, 0.08),
    0 0 0 1px rgba(15, 23, 42, 0.04);
  padding: 64px 72px 88px;
  min-height: calc(100% - 8px);
}

.draft-editor-paper .richtext-editor {
  font-family: 'Times New Roman', Times, serif;
  font-size: 12pt;
  line-height: 1.7;
  color: #334155;
  min-height: 55vh !important;
}

.draft-editor-paper .richtext-editor h1 {
  font-size: 18pt;
  font-weight: 700;
  margin: 0 0 1em;
  text-align: center;
  color: #0F172A;
  letter-spacing: 0.01em;
  line-height: 1.35;
}

.draft-editor-paper .richtext-editor h2 {
  font-size: 13.5pt;
  font-weight: 700;
  margin: 1.6em 0 0.7em;
  color: #0F172A;
  padding-left: 12px;
  border-left: 3px solid #4F5BD9;
  line-height: 1.4;
}

.draft-editor-paper .richtext-editor h3 {
  font-size: 12pt;
  font-weight: 700;
  margin: 1.2em 0 0.5em;
  color: #1E293B;
  line-height: 1.4;
}

.draft-editor-paper .richtext-editor p {
  margin: 0 0 1em;
}

.draft-editor-paper .richtext-editor ul,
.draft-editor-paper .richtext-editor ol {
  margin: 0 0 1em;
  padding-left: 1.6em;
}

.draft-editor-paper .richtext-editor li {
  margin-bottom: 0.35em;
}

.draft-editor-paper .richtext-editor table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.1em 0;
  font-size: 11pt;
}

.draft-editor-paper .richtext-editor th,
.draft-editor-paper .richtext-editor td {
  border: 1px solid #E2E8F0;
  padding: 8px 12px;
  vertical-align: top;
}

.draft-editor-paper .richtext-editor th {
  background: #F8FAFC;
  font-weight: 600;
  color: #0F172A;
}

.draft-editor-paper .richtext-editor a.draft-editor-link {
  color: #4F5BD9;
  text-decoration: underline;
}

.draft-editor-paper .richtext-editor hr {
  border: none;
  border-top: 1px solid #E2E8F0;
  margin: 1.75em 0;
}

.draft-streaming-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #EEF2FF;
  color: #4F5BD9;
  font-size: 11.5px;
  font-weight: 500;
  font-family: var(--font-sans);
}

.draft-streaming-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4F5BD9;
  animation: draft-pulse 1.2s ease-in-out infinite;
}

@keyframes draft-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.draft-zoom-pill {
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
  border-radius: 999px;
}

.draft-toolbar {
  background: transparent;
  border: none;
  position: relative;
  z-index: 20;
  overflow: visible;
}

.draft-toolbar-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 12px 14px;
  overflow-x: auto;
}

.draft-toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: #F4F6FB;
  border-radius: 12px;
  flex-shrink: 0;
}
.draft-toolbar-group:not(:last-child)::after {
  content: '';
  width: 1px;
  height: 16px;
  margin: 0 8px 0 10px;
  background: rgba(15, 23, 42, 0.08);
  flex-shrink: 0;
}
.draft-toolbar-group .draft-toolbar-dropdown-trigger {
  background: transparent;
}

.draft-toolbar-btn {
  border-radius: 8px;
}

.draft-composer-chat {
  border-radius: 18px;
  border: none;
  background: #FFFFFF;
  box-shadow:
    0 1px 2px rgba(16,24,40,0.04),
    0 0 0 1px rgba(16,24,40,0.06),
    0 16px 40px rgba(15,23,42,0.10);
  transition: box-shadow 180ms ease;
  overflow: hidden;
}
.draft-composer-chat:focus-within {
  box-shadow:
    0 0 0 3px rgba(79, 91, 217, 0.16),
    0 1px 2px rgba(16,24,40,0.04),
    0 16px 40px rgba(15,23,42,0.12);
}

/* ── Floating selection toolbar ─────────────────────────────────────────── */
.draft-selection-toolbar {
  animation: draft-selection-in 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes draft-selection-in {
  from { opacity: 0; transform: translateY(4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.draft-selection-toolbar-inner {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  background: #FFFFFF;
  border: none;
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06), 0 12px 32px rgba(16,24,40,0.12);
  font-family: var(--font-sans);
}

.draft-selection-format-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: #52525B;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, transform 120ms ease;
}
.draft-selection-format-btn:hover {
  background: #EEF2FF;
  color: #4F5BD9;
}
.draft-selection-format-btn:active {
  transform: scale(0.94);
}
.draft-selection-format-btn.active {
  background: #18181B;
  color: #FFFFFF;
}

.draft-selection-divider {
  width: 1px;
  height: 18px;
  background: #E4E4E7;
  margin: 0 4px;
  flex-shrink: 0;
}

.draft-selection-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px 0 10px;
  border-radius: 999px;
  border: none;
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: opacity 150ms ease, transform 120ms ease;
}
.draft-selection-ai-btn:hover {
  opacity: 0.92;
}
.draft-selection-ai-btn:active {
  transform: scale(0.97);
}
.draft-selection-ai-btn.open {
  opacity: 0.92;
}

.draft-selection-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: #A1A1AA;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}
.draft-selection-close-btn:hover {
  background: #F4F4F5;
  color: #52525B;
}

/* ── Ask AI dropdown panel ──────────────────────────────────────────────── */
.draft-selection-panel {
  width: 340px;
  background: #FFFFFF;
  border: none;
  border-radius: 22px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06), 0 16px 40px rgba(16,24,40,0.12);
  animation: draft-selection-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
  font-family: var(--font-sans);
}

.draft-selection-panel-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #F0F0F0;
}

.draft-selection-panel-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: 12.5px;
  color: #18181B;
  letter-spacing: -0.01em;
}
.draft-selection-panel-input::placeholder {
  color: #A1A1AA;
}

.draft-selection-panel-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  border: none;
  color: #FFFFFF;
  cursor: pointer;
  transition: opacity 150ms ease;
  flex-shrink: 0;
}
.draft-selection-panel-send:hover:not(:disabled) {
  opacity: 0.9;
}
.draft-selection-panel-send:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.draft-selection-panel-item {
  display: block;
  width: 100%;
  padding: 8px 14px;
  text-align: left;
  font-size: 12.5px;
  color: #3F3F46;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
  letter-spacing: -0.01em;
}
.draft-selection-panel-item:hover {
  background: #F7F8FB;
  color: #1a1a1a;
}

.draft-selection-panel-tones {
  padding: 10px 14px 12px;
  border-top: 1px solid #F0F0F0;
}

.draft-selection-panel-tones-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #A1A1AA;
  margin-bottom: 8px;
}

.draft-selection-tone-chip {
  padding: 4px 10px;
  border-radius: 999px;
  border: none;
  background: #EEF2FF;
  font-size: 11.5px;
  font-weight: 500;
  color: #4F5BD9;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}
.draft-selection-tone-chip:hover {
  background: #e4e9ff;
}

/* ── Toolbar custom dropdowns ───────────────────────────────────────────── */
.draft-toolbar-dropdown {
  position: relative;
  flex-shrink: 0;
  z-index: 30;
}

.draft-toolbar-dropdown-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  height: 28px;
  padding: 0 10px 0 12px;
  background: #F7F8FB;
  border: none;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 500;
  color: #667085;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
  white-space: nowrap;
  font-family: var(--font-sans);
}
.draft-toolbar-dropdown-trigger:hover:not(:disabled) {
  background: #EEF2FF;
  color: #1a1a1a;
}
.draft-toolbar-dropdown-trigger.open {
  background: #111827;
  color: #ffffff;
}
.draft-toolbar-dropdown-trigger.open .draft-toolbar-dropdown-chevron {
  color: #ffffff;
}
.draft-toolbar-dropdown-trigger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.draft-toolbar-dropdown-chevron {
  color: #A1A1AA;
  transition: transform 200ms ease;
  flex-shrink: 0;
}
.draft-toolbar-dropdown-chevron.open {
  transform: rotate(180deg);
}

.draft-toolbar-dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 200;
  min-width: 100%;
  padding: 4px;
  background: #FFFFFF;
  border: none;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06), 0 12px 28px rgba(16,24,40,0.12);
  animation: draft-dropdown-in 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
  font-family: var(--font-sans);
}

@keyframes draft-dropdown-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.draft-toolbar-dropdown-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 12px;
  font-weight: 450;
  color: #3F3F46;
  text-align: left;
  cursor: pointer;
  letter-spacing: -0.01em;
  transition: background 120ms ease, color 120ms ease;
  white-space: nowrap;
}
.draft-toolbar-dropdown-item:hover {
  background: #F7F8FB;
  color: #1a1a1a;
}
.draft-toolbar-dropdown-item.active {
  background: #111827;
  color: #FFFFFF;
  font-weight: 500;
}
.draft-toolbar-dropdown-item.active:hover {
  background: #111827;
  color: #FFFFFF;
}
`;
