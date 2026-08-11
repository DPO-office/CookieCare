/** Scoped dashboard styles — warm workspace surfaces, injected once in DashboardHome. */
export const DASHBOARD_STYLES = `
.dashboard-root {
  --dash-warm-bg: #F6F4F0;
  --dash-warm-border: #E8E3DA;
  --dash-warm-text: #5C5348;
  --dash-pill-bg: #EEF4FC;
  --dash-pill-border: #D6E6F8;
  --dash-pill-hover: #E3EEF9;
}

.dashboard-welcome {
  background: var(--dash-warm-bg);
  border: 1px solid var(--dash-warm-border);
  border-radius: var(--radius-xl);
}

.dashboard-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-full);
  font-size: var(--text-body-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--dash-pill-bg);
  border: 1px solid var(--dash-pill-border);
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
  white-space: nowrap;
}
.dashboard-pill:hover {
  background: var(--dash-pill-hover);
  border-color: var(--color-brand);
  color: var(--color-brand-text);
}
.dashboard-pill svg {
  color: var(--color-brand);
  flex-shrink: 0;
}

.dashboard-metric-card {
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  padding: 1rem 1.125rem;
  min-height: 5.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.dashboard-section-card {
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
}

.dashboard-activity-row {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid var(--color-border-subtle);
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
  background: var(--color-surface-2);
}

.dashboard-icon-tile {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--color-brand-subtle);
  color: var(--color-brand);
}
`;
