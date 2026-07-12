import React from "react";

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
  const lines = text.split("\n");
  const children = lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return React.createElement("div", { key: idx, className: "h-1.5" });

    if (trimmed.startsWith("### ")) {
      return React.createElement(
        "h4",
        { key: idx, className: "text-[13px] font-semibold text-gray-800 mt-5 mb-1.5 select-all" },
        trimmed.replace("### ", "")
      );
    }
    if (trimmed.startsWith("## ")) {
      return React.createElement(
        "h3",
        { key: idx, className: "text-[14px] font-semibold text-gray-900 mt-6 mb-2 select-all" },
        trimmed.replace("## ", "")
      );
    }
    if (trimmed.startsWith("# ")) {
      return React.createElement(
        "h2",
        { key: idx, className: "text-[15px] font-semibold text-gray-900 mt-7 mb-2 select-all" },
        trimmed.replace("# ", "")
      );
    }

    const isListItem = trimmed.startsWith("- ") || trimmed.startsWith("* ");
    if (isListItem) {
      const content = trimmed.substring(2);
      return React.createElement(
        "div",
        { key: idx, className: "flex items-start gap-2.5 ml-3 select-all" },
        React.createElement("span", { className: "text-gray-400 mt-1.5 shrink-0 text-[8px]" }, "◆"),
        React.createElement(
          "span",
          { className: "flex-1 text-gray-700 leading-relaxed select-all" },
          ...parseBoldText(content)
        )
      );
    }

    return React.createElement(
      "p",
      { key: idx, className: "leading-relaxed text-gray-700 select-all" },
      ...parseBoldText(trimmed)
    );
  });

  return React.createElement("div", { className: "space-y-3 text-[13px] text-gray-700 leading-relaxed select-all" }, ...children);
}
