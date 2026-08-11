import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export type PageShellWidth = "narrow" | "standard" | "wide" | "full";

const widthClass: Record<PageShellWidth, string> = {
  narrow: "max-w-3xl",
  standard: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

export interface PageShellProps {
  children: ReactNode;
  /** Content max-width preset @default "standard" */
  width?: PageShellWidth;
  className?: string;
  /** Skip horizontal centering wrapper (e.g. full-bleed editors) */
  fullBleed?: boolean;
}

/**
 * Scrollable page container with consistent padding and max-width.
 */
export function PageShell({
  children,
  width = "standard",
  className,
  fullBleed = false,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto min-h-0",
        className
      )}
      style={{ background: "var(--color-bg-app)" }}
    >
      <div
        className={cn(
          "px-8 py-7 w-full",
          !fullBleed && "mx-auto",
          !fullBleed && widthClass[width]
        )}
      >
        {children}
      </div>
    </div>
  );
}
