import * as React from "react";
import { cn } from "../../lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-24 w-full resize-y rounded-[var(--radius-md)]",
          "border border-[var(--color-border)] bg-[var(--color-surface-1)]",
          "px-3.5 py-2.5 text-[length:var(--text-body)] text-[var(--color-text-primary)]",
          "placeholder:text-[var(--color-text-tertiary)]",
          "transition-colors duration-100",
          "hover:border-[var(--color-border-strong)]",
          "focus-visible:border-[var(--color-brand)] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--color-brand)_20%,transparent)]",
          "disabled:cursor-not-allowed disabled:bg-[var(--color-surface-4)] disabled:opacity-60",
          "outline-none",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
