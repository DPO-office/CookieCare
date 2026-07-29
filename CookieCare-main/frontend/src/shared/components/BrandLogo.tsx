import { ShieldCheck } from "lucide-react";
import { PRIMARY_BRAND, PRIMARY_BRAND_LIGHT } from "../theme/colors";

// ·· Size config ···············////////////////////////////////////////////////
// Each size drives the icon container, icon itself, and text in tandem so the
// logo always looks proportional regardless of where it is used.
const SIZE_CONFIG = {
  sm: {
    container: "w-8 h-8 rounded-lg",
    icon: "w-4 h-4",
    text: "text-[14px]",
    gap: "gap-2.5",
  },
  md: {
    container: "w-9 h-9 rounded-xl",
    icon: "w-[18px] h-[18px]",
    text: "text-[16px]",
    gap: "gap-3",
  },
  lg: {
    container: "w-11 h-11 rounded-2xl",
    icon: "w-[22px] h-[22px]",
    text: "text-[20px]",
    gap: "gap-4",
  },
} as const;

export type BrandLogoSize = keyof typeof SIZE_CONFIG;

interface BrandLogoProps {
  /** Controls the overall scale of the logo. Defaults to "md". */
  size?: BrandLogoSize;
  /** Extra Tailwind classes applied to the outermost wrapper element. */
  className?: string;
  /** When true, only the shield icon is rendered (no text). */
  iconOnly?: boolean;
}

/**
 * BrandLogo — canonical RandTrust logo.
 *
 * Use this everywhere the brand needs to appear: sidebar, auth pages, etc.
 * Only the `size` prop may differ between contexts. Do NOT create separate
 * hand-rolled variants of this logo.
 *
 * @example
 *   <BrandLogo size="lg" />          // auth / landing pages
 *   <BrandLogo size="md" />          // sidebar (expanded)
 *   <BrandLogo size="sm" iconOnly /> // sidebar (collapsed)
 */
export function BrandLogo({ size = "md", className = "", iconOnly = false }: BrandLogoProps) {
  const cfg = SIZE_CONFIG[size];

  return (
    <div className={`flex items-center ${cfg.gap} ${className}`}>
      {/* Shield icon container */}
      <div
        className={`${cfg.container} flex items-center justify-center shrink-0 shadow-sm`}
        style={{ background: PRIMARY_BRAND_LIGHT }}
      >
        <ShieldCheck className={cfg.icon} style={{ color: PRIMARY_BRAND }} />
      </div>

      {/* Brand name — hidden when iconOnly */}
      {!iconOnly && (
        <span
          className={`${cfg.text} font-bold tracking-tight leading-none`}
          style={{ color: PRIMARY_BRAND }}
        >
          randtrust
        </span>
      )}
    </div>
  );
}
