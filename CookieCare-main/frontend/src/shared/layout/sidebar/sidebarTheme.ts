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
  border: "#F0F0F0",

  textPrimary: "#18181B",
  textSecondary: "#3F3F46",
  textMuted: "#A1A1AA",
  textFaint: "#C4C4C4",

  sectionLabel: "#A1A1AA",

  itemActive: "#F4F4F5",
  itemActiveText: "#18181B",
  itemActiveIcon: "#18181B",
  itemHover: "#FAFAFA",
  itemHoverText: "#18181B",

  searchBg: "#F4F4F5",
  searchBorder: "transparent",

  kbdBg: "#FFFFFF",
  kbdBorder: "#E4E4E7",
  kbdText: "#A1A1AA",
} as const;
