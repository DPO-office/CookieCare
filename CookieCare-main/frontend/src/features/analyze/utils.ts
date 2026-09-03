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

/** Live stream text — subscribes to external store, no React state per token. */
export function StreamingPlainText({ store }: { store: StreamingStore }) {
  const text = useSyncExternalStore(store.subscribe, store.getText, store.getText);
  return React.createElement("div", { className: "md-content md-content--plain-stream" }, text);
}

export function renderContentText(text: string): React.ReactElement {
  return React.createElement(ReportMessageContent, { text });
}
