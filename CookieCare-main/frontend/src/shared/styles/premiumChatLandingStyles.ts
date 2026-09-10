// Shared premium chat landing styles — used by Draft, Analyze, Ask Lawyer.

export const PREMIUM_CHAT_LANDING_STYLES = `

@keyframes pcl-rise {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
.pcl-rise-1 { animation: pcl-rise 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both; }
.pcl-rise-2 { animation: pcl-rise 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.20s both; }

.pcl-page {
  font-family: var(--font-sans);
  background: #FFFFFF;
}

.pcl-heading {
  font-size: clamp(1.35rem, 2.5vw, 1.65rem);
  font-weight: 500;
  letter-spacing: 0.01em;
  color: #404040;
}

.pcl-composer {
  border-radius: 22px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #FFFFFF;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.04),
    0 6px 28px rgba(0, 0, 0, 0.06);
  transition: border-color 220ms ease, box-shadow 220ms ease;
}
.pcl-composer:focus-within {
  border-color: rgba(0, 102, 204, 0.22);
  box-shadow:
    0 0 0 3px rgba(0, 102, 204, 0.07),
    0 1px 3px rgba(0, 0, 0, 0.04),
    0 6px 28px rgba(0, 0, 0, 0.06);
}

.pcl-input::placeholder { color: #C4C4C4; }

.pcl-attach-btn {
  transition: background 150ms ease, color 150ms ease;
}
.pcl-attach-btn:hover:not(:disabled) {
  background: #F5F5F5 !important;
  color: #525252 !important;
}

.pcl-enter-btn {
  transition: background 150ms ease, transform 120ms ease, opacity 150ms ease;
}
.pcl-enter-btn:not(:disabled):hover {
  background: #262626 !important;
}
.pcl-enter-btn:not(:disabled):active {
  transform: scale(0.96);
}

.pcl-footer-link {
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  transition: color 150ms ease;
}
.pcl-footer-link:hover {
  color: #525252 !important;
}

.pcl-page ::-webkit-scrollbar { width: 3px; }
.pcl-page ::-webkit-scrollbar-track { background: transparent; }
.pcl-page ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.10); border-radius: 10px; }
`;
