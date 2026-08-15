export const DRAFT_PAGE_STYLES = `
@keyframes pcl-rise {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
.draft-rise-1 { animation: pcl-rise 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both; }
.draft-rise-2 { animation: pcl-rise 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.20s both; }

.draft-page {
  font-family: var(--font-sans);
}

.draft-heading {
  font-size: clamp(1.75rem, 4vw, 2.125rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: #1a1a1a;
}

.draft-composer {
  border-radius: 24px;
  border: none;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
  transition: box-shadow 180ms ease;
}
.draft-composer:focus-within {
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.14);
}

.draft-composer-chat {
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
}

.draft-input {
  color: #1a1a1a;
  font-weight: 400;
  line-height: 1.55;
  overflow-y: auto;
  resize: none;
  field-sizing: fixed;
  scrollbar-width: thin;
}
.draft-input::placeholder { color: #98A2B3; }
.draft-input::-webkit-resizer { display: none; }

.draft-icon-btn {
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
  transition: background 150ms ease, opacity 150ms ease;
}
.draft-icon-btn:hover:not(:disabled) { background: #e4e9ff; }
.draft-icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.draft-enter-btn {
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
.draft-enter-btn:not(:disabled):hover { opacity: 0.9; }
.draft-enter-btn:not(:disabled):active { transform: scale(0.96); }
.draft-enter-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.draft-context-card {
  border-radius: 22px;
  background: #fff;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
}

.draft-chip {
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
.draft-chip:hover {
  background: #f0f4ff;
  border-color: #d0d5dd;
  color: #1a1a1a;
}
.draft-link {
  font-size: 13px;
  font-weight: 500;
  color: #98A2B3;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 150ms ease;
}
.draft-link:hover { color: #1a1a1a; }
`;
