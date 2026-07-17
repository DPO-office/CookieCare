import React from "react";
import { markdownToHtml } from "../../shared/utils/markdownToHtml";

export function parseBoldText(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return React.createElement("strong", { key: i, className: "font-semibold text-gray-900" }, part);
    }
    return part;
  });
}

export function renderContentText(text: string): React.ReactElement {
  const html = markdownToHtml(text);
  return React.createElement("div", {
    className: "richtext-editor text-[13px] text-gray-700 leading-relaxed",
    dangerouslySetInnerHTML: { __html: html }
  });
}
