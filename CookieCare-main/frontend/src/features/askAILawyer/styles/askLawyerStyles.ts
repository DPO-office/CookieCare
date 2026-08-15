/** Ask AI Lawyer landing + chat — aligned with Analyze / DPA surfaces. */
export const ASK_LAWYER_STYLES = `
.ask-lawyer-landing.pcl-page {
  background-color: #eaf2ff;
  background-image:
    linear-gradient(rgba(124, 135, 251, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(124, 135, 251, 0.045) 1px, transparent 1px),
    url("/images/bg-main.svg");
  background-size: 56px 56px, 56px 56px, 100% auto;
  background-position: top center, top center, top center;
  background-repeat: repeat, repeat, no-repeat;
}

.ask-lawyer-landing .pcl-heading {
  font-size: clamp(1.75rem, 4vw, 2.125rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: #1a1a1a;
}

.ask-lawyer-landing .pcl-composer {
  border-radius: 24px;
  border: none;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
  transition: box-shadow 180ms ease;
}
.ask-lawyer-landing .pcl-composer:focus-within {
  box-shadow:
    0 0 0 3px rgba(79, 91, 217, 0.14),
    0 1px 2px rgba(16,24,40,0.04),
    0 12px 32px rgba(15,23,42,0.08);
}

.ask-lawyer-landing .pcl-input {
  color: #1a1a1a;
  font-weight: 400;
}
.ask-lawyer-landing .pcl-attach-btn:hover:not(:disabled) {
  background: #e4e9ff !important;
  color: #4F5BD9 !important;
}

.ask-lawyer-landing .pcl-enter-btn:not(:disabled):hover {
  background: linear-gradient(to bottom, #717dff, #4957eb) !important;
}

.ask-lawyer-chip {
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
.ask-lawyer-chip:hover {
  background: #f0f4ff;
  border-color: #d0d5dd;
  color: #1a1a1a;
}
.ask-lawyer-chip svg {
  color: #4F5BD9;
  flex-shrink: 0;
}

.ask-lawyer-session {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
}

.ask-lawyer-user-bubble {
  background: #111827;
  color: #ffffff;
  border-radius: 20px 20px 6px 20px;
  font-size: 14.5px;
  line-height: 1.55;
  letter-spacing: -0.01em;
}

.ask-lawyer-composer-chat {
  background: #ffffff;
  border-radius: 28px;
  box-shadow:
    0 1px 2px rgba(16,24,40,0.04),
    0 0 0 1px rgba(16,24,40,0.06),
    0 18px 40px rgba(15,23,42,0.08);
  transition: box-shadow 180ms ease;
}
.ask-lawyer-composer-chat:focus-within {
  box-shadow:
    0 0 0 3px rgba(79, 91, 217, 0.14),
    0 1px 2px rgba(16,24,40,0.04),
    0 18px 40px rgba(15,23,42,0.10);
}

.ask-lawyer-composer-fade {
  background: linear-gradient(to top, #eaf2ff 55%, rgba(234, 242, 255, 0));
}

.ask-lawyer-prose {
  font-size: 15.5px;
  line-height: 1.75;
  color: #344054;
  letter-spacing: -0.011em;
}
.ask-lawyer-prose h1,
.ask-lawyer-prose h2,
.ask-lawyer-prose h3 {
  color: #1a1a1a;
  letter-spacing: -0.02em;
  font-weight: 600;
}
.ask-lawyer-prose p {
  margin: 0 0 0.9em;
}
.ask-lawyer-prose p:last-child {
  margin-bottom: 0;
}
.ask-lawyer-prose ul,
.ask-lawyer-prose ol {
  margin: 0.4em 0 1em;
  padding-left: 1.2em;
}
.ask-lawyer-prose li {
  margin-bottom: 0.4em;
}
.ask-lawyer-prose.streaming-cursor::after {
  color: #4F5BD9;
}

.ask-lawyer-sources {
  background: #ffffff;
  border-radius: 24px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
}
`;
