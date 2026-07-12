import React from "react";
import { User, Shield, Lock, Sparkles, Bell, Layers, Zap } from "lucide-react";
import { SettingsSection } from "./types";

export const NAV_ITEMS: { id: SettingsSection; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "general",       label: "General",          icon: User,     desc: "Profile & display preferences" },
  { id: "privacy",       label: "Privacy",          icon: Shield,   desc: "Data handling & compliance scope" },
  { id: "security",      label: "Security",         icon: Lock,     desc: "Authentication & access control" },
  { id: "ai",            label: "AI Configuration", icon: Sparkles, desc: "Models, prompts & behaviour" },
  { id: "notifications", label: "Notifications",    icon: Bell,     desc: "Alerts, digests & webhooks" },
  { id: "workspace",     label: "Workspace",        icon: Layers,   desc: "Team, billing & integrations" },
  { id: "advanced",      label: "Advanced",         icon: Zap,      desc: "Developer tools & system health" },
];

export const AI_MODELS = [
  { value: "openai/gpt-4o",               label: "GPT-4o",           badge: "Recommended" },
  { value: "openai/gpt-4o-mini",          label: "GPT-4o Mini",      badge: "Fast" },
  { value: "anthropic/claude-3-5-sonnet", label: "Claude 3.5 Sonnet",badge: "High quality" },
  { value: "anthropic/claude-3-haiku",    label: "Claude 3 Haiku",   badge: "Low cost" },
  { value: "google/gemini-pro-1.5",       label: "Gemini Pro 1.5",   badge: "" },
  { value: "meta-llama/llama-3.1-70b",    label: "Llama 3.1 70B",    badge: "Open source" },
];
