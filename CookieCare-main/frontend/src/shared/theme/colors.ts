/**
 * RandTrust Brand Color System
 * 
 * Central source of truth for all brand colors across the application.
 * To update the primary brand color, only change PRIMARY_BRAND below.
 */

// ·· Primary Brand Color ······················································
export const PRIMARY_BRAND = "#2175D9";

// ·· Derived Shades ···························································
// Hover state (approximately 8-12% darker)
export const PRIMARY_BRAND_HOVER = "#1D66C2";

// Active/pressed state (approximately 15-20% darker)
export const PRIMARY_BRAND_ACTIVE = "#1956A7";

// Light tint for backgrounds (keeping existing light blue)
export const PRIMARY_BRAND_LIGHT = "#EBF4FD";

// ·· CSS Custom Properties ····················································
// Export as a single object for easy CSS variable injection
export const brandColors = {
  "--brand-primary": PRIMARY_BRAND,
  "--brand-primary-hover": PRIMARY_BRAND_HOVER,
  "--brand-primary-active": PRIMARY_BRAND_ACTIVE,
  "--brand-primary-light": PRIMARY_BRAND_LIGHT,
} as const;

// ·· Tailwind-compatible exports ··············································
export const tailwindBrandColors = {
  "brand-primary": PRIMARY_BRAND,
  "brand-primary-hover": PRIMARY_BRAND_HOVER,
  "brand-primary-active": PRIMARY_BRAND_ACTIVE,
  "brand-primary-light": PRIMARY_BRAND_LIGHT,
};
