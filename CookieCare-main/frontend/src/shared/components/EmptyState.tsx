import type { ElementType, ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface EmptyStateProps {
  icon: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Contained empty state — icon, title, optional description and CTA.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6",
        className
      )}
    >
      <Icon
        className="w-5 h-5 mb-3"
        style={{ color: "var(--color-text-disabled)" }}
        strokeWidth={1.5}
        aria-hidden
      />
      <p
        className="text-[length:var(--text-body)] font-semibold mb-1"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {title}
      </p>
      {description && (
        <p
          className="text-[length:var(--text-body-sm)] max-w-sm leading-relaxed"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
