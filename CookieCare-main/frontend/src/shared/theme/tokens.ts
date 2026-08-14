/**
 * LORA design tokens — JS mirror of CSS custom properties in index.css.
 * Use for inline styles or programmatic access; prefer CSS variables in components.
 */

export const tokens = {
  font: {
    sans: "var(--font-sans)",
    mono: "var(--font-mono)",
  },

  text: {
    display: "var(--text-display)",
    h1: "var(--text-h1)",
    h2: "var(--text-h2)",
    h3: "var(--text-h3)",
    bodyLg: "var(--text-body-lg)",
    body: "var(--text-body)",
    bodySm: "var(--text-body-sm)",
    label: "var(--text-label)",
    caption: "var(--text-caption)",
  },

  color: {
    bgApp: "var(--color-bg-app)",
    bgPage: "var(--color-bg-page)",
    surface1: "var(--color-surface-1)",
    surface2: "var(--color-surface-2)",
    surface3: "var(--color-surface-3)",
    surface4: "var(--color-surface-4)",
    border: "var(--color-border)",
    borderSubtle: "var(--color-border-subtle)",
    borderStrong: "var(--color-border-strong)",
    textPrimary: "var(--color-text-primary)",
    textSecondary: "var(--color-text-secondary)",
    textTertiary: "var(--color-text-tertiary)",
    textDisabled: "var(--color-text-disabled)",
    textInverse: "var(--color-text-inverse)",
    brand: "var(--color-brand)",
    brandHover: "var(--color-brand-hover)",
    brandActive: "var(--color-brand-active)",
    brandSubtle: "var(--color-brand-subtle)",
    brandText: "var(--color-brand-text)",
    success: "var(--color-success)",
    successSubtle: "var(--color-success-subtle)",
    successText: "var(--color-success-text)",
    warning: "var(--color-warning)",
    warningSubtle: "var(--color-warning-subtle)",
    warningText: "var(--color-warning-text)",
    danger: "var(--color-danger)",
    dangerSubtle: "var(--color-danger-subtle)",
    dangerText: "var(--color-danger-text)",
    neutral: "var(--color-neutral)",
    neutralSubtle: "var(--color-neutral-subtle)",
    neutralText: "var(--color-neutral-text)",
  },

  space: {
    1: "var(--space-1)",
    2: "var(--space-2)",
    3: "var(--space-3)",
    4: "var(--space-4)",
    5: "var(--space-5)",
    6: "var(--space-6)",
    7: "var(--space-7)",
    8: "var(--space-8)",
    10: "var(--space-10)",
    12: "var(--space-12)",
    16: "var(--space-16)",
  },

  radius: {
    sm: "var(--radius-sm)",
    md: "var(--radius-md)",
    lg: "var(--radius-lg)",
    xl: "var(--radius-xl)",
    "2xl": "var(--radius-2xl)",
    full: "var(--radius-full)",
  },

  shadow: {
    none: "var(--shadow-none)",
    xs: "var(--shadow-xs)",
    sm: "var(--shadow-sm)",
    md: "var(--shadow-md)",
    lg: "var(--shadow-lg)",
    xl: "var(--shadow-xl)",
  },

  layout: {
    sidebarWidth: "var(--sidebar-width)",
    sidebarWidthCollapsed: "var(--sidebar-width-collapsed)",
    topnavHeight: "var(--topnav-height)",
  },
} as const;
