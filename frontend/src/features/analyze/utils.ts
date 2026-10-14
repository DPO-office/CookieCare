import React, { useMemo, useSyncExternalStore } from "react";
import { markdownToHtml } from "../../shared/utils/markdownToHtml";
import type { StreamingStore } from "./streamingStore";

export function parseBoldText(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return React.createElement("strong", { key: i, className: "font-semibold text-gray-900" }, part);
    }
    return part;
  });
}

export const ReportMessageContent = React.memo(function ReportMessageContent({
  text,
}: {
  text: string;
}) {
  const html = useMemo(() => markdownToHtml(text), [text]);
  return React.createElement("div", {
    className: "md-content",
    dangerouslySetInnerHTML: { __html: html },
  });
});

/**
 * Live stream text — subscribes to the external store and renders the
 * markdown AS IT ARRIVES (headings, bold, lists, tables), instead of showing
 * raw `##`/`**`/`|` source until the stream completes and then snapping to
 * formatted output. markdown-it is fast and its result is memoised per text,
 * and React 18 coalesces the store's token notifications to ~one render per
 * frame, so this stays cheap. Partial markdown (an unclosed bold, a half-
 * written table) simply renders as more text arrives — the same brief settle
 * every streaming markdown UI has, and far better than a wall of source.
 */
export function StreamingPlainText({ store }: { store: StreamingStore }) {
  const text = useSyncExternalStore(store.subscribe, store.getText, store.getText);
  const html = useMemo(() => markdownToHtml(text), [text]);
  return React.createElement("div", {
    className: "md-content",
    dangerouslySetInnerHTML: { __html: html },
  });
}

export function renderContentText(text: string): React.ReactElement {
  return React.createElement(ReportMessageContent, { text });
}
