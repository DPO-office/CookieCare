export const COMPARE_PAGE_STYLES = `
.compare-page {
  font-family: var(--font-sans);
}

.compare-drop-zone {
  transition: box-shadow 180ms ease, background 180ms ease;
}

.compare-drop-zone:hover:not(.has-file) {
  background: #FAFBFF;
}

.compare-drop-zone.dragging {
  background: #EEF2FF;
}

.compare-btn {
  transition: opacity 150ms ease, transform 120ms ease;
}
.compare-btn:not(:disabled):hover {
  opacity: 0.92;
}
.compare-btn:not(:disabled):active {
  transform: scale(0.99);
}
`;
