export type SettingsSection =
  | "general"
  | "privacy"
  | "security"
  | "ai"
  | "notifications"
  | "workspace"
  | "advanced";

export interface SettingsProps {
  /** @deprecated Read from AppContext */
  user?: { name: string; email: string } | null;
}
