// ─── LandingState ─────────────────────────────────────────────────────────────
// The hero empty state shown before any messages exist.
// Heading → Composer → quick-action chips.
// Light-surface version: all text/chip colours adapted for #F7F8FA background.

import { QUICK_ACTIONS } from "../constants";
import type { ComposerProps } from "./Composer";
import { Composer } from "./Composer";
import type { QuickAction } from "../types";

interface LandingStateProps {
  composerProps: Omit<ComposerProps, "placeholder">;
  onQuickAction: (action: QuickAction) => void;
}

export function LandingState({ composerProps, onQuickAction }: LandingStateProps) {
  const availableActions = QUICK_ACTIONS.filter((a) => a.available);

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center min-h-0 px-6 select-none"
      style={{ paddingBottom: "10vh" }}
    >
      {/* Hero heading */}
      <div className="text-center mb-10">
        <h1
          className="rt-rise-2 rt-hero-heading"
          style={{
            fontSize: "clamp(2.4rem, 5vw, 3.6rem)",
            fontWeight: 700,
            letterSpacing: "-0.045em",
            lineHeight: 1.04,
            color: "#111827",
          }}
        >
          How can I help
          <br />
          <span
            style={{
              color: "#6B7280",
              fontStyle: "italic",
              fontWeight: 300,
              letterSpacing: "-0.03em",
            }}
          >
            with legal today?
          </span>
        </h1>
      </div>

      {/* Composer — no bloom on light bg */}
      <div className="rt-rise-3 w-full mb-8">
        <Composer {...composerProps} />
      </div>

      {/* Quick-action chips */}
      <div
        className="rt-rise-4 flex flex-wrap items-center justify-center gap-2"
        style={{ maxWidth: 560 }}
      >
        {availableActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => onQuickAction(action)}
              className="rt-chip flex items-center gap-1.5 outline-none rounded-full"
              style={{
                color: "#6B7280",
                background: "rgba(0,0,0,0.035)",
                border: "1px solid rgba(0,0,0,0.08)",
                cursor: "pointer",
                padding: "5px 14px",
              }}
            >
              <Icon
                className="w-3 h-3 shrink-0"
                style={{ color: "#2175D9" }}
              />
              <span className="text-[12.5px]" style={{ fontWeight: 400 }}>
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
