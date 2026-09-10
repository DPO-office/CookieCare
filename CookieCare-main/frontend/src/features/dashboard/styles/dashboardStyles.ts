/** Scoped dashboard styles — aligned with DPA / vendor / ethics results. */
export const DASHBOARD_STYLES = `
.dashboard-root {
  --dash-hairline: 0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06);
  --dash-ink: #1a1a1a;
  --dash-muted: #667085;
  --dash-label: #98A2B3;
  --dash-well: #EEF2FF;
  --dash-well-ink: #4F5BD9;
  --dash-tile: #F7F8FB;
}

.dashboard-hero,
.dashboard-section-card,
.dashboard-metric-wrap {
  background: #fff;
  border-radius: 24px;
  box-shadow: var(--dash-hairline);
}

.dashboard-section-card {
  border-radius: 22px;
  overflow: hidden;
}

.dashboard-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 500;
  color: #344054;
  background: #fff;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
  white-space: nowrap;
}
.dashboard-pill:hover {
  background: var(--color-light-blue-100, #f0f4ff);
  border-color: #d0d5dd;
  color: var(--dash-ink);
}
.dashboard-pill svg {
  color: var(--dash-well-ink);
  flex-shrink: 0;
}

.dashboard-metric-tile {
  background: var(--dash-tile);
  border-radius: 16px;
  padding: 1rem 1.125rem;
  min-height: 5.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.dashboard-activity-row {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid rgba(16,24,40,0.06);
  transition: background 120ms ease;
  cursor: pointer;
  text-align: left;
  width: 100%;
  background: transparent;
  border-left: none;
  border-right: none;
  border-top: none;
}
.dashboard-activity-row:last-child {
  border-bottom: none;
}
.dashboard-activity-row:hover {
  background: var(--dash-tile);
}

.dashboard-icon-tile {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--dash-well);
  color: var(--dash-well-ink);
}

.dashboard-progress-track {
  width: 100%;
  height: 4px;
  border-radius: 9999px;
  background: #EEF0F4;
  overflow: hidden;
}
.dashboard-progress-fill {
  height: 100%;
  border-radius: 9999px;
  background: #4F5BD9;
  transition: width 400ms ease;
}
`;
