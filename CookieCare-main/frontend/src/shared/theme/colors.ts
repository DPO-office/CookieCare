/**
 * LORA Brand Color System
 *
 * Central source of truth for brand colors. Structural tokens live in index.css;
 * import from here when you need the raw hex in JS (charts, PDF, etc.).
 */

export const PRIMARY_BRAND = "#2175D9";
export const PRIMARY_BRAND_HOVER = "#1D66C2";
export const PRIMARY_BRAND_ACTIVE = "#1956A7";
export const PRIMARY_BRAND_LIGHT = "#EBF2FD";

export const brandColors = {
  "--brand-primary": PRIMARY_BRAND,
  "--brand-primary-hover": PRIMARY_BRAND_HOVER,
  "--brand-primary-active": PRIMARY_BRAND_ACTIVE,
  "--brand-primary-light": PRIMARY_BRAND_LIGHT,
} as const;

export const tailwindBrandColors = {
  "brand-primary": PRIMARY_BRAND,
  "brand-primary-hover": PRIMARY_BRAND_HOVER,
  "brand-primary-active": PRIMARY_BRAND_ACTIVE,
  "brand-primary-light": PRIMARY_BRAND_LIGHT,
};
