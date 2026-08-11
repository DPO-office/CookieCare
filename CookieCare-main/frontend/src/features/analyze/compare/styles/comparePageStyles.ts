export const COMPARE_PAGE_STYLES = `
.compare-page {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: #FFFFFF;
}

.compare-drop-container {
  border: 1px solid #E5E5E5;
  border-radius: 16px;
  background: #FFFFFF;
  overflow: hidden;
}

.compare-drop-zone {
  transition: background 150ms ease;
}
.compare-drop-zone:hover {
  background: #FAFAFA;
}
.compare-drop-zone.dragging {
  background: #F5F5F5;
}

.compare-divider {
  width: 1px;
  background: #EBEBEB;
  align-self: stretch;
}

.compare-btn {
  transition: background 150ms ease, color 150ms ease, transform 120ms ease;
}
.compare-btn:not(:disabled):hover {
  background: #18181B !important;
  color: #FFFFFF !important;
}
.compare-btn:not(:disabled):active {
  transform: scale(0.99);
}
`;
