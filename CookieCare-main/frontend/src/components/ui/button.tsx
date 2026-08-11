import * as React from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "btn-primary border-0 shadow-none",
  secondary: "btn-secondary",
  ghost:
    "bg-transparent border-transparent hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]",
  outline:
    "bg-transparent border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:border-[var(--color-border-strong)]",
  destructive:
    "bg-[var(--color-danger)] text-white border-0 hover:opacity-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12px]",
  md: "h-9 px-4 text-[13px]",
  lg: "h-10 px-5 text-[14px]",
  icon: "h-9 w-9 p-0",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => {
    const usesUtility = variant === "primary" || variant === "secondary";

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap",
          "rounded-[var(--radius-md)] transition-colors duration-100 outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          !usesUtility && variantClasses[variant],
          usesUtility && variantClasses[variant],
          !usesUtility && sizeClasses[size],
          usesUtility && size === "sm" && "h-8 px-3 text-[12px]",
          usesUtility && size === "lg" && "h-10 px-5 text-[14px]",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
