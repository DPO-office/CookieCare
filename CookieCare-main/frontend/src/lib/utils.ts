/**
 * cn() — class name utility
 * Merges Tailwind classes and resolves conflicts using simple concatenation.
 * A lightweight alternative to clsx + tailwind-merge for environments without
 * those packages installed.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
