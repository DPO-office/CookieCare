// ─── Draft — Scoped premium chat styles ─────────────────────────────────────
// Injected once via <style>{DRAFT_PAGE_STYLES}</style> in DraftChatLanding.tsx.

import { PREMIUM_CHAT_LANDING_STYLES } from "../../../shared/styles/premiumChatLandingStyles";

/** @deprecated Use PREMIUM_CHAT_LANDING_STYLES — kept for draft class aliases */
export const DRAFT_PAGE_STYLES = `
${PREMIUM_CHAT_LANDING_STYLES}
.draft-rise-1 { animation: pcl-rise 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both; }
.draft-rise-2 { animation: pcl-rise 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.20s both; }
.draft-page { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #FFFFFF; }
.draft-heading { font-size: clamp(1.35rem, 2.5vw, 1.65rem); font-weight: 500; letter-spacing: 0.01em; color: #404040; }
.draft-composer { border-radius: 22px; border: 1px solid rgba(0, 0, 0, 0.08); background: #FFFFFF; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 6px 28px rgba(0, 0, 0, 0.06); transition: border-color 220ms ease, box-shadow 220ms ease; }
.draft-composer:focus-within { border-color: rgba(0, 102, 204, 0.22); box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.07), 0 1px 3px rgba(0, 0, 0, 0.04), 0 6px 28px rgba(0, 0, 0, 0.06); }
.draft-input::placeholder { color: #C4C4C4; }
.draft-attach-btn { transition: background 150ms ease, color 150ms ease; }
.draft-attach-btn:hover { background: #F5F5F5 !important; color: #525252 !important; }
.draft-enter-btn { transition: background 150ms ease, transform 120ms ease, opacity 150ms ease; }
.draft-enter-btn:not(:disabled):hover { background: #262626 !important; }
.draft-enter-btn:not(:disabled):active { transform: scale(0.96); }
.draft-footer-link { text-decoration: underline; text-underline-offset: 2px; cursor: pointer; transition: color 150ms ease; }
.draft-footer-link:hover { color: #525252 !important; }
.draft-page ::-webkit-scrollbar { width: 3px; }
.draft-page ::-webkit-scrollbar-track { background: transparent; }
.draft-page ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.10); border-radius: 10px; }
`;
