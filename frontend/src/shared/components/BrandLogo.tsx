import { LORA_ICON_SRC, LORA_WORDMARK_RATIO, LORA_WORDMARK_SRC } from "./brandLogoAssets";

const SIZE_CONFIG = {
  sm: { icon: 32, wordmarkH: 22, tagline: 8, gap: 3 },
  md: { icon: 36, wordmarkH: 26, tagline: 9, gap: 4 },
  lg: { icon: 44, wordmarkH: 32, tagline: 10, gap: 5 },
  xl: { icon: 56, wordmarkH: 40, tagline: 11, gap: 6 },
} as const;

export type BrandLogoSize = keyof typeof SIZE_CONFIG;

interface BrandLogoProps {
  size?: BrandLogoSize;
  className?: string;
  iconOnly?: boolean;
  tagline?: string;
  wordmarkColor?: string;
  wordmarkClassName?: string;
}

/**
 * BrandLogo — canonical lora mark for light backgrounds.
 *
 * Both the icon and the wordmark stay mounted and are toggled with `display`,
 * so collapsing the sidebar never swaps an image source mid-render.
 */
export function BrandLogo({
  size = "md",
  className = "",
  iconOnly = false,
  tagline,
}: BrandLogoProps) {
  const cfg = SIZE_CONFIG[size];
  const wordmarkW = Math.round(cfg.wordmarkH * LORA_WORDMARK_RATIO);

  return (
    <>
      <img
        src={LORA_ICON_SRC}
        alt="lora"
        width={cfg.icon}
        height={cfg.icon}
        decoding="sync"
        className={`shrink-0 ${className}`}
        style={{ width: cfg.icon, height: cfg.icon, display: iconOnly ? "block" : "none" }}
      />

      <span
        className={`min-w-0 flex-col items-start ${className}`}
        style={{ display: iconOnly ? "none" : "inline-flex" }}
      >
        <img
          src={LORA_WORDMARK_SRC}
          alt="lora"
          width={wordmarkW}
          height={cfg.wordmarkH}
          decoding="sync"
          className="block max-w-full"
          style={{ width: wordmarkW, height: cfg.wordmarkH }}
        />
        {tagline && (
          <span
            className="lora-tagline"
            style={{ fontSize: cfg.tagline, marginTop: cfg.gap }}
          >
            {tagline}
          </span>
        )}
      </span>
    </>
  );
}
