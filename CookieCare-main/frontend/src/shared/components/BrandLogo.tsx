const WORDMARK_SRC = "/images/logo/lora-wordmark.png";
const ICON_SRC = "/images/logo/favicon.png";

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
 */
export function BrandLogo({
  size = "md",
  className = "",
  iconOnly = false,
  tagline,
}: BrandLogoProps) {
  const cfg = SIZE_CONFIG[size];

  if (iconOnly) {
    return (
      <img
        src={ICON_SRC}
        alt="lora"
        width={cfg.icon}
        height={cfg.icon}
        className={`shrink-0 ${className}`}
        style={{ width: cfg.icon, height: cfg.icon }}
      />
    );
  }

  return (
    <div className={`inline-flex min-w-0 flex-col items-start ${className}`}>
      <img
        src={WORDMARK_SRC}
        alt="lora"
        className="block w-auto max-w-full"
        style={{ height: cfg.wordmarkH }}
      />
      {tagline && (
        <p className="lora-tagline" style={{ fontSize: cfg.tagline, marginTop: cfg.gap }}>
          {tagline}
        </p>
      )}
    </div>
  );
}
