import { ShieldCheck } from "lucide-react";

// ·· Size config ···············////////////////////////////////////////////////
// Each size drives the icon container, icon itself, and text in tandem so the
// logo always looks proportional regardless of where it is used.
const SIZE_CONFIG = {
  sm: {
    container: "w-8 h-8 rounded-full",
    icon: "w-4 h-4",
    fontSize: 15,
    gap: "gap-2.5",
  },
  md: {
    container: "w-9 h-9 rounded-full",
    icon: "w-[18px] h-[18px]",
    fontSize: 16,
    gap: "gap-3",
  },
  lg: {
    container: "w-11 h-11 rounded-full",
    icon: "w-[22px] h-[22px]",
    fontSize: 20,
    gap: "gap-4",
  },
  xl: {
    container: "w-14 h-14 rounded-full",
    icon: "w-[28px] h-[28px]",
    fontSize: 28,
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
  /** Optional line under the wordmark (e.g. sidebar product descriptor). */
  tagline?: string;
  /** Wordmark color. Defaults to #1a1a1a. */
  wordmarkColor?: string;
  /** Extra classes on the LORA wordmark (e.g. to force color). */
  wordmarkClassName?: string;
}

/**
 * BrandLogo — canonical LORA logo.
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
export function BrandLogo({
  size = "md",
  className = "",
  iconOnly = false,
  tagline,
  wordmarkColor = "#1a1a1a",
  wordmarkClassName = "",
}: BrandLogoProps) {
  const cfg = SIZE_CONFIG[size];

  return (
    <div className={`flex ${tagline ? "items-start" : "items-center"} ${cfg.gap} ${className}`}>
      <div
        className={`${cfg.container} flex items-center justify-center shrink-0`}
        style={{ background: "#EEF2FF" }}
      >
        <ShieldCheck className={cfg.icon} style={{ color: "#4F5BD9" }} />
      </div>

      {!iconOnly && (
        <div className={`min-w-0 ${tagline ? "pt-0.5" : ""} transition-opacity duration-200 ease-out group-data-[state=collapsed]:pointer-events-none group-data-[state=collapsed]:opacity-0`}>
          <span
            className={`lora-wordmark ${wordmarkClassName} block tracking-[-0.03em] leading-none`}
            style={{
              fontSize: cfg.fontSize,
              fontWeight: 600,
              color: wordmarkColor,
              WebkitTextFillColor: wordmarkColor,
              forcedColorAdjust: "none",
            }}
          >
            LORA
          </span>
          {tagline && (
            <p
              className="m-0 mt-1.5 text-[9px] font-semibold uppercase leading-[1.4] tracking-[0.08em]"
              style={{ color: "#98A2B3" }}
            >
              {tagline}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
