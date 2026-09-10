export const INVENTORY_FORM_STYLES = `
.inv-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  background: #FAFBFC;
  border: 1px solid #E4E4E7;
  border-radius: 14px;
  padding: 10px 14px;
  font-size: 13.5px;
  font-family: inherit;
  color: #1a1a1a;
  text-align: left;
  cursor: pointer;
  box-shadow: none;
  transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
}
.inv-control.is-open,
.inv-control:focus-visible {
  background: #FFFFFF;
  border-color: #8e98ff;
  box-shadow: 0 0 0 3px rgba(142, 152, 255, 0.18);
}

.inv-menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 6px;
  list-style: none;
  background: #FFFFFF;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 16px 40px rgba(16,24,40,0.12), 0 0 0 1px rgba(16,24,40,0.06);
  overflow: hidden;
}

.inv-option {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  color: #344054;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.inv-option:hover { background: #F7F8FB; color: #1a1a1a; }
.inv-option.is-active {
  background: #EEF2FF;
  color: #4F5BD9;
  font-weight: 600;
}

.inv-cal {
  position: absolute;
  z-index: 40;
  top: calc(100% + 6px);
  right: 0;
  width: 280px;
  padding: 14px;
  background: #FFFFFF;
  border-radius: 18px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 16px 40px rgba(16,24,40,0.12), 0 0 0 1px rgba(16,24,40,0.06);
}

.inv-cal-nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: #F7F8FB;
  color: #667085;
  cursor: pointer;
}
.inv-cal-nav:hover { background: #EEF2FF; color: #4F5BD9; }

.inv-cal-day {
  height: 32px;
  border: none;
  border-radius: 999px;
  background: transparent;
  font-size: 12.5px;
  font-family: inherit;
  color: #1a1a1a;
  cursor: pointer;
}
.inv-cal-day.is-muted { color: #D0D5DD; }
.inv-cal-day:hover:not(.is-selected) { background: #F7F8FB; }
.inv-cal-day.is-today { box-shadow: inset 0 0 0 1px #C7CCF5; }
.inv-cal-day.is-selected {
  background: linear-gradient(to bottom, #8e98ff, #606beb);
  color: #FFFFFF;
  font-weight: 600;
}

.inv-chip {
  border: none;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  background: #F7F8FB;
  color: #667085;
  box-shadow: inset 0 0 0 1px rgba(16,24,40,0.04);
  transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
}
.inv-chip:hover { background: #EEF2FF; color: #4F5BD9; }
.inv-chip.is-on {
  background: #EEF2FF;
  color: #4F5BD9;
  box-shadow: inset 0 0 0 1px rgba(79,91,217,0.22);
}

.inv-textarea {
  min-height: 92px;
  resize: none;
  line-height: 1.55;
}

.inv-modal .vlt-input {
  background: #FAFBFC;
  border: 1px solid #E4E4E7;
  box-shadow: none;
}
.inv-modal .vlt-input:focus {
  background: #FFFFFF;
  border-color: #8e98ff;
  box-shadow: 0 0 0 3px rgba(142, 152, 255, 0.18);
}
.inv-modal .vlt-input::placeholder,
.inv-modal .vlt-input::-webkit-input-placeholder {
  color: #C5CAD3;
  opacity: 1;
}

.vlt-overlay.inv-overlay {
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(10px);
}

.vlt-modal.inv-modal {
  overflow: visible;
  border-radius: 24px;
  background: #FFFFFF;
  border: 1px solid rgba(16, 24, 40, 0.10);
  box-shadow:
    0 1px 1px rgba(16, 24, 40, 0.04),
    0 8px 16px rgba(16, 24, 40, 0.06),
    0 24px 48px rgba(16, 24, 40, 0.12),
    0 0 0 1px rgba(142, 152, 255, 0.18);
}
`;
