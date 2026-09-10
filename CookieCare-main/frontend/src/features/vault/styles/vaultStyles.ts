export const VAULT_STYLES = `

.vlt {
  font-family: var(--font-sans);
  --ink: #1a1a1a;
  --surface: #F7F8FB;
  --surface-hover: #EEF2FF;
  --border: #E4E4E7;
  --border-light: #F0F0F0;
  --text-primary: #1a1a1a;
  --text-secondary: #667085;
  --text-muted: #667085;
  --text-faint: #98A2B3;
  --bg: transparent;
  --bg-card: #FFFFFF;
  --accent: #4F5BD9;
  --accent-ring: rgba(79, 91, 217, 0.16);
  --card-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
}

@keyframes vlt-rise {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.vlt-rise-1 { animation: vlt-rise 0.45s cubic-bezier(0.16,1,0.3,1) 0.04s both; }
.vlt-rise-2 { animation: vlt-rise 0.45s cubic-bezier(0.16,1,0.3,1) 0.10s both; }
.vlt-rise-3 { animation: vlt-rise 0.45s cubic-bezier(0.16,1,0.3,1) 0.16s both; }

.vlt-tab {
  transition: background 160ms ease, color 160ms ease;
  border: none;
  background: transparent;
}
.vlt-tab:hover:not(.active) {
  background: #EEF2FF !important;
  color: #4F5BD9 !important;
}
.vlt-tab.active {
  background: #111827 !important;
  color: #FFFFFF !important;
}

.vlt-row {
  transition: background 130ms ease;
  border-bottom: 1px solid var(--border-light);
}
.vlt-row:last-child { border-bottom: 0; }
.vlt-row:hover { background: #FAFBFF !important; }

.vlt-input {
  background: #FFFFFF;
  border: none;
  color: var(--text-primary);
  border-radius: 14px;
  padding: 10px 14px;
  font-size: 13.5px;
  width: 100%;
  outline: none;
  box-shadow: var(--card-shadow);
  transition: box-shadow 180ms ease;
  font-family: inherit;
}
.vlt-input::placeholder { color: var(--text-faint); }
.vlt-input:focus {
  box-shadow: 0 0 0 1.5px #8e98ff, 0 8px 24px rgba(96,107,235,0.08);
}
.vlt-input:disabled { opacity: 0.4; cursor: not-allowed; }

.vlt-search {
  background: #F7F8FB;
  border: none;
  color: var(--text-primary);
  border-radius: 999px;
  padding: 8px 14px 8px 36px;
  font-size: 13px;
  width: 100%;
  outline: none;
  transition: background 180ms ease, box-shadow 180ms ease;
  font-family: inherit;
}
.vlt-search::placeholder { color: var(--text-faint); }
.vlt-search:focus {
  background: #FFFFFF;
  box-shadow: 0 0 0 1.5px #8e98ff, 0 8px 24px rgba(96,107,235,0.08);
}

.vlt-btn-primary {
  display: inline-flex; align-items: center; gap: 7px;
  background: linear-gradient(to bottom, #8e98ff, #606beb);
  color: #fff;
  font-size: 13px; font-weight: 600; letter-spacing: -0.01em;
  padding: 8px 16px; border-radius: 999px; border: none;
  cursor: pointer; font-family: inherit;
  transition: opacity 150ms ease, transform 120ms ease;
}
.vlt-btn-primary:hover:not(:disabled) { opacity: 0.92; }
.vlt-btn-primary:active:not(:disabled) { transform: scale(0.99); }
.vlt-btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }

.vlt-btn-ghost {
  display: inline-flex; align-items: center; gap: 7px;
  background: #FFFFFF;
  color: #667085;
  font-size: 13px; font-weight: 500; letter-spacing: -0.01em;
  padding: 8px 14px; border-radius: 999px;
  border: none;
  box-shadow: var(--card-shadow);
  cursor: pointer; font-family: inherit;
  transition: background 160ms ease, color 160ms ease;
}
.vlt-btn-ghost:hover:not(:disabled) {
  background: #EEF2FF;
  color: #4F5BD9;
}
.vlt-btn-ghost:disabled { opacity: 0.35; cursor: not-allowed; }

.vlt-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 999px;
  background: #F7F8FB;
  border: none;
  color: var(--text-muted); cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}
.vlt-icon-btn:hover {
  background: #EEF2FF;
  color: #4F5BD9;
}
.vlt-icon-btn.danger:hover {
  background: #FEF2F2;
  color: #DC2626;
}

.vlt-overlay {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}

.vlt-modal {
  background: #FFFFFF;
  border: none;
  border-radius: 24px;
  box-shadow: var(--card-shadow), 0 24px 48px rgba(16,24,40,0.10);
  width: 100%;
  overflow: hidden;
  position: relative;
}

.vlt-dropzone {
  border: none;
  border-radius: 22px;
  background: #F7F8FB;
  box-shadow: inset 0 0 0 1px rgba(16,24,40,0.06);
  text-align: center;
  padding: 36px 24px;
  transition: background 180ms ease, box-shadow 180ms ease;
  cursor: pointer;
}
.vlt-dropzone:hover {
  background: #EEF2FF;
  box-shadow: 0 0 0 1.5px #8e98ff, 0 8px 24px rgba(96,107,235,0.08);
}

.vlt-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px; font-weight: 500;
  background: #EEF2FF;
  border: none;
  color: #4F5BD9;
}

.vlt-status-processing {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  background: #EEF2FF; border: none;
  color: #4F5BD9;
}
.vlt-status-failed {
  padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  background: #FEF2F2; border: none;
  color: #DC2626;
}
.vlt-status-synced {
  padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  background: #ECFDF5; border: none;
  color: #047857;
}

.vlt-progress-track {
  height: 3px; border-radius: 100px;
  background: #EEF2FF;
  overflow: hidden;
}
.vlt-progress-fill {
  height: 100%; border-radius: 100px;
  background: linear-gradient(to bottom, #8e98ff, #606beb);
  transition: width 400ms ease-out;
}

.vlt-tabs {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.vlt-tabs::-webkit-scrollbar { display: none; }

/* Hide scrollbar on any horizontal-scroll table wrapper while keeping scroll functional */
.vlt-scroll-x {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.vlt-scroll-x::-webkit-scrollbar { display: none; }

.vlt-overline {
  font-size: 10px; font-weight: 600; letter-spacing: 0.14em;
  text-transform: uppercase; color: #98A2B3;
}

.vlt-card {
  background: var(--bg-card);
  border: none;
  border-radius: 24px;
  box-shadow: var(--card-shadow);
}

@keyframes vlt-fade { from { opacity: 0; } to { opacity: 1; } }
.vlt-fade { animation: vlt-fade 220ms ease both; }

@keyframes spin { to { transform: rotate(360deg); } }
`;
