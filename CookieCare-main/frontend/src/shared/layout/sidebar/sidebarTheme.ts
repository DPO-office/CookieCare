// ─── Sidebar Theme Tokens ─────────────────────────────────────────────────────

export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const SIDEBAR_WIDTH = "var(--sidebar-width)";
export const SIDEBAR_WIDTH_ICON = "var(--sidebar-width-icon)";
export const SIDEBAR_KEYBOARD_SHORTCUT = "b";

export const DARK = {
  groupLabel: "rgba(255,255,255,0.25)",
} as const;

export const THEME = {
  bg: "#FFFFFF",
  border: "rgba(16,24,40,0.06)",
  hairline: "0 1px 2px rgba(16,24,40,0.04), 0 12px 32px rgba(16,24,40,0.05), 0 0 0 1px rgba(16,24,40,0.05)",

  textPrimary: "#1a1a1a",
  textSecondary: "#667085",
  textMuted: "#98A2B3",
  textFaint: "#98A2B3",

  sectionLabel: "#98A2B3",

  itemIdle: "#344054",
  itemIdleIcon: "#98A2B3",
  itemActive: "linear-gradient(to bottom, #8e98ff, #606beb)",
  itemActiveShadow: "0 1px 2px rgba(96,107,235,0.28), 0 6px 16px rgba(96,107,235,0.18)",
  itemActiveText: "#FFFFFF",
  itemActiveIcon: "#FFFFFF",
  itemHover: "#F7F8FB",
  itemHoverText: "#1a1a1a",

  well: "#EEF2FF",
  wellInk: "#4F5BD9",

  searchBg: "#F7F8FB",
  searchBorder: "transparent",

  kbdBg: "#FFFFFF",
  kbdBorder: "#E5E7EB",
  kbdText: "#98A2B3",
} as const;
