/**
 * VaultScopeSelector
 *
 * A reusable Private / Organisation segmented control for Vault sections.
 * Designed to be placed near the section heading so users immediately understand
 * which resource library they're viewing.
 *
 * Usage:
 *   <VaultScopeSelector
 *     scope={templateScope}
 *     onScopeChange={setTemplateScope}
 *     privateCount={3}
 *     orgCount={12}
 *   />
 *
 * Both `privateCount` and `orgCount` are optional — omit them when the
 * count is not yet known (e.g. during initial load).
 */

import React from "react";
import { LibraryItemSource } from "../types";

export interface VaultScopeSelectorProps {
  /** Currently active scope. Pass "all" (or omit) to show both buttons as inactive. */
  scope: LibraryItemSource | "all";
  onScopeChange: (scope: LibraryItemSource) => void;
  privateCount?: number;
  orgCount?: number;
  /** Additional class names applied to the outer wrapper. */
  className?: string;
}

interface TabButtonProps {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}

function TabButton({ label, count, isActive, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: isActive ? 600 : 500,
        fontFamily: "inherit",
        letterSpacing: "-0.01em",
        // Active: solid dark pill (matches .vlt-tab.active)
        // Inactive: transparent with muted text
        background: isActive ? "#111827" : "transparent",
        color: isActive ? "#FFFFFF" : "#667085",
        transition: "background 160ms ease, color 160ms ease",
        // Prevent layout shift when font-weight changes
        WebkitFontSmoothing: "antialiased",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background = "#EEF2FF";
          (e.currentTarget as HTMLButtonElement).style.color = "#4F5BD9";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "#667085";
        }
      }}
    >
      {label}
      {count !== undefined && (
        <span
          style={{
            display: "inline-block",
            padding: "1px 7px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            // Active badge: semi-transparent white on dark pill
            // Inactive badge: indigo tint on light background
            background: isActive ? "rgba(255,255,255,0.18)" : "#EEF2FF",
            color: isActive ? "#FFFFFF" : "#4F5BD9",
            lineHeight: "1.6",
            minWidth: 20,
            textAlign: "center",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function VaultScopeSelector({
  scope,
  onScopeChange,
  privateCount,
  orgCount,
  className,
}: VaultScopeSelectorProps) {
  return (
    <div
      className={className}
      role="group"
      aria-label="Resource scope"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: "3px",
        borderRadius: 999,
        // Subtle inset track — same visual language as the main tab bar
        background: "#F7F8FB",
        boxShadow: "inset 0 0 0 1px rgba(16,24,40,0.06)",
      }}
    >
      <TabButton
        label="Private"
        count={privateCount}
        isActive={scope === "private"}
        onClick={() => onScopeChange("private")}
      />
      <TabButton
        label="Organisation"
        count={orgCount}
        isActive={scope === "org"}
        onClick={() => onScopeChange("org")}
      />
    </div>
  );
}
