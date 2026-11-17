import {
  CONTROL_CENTRE_LOGO_SRC,
  CONTROL_CENTRE_WORDMARK_RATIO,
  LORA_ICON_SRC,
} from "./brandLogoAssets";

const SIZE_CONFIG = {
  sm: { icon: 30, wordmarkH: 13.5, tagline: 8, gap: 3 },
  md: { icon: 36, wordmarkH: 16, tagline: 8.5, gap: 3.5 },
  lg: { icon: 44, wordmarkH: 20, tagline: 9.5, gap: 4 },
  xl: { icon: 56, wordmarkH: 25, tagline: 11, gap: 5 },
} as const;

export type BrandLogoSize = keyof typeof SIZE_CONFIG;

interface BrandLogoProps {
  size?: BrandLogoSize;
  className?: string;
  iconOnly?: boolean;
  showIcon?: boolean;
  tagline?: string;
  wordmarkColor?: string;
  wordmarkClassName?: string;
}

/**
 * BrandLogo — canonical Control Centre mark for light backgrounds.
 *
 * Both the icon and the brand block stay mounted and are toggled with `display`,
 * so collapsing the sidebar never swaps an image source mid-render.
 */
export function BrandLogo({
  size = "md",
  className = "",
  iconOnly = false,
  showIcon = true,
  tagline = "One view . Every Risk",
}: BrandLogoProps) {
  const cfg = SIZE_CONFIG[size];
  const wordmarkW = Math.round(cfg.wordmarkH * CONTROL_CENTRE_WORDMARK_RATIO);

  return (
    <>
      <img
        src={LORA_ICON_SRC}
        alt="Control Centre"
        width={cfg.icon}
        height={cfg.icon}
        decoding="sync"
        className={`shrink-0 ${className}`}
        style={{ width: cfg.icon, height: cfg.icon, display: iconOnly ? "block" : "none" }}
      />

      <span
        className={`min-w-0 items-center gap-2.5 ${className}`}
        style={{ display: iconOnly ? "none" : "inline-flex" }}
      >
        {showIcon && (
          <img
            src={LORA_ICON_SRC}
            alt="Control Centre"
            width={cfg.icon}
            height={cfg.icon}
            decoding="sync"
            className="shrink-0"
            style={{ width: cfg.icon, height: cfg.icon }}
          />
        )}
        <span className="flex flex-col items-start justify-center min-w-0 leading-none">
          <img
            src={CONTROL_CENTRE_LOGO_SRC}
            alt="Control Centre"
            width={wordmarkW}
            height={cfg.wordmarkH}
            decoding="sync"
            className="block w-auto max-w-full select-none"
            style={{
              height: cfg.wordmarkH,
              aspectRatio: `${CONTROL_CENTRE_WORDMARK_RATIO}`,
            }}
          />
          {tagline && (
            <span
              className="lora-tagline"
              style={{ fontSize: cfg.tagline, marginTop: cfg.gap, letterSpacing: "0.04em" }}
            >
              {tagline}
            </span>
          )}
        </span>
      </span>
    </>
  );
}
