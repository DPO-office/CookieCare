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
        <header className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {overline && (
              <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
                {overline}
              </p>
            )}
            {title && (
              <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.02em] text-[#1a1a1a]">
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
