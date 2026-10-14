// ─── LORA AI — Scoped CSS ────────────────────────────────────────────────
// Injected once via <style>{PAGE_STYLES}</style> in LORAAI.tsx.
// Kept separate so the component files stay readable and this can be migrated
// to a .css module in the future without touching component code.
//
// Background variants
// -------------------
//   PAGE_STYLES        → light mode (Version A: plain #F7F8FA)
//   PAGE_STYLES_SUBTLE → light mode (Version B: #F7F8FA + ambient texture)
//
// Both share the same component tokens below; only the root background and a
// handful of surface/text colours differ between dark and light builds.

// ── Shared component styles (background-agnostic) ─────────────────────────────
const SHARED_STYLES = `

/* ── Entrance animations ─────────────────────────────────────────────────── */
@keyframes rt-rise {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
.rt-rise-1 { animation: rt-rise 0.8s cubic-bezier(0.16,1,0.3,1) 0.05s both; }
.rt-rise-2 { animation: rt-rise 0.8s cubic-bezier(0.16,1,0.3,1) 0.18s both; }
.rt-rise-3 { animation: rt-rise 0.8s cubic-bezier(0.16,1,0.3,1) 0.30s both; }
.rt-rise-4 { animation: rt-rise 0.8s cubic-bezier(0.16,1,0.3,1) 0.42s both; }

/* ── Send button ─────────────────────────────────────────────────────────── */
.rt-send-btn { transition: background 150ms ease, transform 120ms ease, box-shadow 150ms ease; }
.rt-send-btn.ready:hover { transform: scale(1.06); }
.rt-send-btn.ready:active { transform: scale(0.97); }

/* ── Chip pill ───────────────────────────────────────────────────────────── */
.rt-chip {
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
}

/* ── Message fade-in ─────────────────────────────────────────────────────── */
@keyframes rt-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.rt-msg-in { animation: rt-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes rt-fade { from { opacity: 0; } to { opacity: 1; } }
.rt-fade { animation: rt-fade 220ms ease both; }

/* ── Blink cursor ────────────────────────────────────────────────────────── */
@keyframes rt-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
`;

// ── Light theme tokens & component overrides ─────────────────────────────────
const LIGHT_STYLES = `
.rt {
  font-family: var(--font-sans);
  --blue:       #2175D9;
  --blue-dim:   rgba(33,117,217,0.08);
  --blue-ring:  rgba(33,117,217,0.22);
  --blue-glow:  rgba(33,117,217,0.10);
  --surface:    rgba(255,255,255,0.92);
  --border:     rgba(0,0,0,0.08);
  /* Text on light bg */
  --text-primary:   #111827;
  --text-secondary: #374151;
  --text-tertiary:  #6B7280;
  --text-muted:     #9CA3AF;
}

/* ── Composer ─────────────────────────────────────────────────────────────── */
.rt-composer {
  transition: border-color 280ms ease, box-shadow 280ms ease;
  border: 1px solid rgba(0,0,0,0.09) !important;
  box-shadow:
    0 1px 3px rgba(0,0,0,0.06),
    0 4px 16px rgba(0,0,0,0.05);
}
.rt-composer:focus-within {
  border-color: var(--blue-ring) !important;
  box-shadow:
    0 0 0 3px var(--blue-dim),
    0 1px 3px rgba(0,0,0,0.06),
    0 4px 16px rgba(0,0,0,0.05);
}

/* ── Hero heading ─────────────────────────────────────────────────────────── */
.rt-hero-heading {
  text-shadow: none;
}

/* ── Overline badge ───────────────────────────────────────────────────────── */
.rt-overline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(33,117,217,0.20);
  background: rgba(33,117,217,0.06);
  border-radius: 100px;
  padding: 4px 12px;
  color: #1A5BAD;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.rt-overline::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #2175D9;
  opacity: 0.7;
}

/* ── Chip pill ───────────────────────────────────────────────────────────── */
.rt-chip:hover {
  background: rgba(0,0,0,0.05) !important;
  border-color: rgba(0,0,0,0.13) !important;
  color: #374151 !important;
}

/* ── AI response typography ──────────────────────────────────────────────── */
.rt-response { color: #374151; line-height: 1.78; }
.rt-response > :first-child { margin-top: 0; }
.rt-response > :last-child  { margin-bottom: 0; }
.rt-response h1 { font-size: 1.2rem; font-weight: 600; color: #111827; margin: 1.4rem 0 0.55rem; letter-spacing: -0.02em; }
.rt-response h2 { font-size: 1rem;   font-weight: 600; color: #1F2937; margin: 1.2rem 0 0.5rem; letter-spacing: -0.01em; }
.rt-response h3 { font-size: 0.9rem; font-weight: 600; color: #374151; margin: 1rem 0 0.4rem; }
.rt-response p  { margin: 0 0 0.8rem; }
.rt-response ul, .rt-response ol { margin: 0 0 0.85rem; padding-left: 1.3rem; }
.rt-response ul { list-style: disc; }
.rt-response ol { list-style: decimal; }
.rt-response li { margin: 0.3rem 0; }
.rt-response strong { font-weight: 600; color: #111827; }
.rt-response em    { font-style: italic; color: #6B7280; }
.rt-response code {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.85em; background: rgba(0,0,0,0.05);
  border: 1px solid rgba(0,0,0,0.08); border-radius: 5px;
  padding: 0.1rem 0.38rem; color: #1F2937;
}
.rt-response pre {
  background: #F3F4F6; border: 1px solid #E4E4E7;
  border-radius: 12px; padding: 1.1rem 1.25rem; overflow-x: auto; margin: 0.9rem 0;
}
.rt-response pre code { background: transparent; border: 0; padding: 0; font-size: 0.82rem; line-height: 1.6; }
.rt-response blockquote {
  border-left: 2px solid rgba(33,117,217,0.35); padding: 0.35rem 1rem;
  margin: 0.9rem 0; color: #6B7280; font-style: italic;
}
.rt-response hr { border: 0; border-top: 1px solid #E4E4E7; margin: 1.25rem 0; }
.rt-response table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin: 0.9rem 0; }
.rt-response th {
  text-align: left; padding: 0.6rem 0.8rem; font-weight: 600;
  font-size: 0.75rem; letter-spacing: 0.02em; text-transform: uppercase;
  color: #9CA3AF; border-bottom: 1px solid #E4E4E7; background: #F9FAFB;
}
.rt-response td {
  padding: 0.6rem 0.8rem; border-bottom: 1px solid #F0F0F2;
  color: #374151; vertical-align: top;
}
.rt-response tr:last-child td { border-bottom: 0; }

/* ── Scrollbar ───────────────────────────────────────────────────────────── */
.rt ::-webkit-scrollbar { width: 3px; }
.rt ::-webkit-scrollbar-track { background: transparent; }
.rt ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.10); border-radius: 10px; }
.rt ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.18); }

/* ── Blink cursor ────────────────────────────────────────────────────────── */
.rt-cursor::after {
  content: ''; display: inline-block; width: 2px; height: 1em;
  background: var(--blue); margin-left: 2px; vertical-align: text-bottom;
  animation: rt-blink 1s step-end infinite;
}

/* ── Loading shimmer ─────────────────────────────────────────────────────── */
@keyframes rt-shimmer { 0% { background-position: -120% 0; } 100% { background-position: 220% 0; } }
.rt-loading-text {
  background: linear-gradient(90deg, #9CA3AF 0%, #9CA3AF 40%, #374151 50%, #9CA3AF 60%, #9CA3AF 100%);
  background-size: 250% 100%; -webkit-background-clip: text; background-clip: text;
  color: transparent; animation: rt-shimmer 2.2s ease-in-out infinite;
}

/* ── Textarea placeholder ────────────────────────────────────────────────── */
.rt-input::placeholder { color: #9CA3AF; }
`;

// ── Version A: Plain light background ────────────────────────────────────────
export const PAGE_STYLES = SHARED_STYLES + LIGHT_STYLES;

// ── Version B: Light background + ambient texture ────────────────────────────
// Identical to Version A in CSS — the extra visual layers are rendered as
// React elements in <SubtleBackground /> so they can be independently toggled.
export const PAGE_STYLES_SUBTLE = PAGE_STYLES;
