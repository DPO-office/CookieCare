import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Primary action aligned to the right of the header row */
  action?: ReactNode;
  className?: string;
}

/**
 * Standard page title block — dark primary title, tertiary subtitle.
 * Use on feature pages in Phase 2+; available now as the foundation primitive.
 */
export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h1
          className="text-[length:var(--text-h1)] font-bold tracking-tight leading-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="mt-1 text-[length:var(--text-body-sm)] leading-relaxed max-w-2xl"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
