import React from "react";
import { parseVaultTags } from "../utils";

interface TagChipsProps {
  tags: string;
  maxVisible?: number;
}

export function TagChips({ tags, maxVisible = 2 }: TagChipsProps) {
  const chips = parseVaultTags(tags);

  if (chips.length === 0) {
    return <span style={{ fontSize: 12, color: "var(--text-faint)" }}>—</span>;
  }

  const visible = chips.slice(0, maxVisible);
  const extra = chips.length - visible.length;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, maxWidth: 160 }}>
      {visible.map((chip) => (
        <span key={chip} className="vlt-tag" title={chip} style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
          {chip}
        </span>
      ))}
      {extra > 0 && (
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)" }}>
          +{extra}
        </span>
      )}
    </div>
  );
}
