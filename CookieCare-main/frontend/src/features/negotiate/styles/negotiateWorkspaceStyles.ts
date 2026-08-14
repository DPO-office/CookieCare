export const NEGOTIATE_WORKSPACE_STYLES = `
.negotiate-scroll,
.negotiate-scroll * {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.negotiate-scroll::-webkit-scrollbar,
.negotiate-scroll *::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.negotiate-paper,
.negotiate-document-body {
  font-family: 'Times New Roman', Times, serif;
}

.negotiate-document-body {
  font-size: 12pt;
  line-height: 1.7;
  color: #334155;
}

.negotiate-document-body h1 {
  font-size: 18pt;
  font-weight: 700;
  margin: 0 0 1em;
  text-align: center;
  color: #0F172A;
  letter-spacing: 0.01em;
  line-height: 1.35;
}

.negotiate-document-body h2 {
  font-size: 13.5pt;
  font-weight: 700;
  margin: 1.6em 0 0.7em;
  color: #0F172A;
  padding-left: 12px;
  border-left: 3px solid #4F5BD9;
  line-height: 1.4;
}

.negotiate-document-body h3 {
  font-size: 12pt;
  font-weight: 700;
  margin: 1.2em 0 0.5em;
  color: #1E293B;
}

.negotiate-clause-highlight {
  border-radius: 6px !important;
}

.negotiate-clause-highlight.ring-2 {
  --tw-ring-color: #4F5BD9 !important;
}

.negotiate-clause-working {
  position: relative;
  display: inline;
  border-radius: 6px;
  padding: 0 4px;
  color: #4F5BD9;
  background: linear-gradient(90deg, rgba(238,242,255,0.4) 0%, rgba(199,210,254,0.85) 45%, rgba(238,242,255,0.4) 100%);
  background-size: 220% 100%;
  filter: blur(3.5px);
  animation: negotiate-clause-blur 1.35s ease-in-out infinite, negotiate-clause-shimmer 1.6s ease-in-out infinite;
}

.negotiate-clause-working .line-through {
  text-decoration: none;
  color: inherit;
}

.negotiate-clause-applied {
  display: inline;
  border-radius: 6px;
  padding: 0 4px;
  background: rgba(79, 91, 217, 0.12);
  box-shadow: 0 0 0 3px rgba(79, 91, 217, 0.12);
  color: #1E293B;
  animation: negotiate-clause-reveal 0.9s ease-out;
}

@keyframes negotiate-clause-blur {
  0%, 100% { filter: blur(2.5px); opacity: 0.72; }
  50% { filter: blur(5.5px); opacity: 0.95; }
}

@keyframes negotiate-clause-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

@keyframes negotiate-clause-reveal {
  0% { filter: blur(5px); opacity: 0.35; background: rgba(79, 91, 217, 0.22); }
  100% { filter: blur(0); opacity: 1; background: rgba(79, 91, 217, 0.12); }
}
`;
