export type SettingsSection =
  | "general"
  | "privacy"
  | "security"
  | "ai"
  | "notifications"
  | "workspace"
  | "advanced";

export interface SettingsProps {
  user: { name: string; email: string } | null;
}
