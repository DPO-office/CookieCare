// ─── Vault Repository — Scoped CSS (light premium) ───────────────────────────

export const VAULT_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,200;0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,300;1,14..32,400&display=swap');

.vlt {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  --ink: #18181B;
  --surface: #F4F4F5;
  --surface-hover: #FAFAFA;
  --border: #E4E4E7;
  --border-light: #F0F0F0;
  --text-primary: #18181B;
  --text-secondary: #52525B;
  --text-muted: #A1A1AA;
  --text-faint: #C4C4C4;
  --bg: #FAFAFA;
  --bg-card: #FFFFFF;
  --accent: #18181B;
  --accent-ring: rgba(24, 24, 27, 0.08);
}

@keyframes vlt-rise {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
.vlt-rise-1 { animation: vlt-rise 0.7s cubic-bezier(0.16,1,0.3,1) 0.04s both; }
.vlt-rise-2 { animation: vlt-rise 0.7s cubic-bezier(0.16,1,0.3,1) 0.12s both; }
.vlt-rise-3 { animation: vlt-rise 0.7s cubic-bezier(0.16,1,0.3,1) 0.20s both; }
.vlt-rise-4 { animation: vlt-rise 0.7s cubic-bezier(0.16,1,0.3,1) 0.28s both; }

.vlt-tab {
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
  border: 1px solid transparent;
}
.vlt-tab:hover {
  background: var(--surface) !important;
  color: var(--text-secondary) !important;
  border-color: var(--border-light) !important;
}
.vlt-tab.active {
  background: var(--ink) !important;
  color: #FFFFFF !important;
  border-color: var(--ink) !important;
}

.vlt-row {
  transition: background 130ms ease;
  border-bottom: 1px solid var(--border-light);
}
.vlt-row:last-child { border-bottom: 0; }
.vlt-row:hover { background: var(--surface-hover) !important; }

.vlt-input {
  background: #FFFFFF;
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13.5px;
  width: 100%;
  outline: none;
  transition: border-color 180ms ease, box-shadow 180ms ease;
  font-family: inherit;
}
.vlt-input::placeholder { color: var(--text-faint); }
.vlt-input:focus {
  border-color: #D4D4D8;
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.vlt-input:disabled { opacity: 0.4; cursor: not-allowed; }

.vlt-search {
  background: #FFFFFF;
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 8px 14px 8px 36px;
  font-size: 13px;
  width: 100%;
  outline: none;
  transition: border-color 180ms ease, box-shadow 180ms ease;
  font-family: inherit;
}
.vlt-search::placeholder { color: var(--text-faint); }
.vlt-search:focus {
  border-color: #D4D4D8;
  box-shadow: 0 0 0 3px var(--accent-ring);
}

.vlt-btn-primary {
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--ink); color: #fff;
  font-size: 13px; font-weight: 600; letter-spacing: -0.01em;
  padding: 8px 16px; border-radius: 999px; border: none;
  cursor: pointer; font-family: inherit;
  transition: background 150ms ease, opacity 150ms ease;
}
.vlt-btn-primary:hover:not(:disabled) { background: #262626; }
.vlt-btn-primary:active:not(:disabled) { opacity: 0.88; }
.vlt-btn-primary:disabled { opacity: 0.30; cursor: not-allowed; }

.vlt-btn-ghost {
  display: inline-flex; align-items: center; gap: 7px;
  background: #FFFFFF;
  color: var(--text-secondary);
  font-size: 13px; font-weight: 500; letter-spacing: -0.01em;
  padding: 8px 14px; border-radius: 999px;
  border: 1px solid var(--border);
  cursor: pointer; font-family: inherit;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}
.vlt-btn-ghost:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: #D4D4D8;
  color: var(--text-primary);
}
.vlt-btn-ghost:disabled { opacity: 0.35; cursor: not-allowed; }

.vlt-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 8px;
  background: #FFFFFF;
  border: 1px solid var(--border);
  color: var(--text-muted); cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}
.vlt-icon-btn:hover {
  background: var(--surface);
  border-color: #D4D4D8;
  color: var(--text-primary);
}
.vlt-icon-btn.danger:hover {
  background: #FEF2F2;
  border-color: #FECACA;
  color: #DC2626;
}

.vlt-overlay {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(250, 250, 250, 0.88);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}

.vlt-modal {
  background: #FFFFFF;
  border: 1px solid var(--border);
  border-radius: 22px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.08), 0 24px 48px rgba(0,0,0,0.04);
  width: 100%;
  overflow: hidden;
  position: relative;
}

.vlt-dropzone {
  border: 1.5px dashed #D4D4D8;
  border-radius: 16px;
  background: var(--surface-hover);
  text-align: center;
  padding: 36px 24px;
  transition: border-color 180ms ease, background 180ms ease;
  cursor: pointer;
}
.vlt-dropzone:hover {
  border-color: #A1A1AA;
  background: var(--surface);
}

.vlt-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px; font-weight: 500;
  background: var(--surface);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
}

.vlt-status-processing {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  background: #EFF6FF; border: 1px solid #BFDBFE;
  color: #1D4ED8;
}
.vlt-status-failed {
  padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  background: #FEF2F2; border: 1px solid #FECACA;
  color: #DC2626;
}
.vlt-status-synced {
  padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  background: #ECFDF5; border: 1px solid #A7F3D0;
  color: #047857;
}

.vlt-progress-track {
  height: 3px; border-radius: 100px;
  background: var(--surface);
  overflow: hidden;
}
.vlt-progress-fill {
  height: 100%; border-radius: 100px;
  background: var(--ink);
  transition: width 400ms ease-out;
}

.vlt ::-webkit-scrollbar { width: 4px; }
.vlt ::-webkit-scrollbar-track { background: transparent; }
.vlt ::-webkit-scrollbar-thumb { background: #E4E4E7; border-radius: 10px; }
.vlt ::-webkit-scrollbar-thumb:hover { background: #D4D4D8; }

.vlt-overline {
  font-size: 10px; font-weight: 600; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--text-muted);
}

.vlt-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 22px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.04);
}

@keyframes vlt-fade { from { opacity: 0; } to { opacity: 1; } }
.vlt-fade { animation: vlt-fade 220ms ease both; }

@keyframes spin { to { transform: rotate(360deg); } }
`;
