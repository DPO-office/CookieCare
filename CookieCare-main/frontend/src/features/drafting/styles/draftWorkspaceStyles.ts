export const DRAFT_WORKSPACE_STYLES = `
.draft-workspace {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: #FFFFFF;
}

/* ── Chat panel ─────────────────────────────────────────────────────────── */
.draft-chat-user-bubble {
  background: #F4F4F5;
  color: #27272A;
  border: 1px solid #EBEBEB;
  border-radius: 18px;
  border-top-right-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.draft-chat-example {
  border: 1px solid #E4E4E7;
  border-radius: 12px;
  background: #FAFAFA;
}

/* ── Resize handle ──────────────────────────────────────────────────────── */
.draft-resize-handle {
  width: 6px;
  cursor: col-resize;
  background: transparent;
  transition: background 150ms ease;
  flex-shrink: 0;
  position: relative;
}
.draft-resize-handle::after {
  content: '';
  position: absolute;
  inset: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: #EBEBEB;
  opacity: 0;
  transition: opacity 150ms ease;
}
.draft-resize-handle:hover::after,
.draft-resize-handle:active::after {
  opacity: 1;
}
.draft-resize-handle:hover,
.draft-resize-handle:active {
  background: #F4F4F5;
}

/* ── Editor canvas ─────────────────────────────────────────────────────── */
.draft-editor-canvas {
  background: #F5F5F5;
}

.draft-editor-paper {
  width: 100%;
  max-width: none;
  background: #FFFFFF;
  border: 1px solid #E8E8E8;
  border-radius: 8px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.04),
    0 12px 40px rgba(0, 0, 0, 0.07);
  padding: 48px 56px;
  min-height: calc(100vh - 180px);
}

.draft-editor-paper .richtext-editor {
  font-family: 'Times New Roman', Times, serif;
  font-size: 12pt;
  line-height: 1.65;
  color: #18181B;
  min-height: 55vh !important;
}

.draft-editor-paper .richtext-editor h1 {
  font-size: 16pt;
  font-weight: 700;
  margin: 1.2em 0 0.6em;
  text-align: center;
}

.draft-editor-paper .richtext-editor h2 {
  font-size: 14pt;
  font-weight: 700;
  margin: 1em 0 0.5em;
}

.draft-editor-paper .richtext-editor h3 {
  font-size: 12pt;
  font-weight: 700;
  margin: 0.8em 0 0.4em;
}

.draft-editor-paper .richtext-editor p {
  margin: 0 0 0.75em;
}

.draft-editor-paper .richtext-editor ul,
.draft-editor-paper .richtext-editor ol {
  margin: 0 0 0.75em;
  padding-left: 1.5em;
}

.draft-editor-paper .richtext-editor table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 11pt;
}

.draft-editor-paper .richtext-editor th,
.draft-editor-paper .richtext-editor td {
  border: 1px solid #D4D4D8;
  padding: 6px 10px;
  vertical-align: top;
}

.draft-editor-paper .richtext-editor th {
  background: #F4F4F5;
  font-weight: 600;
}

.draft-editor-paper .richtext-editor a.draft-editor-link {
  color: #2563EB;
  text-decoration: underline;
}

.draft-editor-paper .richtext-editor hr {
  border: none;
  border-top: 1px solid #E4E4E7;
  margin: 1.5em 0;
}

.draft-streaming-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #F0F9FF;
  border: 1px solid #BAE6FD;
  color: #0369A1;
  font-size: 11.5px;
  font-weight: 500;
}

.draft-streaming-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #0EA5E9;
  animation: draft-pulse 1.2s ease-in-out infinite;
}

@keyframes draft-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.draft-zoom-pill {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #E4E4E7;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  border-radius: 999px;
  backdrop-filter: blur(8px);
}

.draft-toolbar {
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.04);
  position: relative;
  z-index: 20;
  overflow: visible;
}

/* ── Chat composer pill (split-screen) ──────────────────────────────────── */
.draft-composer-chat {
  border-radius: 28px;
  border: 1px solid #E4E4E7;
  background: #FFFFFF;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 8px 32px rgba(0, 0, 0, 0.07);
  transition: border-color 200ms ease, box-shadow 200ms ease;
  overflow: visible;
}
.draft-composer-chat:focus-within {
  border-color: #D4D4D8;
  box-shadow:
    0 0 0 3px rgba(24, 24, 27, 0.05),
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 8px 32px rgba(0, 0, 0, 0.08);
}

.draft-composer-chat .draft-input::placeholder {
  color: #D4D4D8;
}

.draft-attach-btn {
  transition: background 150ms ease, color 150ms ease;
}
.draft-attach-btn:hover:not(:disabled) {
  background: #EBEBEB !important;
  color: #3F3F46 !important;
}

.draft-enter-btn {
  transition: background 150ms ease, transform 120ms ease, opacity 150ms ease;
}
.draft-enter-btn:not(:disabled):hover {
  background: #27272A !important;
}
.draft-enter-btn:not(:disabled):active {
  transform: scale(0.96);
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
  border: 1px solid #E4E4E7;
  border-radius: 999px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.08),
    0 10px 24px -4px rgba(0, 0, 0, 0.10),
    0 0 0 1px rgba(0, 0, 0, 0.02);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
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
  background: #F4F4F5;
  color: #18181B;
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
  background: #18181B;
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: background 150ms ease, box-shadow 150ms ease, transform 120ms ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
}
.draft-selection-ai-btn:hover {
  background: #27272A;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
}
.draft-selection-ai-btn:active {
  transform: scale(0.97);
}
.draft-selection-ai-btn.open {
  background: #27272A;
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
  border: 1px solid #E4E4E7;
  border-radius: 16px;
  overflow: hidden;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.06),
    0 16px 40px -8px rgba(0, 0, 0, 0.12);
  animation: draft-selection-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
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
  border-radius: 8px;
  border: none;
  background: #18181B;
  color: #FFFFFF;
  cursor: pointer;
  transition: background 150ms ease, opacity 150ms ease;
  flex-shrink: 0;
}
.draft-selection-panel-send:hover:not(:disabled) {
  background: #27272A;
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
  background: #FAFAFA;
  color: #18181B;
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
  border: 1px solid #E4E4E7;
  background: #FAFAFA;
  font-size: 11.5px;
  font-weight: 500;
  color: #52525B;
  cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease, background 150ms ease;
}
.draft-selection-tone-chip:hover {
  border-color: #18181B;
  color: #18181B;
  background: #F4F4F5;
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
  padding: 0 8px 0 10px;
  background: #FFFFFF;
  border: 1px solid #E4E4E7;
  border-radius: 8px;
  font-size: 11.5px;
  font-weight: 500;
  color: #3F3F46;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
  white-space: nowrap;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
.draft-toolbar-dropdown-trigger:hover:not(:disabled) {
  border-color: #D4D4D8;
  background: #FAFAFA;
}
.draft-toolbar-dropdown-trigger.open {
  border-color: #A1A1AA;
  box-shadow: 0 0 0 3px rgba(24, 24, 27, 0.06);
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
  border: 1px solid #E4E4E7;
  border-radius: 12px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.06),
    0 12px 28px -4px rgba(0, 0, 0, 0.12);
  animation: draft-dropdown-in 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
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
  background: #F4F4F5;
  color: #18181B;
}
.draft-toolbar-dropdown-item.active {
  background: #18181B;
  color: #FFFFFF;
  font-weight: 500;
}
.draft-toolbar-dropdown-item.active:hover {
  background: #27272A;
  color: #FFFFFF;
}
`;
