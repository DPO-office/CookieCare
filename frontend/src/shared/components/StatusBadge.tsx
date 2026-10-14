import { cn } from "../../lib/utils";

export type StatusBadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "brand";

const variantStyles: Record<StatusBadgeVariant, { bg: string; text: string }> = {
  success: {
    bg: "var(--color-success-subtle)",
    text: "var(--color-success-text)",
  },
  warning: {
    bg: "var(--color-warning-subtle)",
    text: "var(--color-warning-text)",
  },
  danger: {
    bg: "var(--color-danger-subtle)",
    text: "var(--color-danger-text)",
  },
  neutral: {
    bg: "var(--color-surface-3)",
    text: "var(--color-text-tertiary)",
  },
  brand: {
    bg: "var(--color-brand-subtle)",
    text: "var(--color-brand-text)",
  },
};

export interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: StatusBadgeVariant;
  className?: string;
}

/**
 * Semantic status chip — use for scores, risk levels, and workflow states.
 */
export function StatusBadge({
  children,
  variant = "neutral",
  className,
}: StatusBadgeProps) {
  const { bg, text } = variantStyles[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold leading-none",
        className
      )}
      style={{
        background: bg,
        color: text,
        borderRadius: "var(--radius-sm)",
      }}
    >
      {children}
    </span>
  );
}

/** Map a 0–100 score to the standard success / warning / danger variant. */
export function scoreVariant(score: number): StatusBadgeVariant {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}
