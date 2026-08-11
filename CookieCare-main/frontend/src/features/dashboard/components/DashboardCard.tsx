import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

interface DashboardCardProps {
  overline?: string;
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}

export function DashboardCard({
  overline,
  title,
  action,
  children,
  className,
  bodyClassName,
  noPadding,
}: DashboardCardProps) {
  const hasHeader = overline || title || action;

  return (
    <section className={cn("dashboard-section-card", className)}>
      {hasHeader && (
        <header
          className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6 border-b border-[var(--color-border-subtle)]"
        >
          <div className="min-w-0">
            {overline && (
              <p
                className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {overline}
              </p>
            )}
            {title && (
              <h2
                className="text-[length:var(--text-h2)] font-semibold tracking-tight leading-tight"
                style={{ color: "var(--color-text-primary)" }}
              >
                {title}
              </h2>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn(!noPadding && "px-0", bodyClassName)}>{children}</div>
    </section>
  );
}
