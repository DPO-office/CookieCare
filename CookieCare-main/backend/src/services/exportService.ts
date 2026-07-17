import { browserManager } from "../utils/browserManager.js";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TableRow,
  TableCell,
  Table,
  WidthType,
  BorderStyle,
} from "docx";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

/**
 * Returns true if the string looks like HTML (contains at least one HTML tag).
 * Used to decide whether to treat content as Markdown or HTML.
 */
function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content.trim());
}

/**
 * Normalise content for export:
 * - If already HTML, return as-is.
 * - If Markdown, render to HTML using markdown-it.
 */
function contentToHtml(content: string): string {
  return isHtmlContent(content) ? content : md.render(content);
}

/**
 * Normalise content to a markdown-it token stream:
 * - If already HTML, we can't parse it with markdown-it, so we strip the HTML
 *   tags with a simple regex to get approximate plain text and wrap it for
 *   DOCX generation.  This is a best-effort conversion that preserves the
 *   visual structure without needing an additional HTML-parser dependency.
 * - If Markdown, parse directly.
 */
function contentToTokens(content: string): any[] {
  if (isHtmlContent(content)) {
    // Convert HTML → Markdown-like plain text then let markdown-it tokenise it.
    // Handles the most common tags that TipTap + markdown-it produce.
    const asMarkdown = content
      // Headings
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, inner) => `# ${stripTags(inner)}\n\n`)
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, inner) => `## ${stripTags(inner)}\n\n`)
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, inner) => `### ${stripTags(inner)}\n\n`)
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_m, inner) => `#### ${stripTags(inner)}\n\n`)
      .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_m, inner) => `##### ${stripTags(inner)}\n\n`)
      .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_m, inner) => `###### ${stripTags(inner)}\n\n`)
      // Bold / Italic / Underline (TipTap uses <strong>/<em>/<u>)
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_m, inner) => `**${inner}**`)
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_m, inner) => `_${inner}_`)
      .replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, (_m, inner) => inner)
      // Line breaks and paragraphs
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<p[^>]*>/gi, "")
      // Lists
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => `- ${stripTags(inner)}\n`)
      .replace(/<\/?[uo]l[^>]*>/gi, "\n")
      // Horizontal rule
      .replace(/<hr\s*\/?>/gi, "\n---\n")
      // Strip all remaining tags
      .replace(/<[^>]+>/g, "")
      // Decode HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      // Collapse 3+ consecutive blank lines to 2
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return md.parse(asMarkdown, {});
  }
  return md.parse(content, {});
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF — unchanged, working correctly via Playwright
// ─────────────────────────────────────────────────────────────────────────────
export const buildPdfBuffer = async (
  title: string,
  contentType: string,
  content: string
): Promise<Buffer> => {
  const page = await browserManager.newPage();
  const context = page.context();
  try {
    // Accept both HTML and Markdown content from the editor
    const renderedContent = contentToHtml(content);
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #111827; line-height: 1.6; }
    h1 { font-size: 24px; color: #000; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-transform: uppercase; }
    h2 { font-size: 18px; margin-top: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
    h3 { font-size: 16px; margin-top: 20px; font-weight: bold; }
    p  { margin-bottom: 15px; text-align: justify; }
    ul, ol { margin-bottom: 15px; padding-left: 20px; }
    li { margin-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 12px; }
    th { background-color: #f9fafb; font-weight: bold; }
    .header { color: #6b7280; font-size: 12px; margin-bottom: 40px; }
    .footer { margin-top: 50px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    .content-area { font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    Lexify Digital Asset Vault • ${contentType.toUpperCase().replace("_", " ")}
    <br>Generated on ${new Date().toLocaleString()}
  </div>
  <h1>${title}</h1>
  <div class="content-area">${renderedContent}</div>
  <div class="footer">Confidential Document • Powered by Lexify Multi-Agent Legal Engine</div>
</body>
</html>`;
    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
      printBackground: true,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
    await context.close();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline-style token builder — converts inline markdown tokens to TextRun[]
// ─────────────────────────────────────────────────────────────────────────────
function inlineTokensToRuns(tokens: any[]): TextRun[] {
  const runs: TextRun[] = [];
  let bold = false;
  let italic = false;
  let underline = false;

  for (const token of tokens) {
    if (token.type === "strong_open")  { bold    = true;  continue; }
    if (token.type === "strong_close") { bold    = false; continue; }
    if (token.type === "em_open")      { italic  = true;  continue; }
    if (token.type === "em_close")     { italic  = false; continue; }
    if (token.type === "s_open")       { underline = true;  continue; }
    if (token.type === "s_close")      { underline = false; continue; }

    if (token.type === "softbreak" || token.type === "hardbreak") {
      runs.push(new TextRun({ text: " " }));
      continue;
    }

    if (token.type === "text" || token.type === "code_inline") {
      // Preserve internal whitespace — split on nothing
      const text = token.content ?? "";
      if (text) {
        runs.push(
          new TextRun({
            text,
            bold:      bold    || undefined,
            italics:   italic  || undefined,
            underline: underline ? { type: "single" } : undefined,
          })
        );
      }
      continue;
    }

    if (token.type === "link_open") continue;
    if (token.type === "link_close") continue;

    // Fallback: render anything with content
    if (token.content) {
      runs.push(new TextRun({ text: token.content, bold: bold || undefined, italics: italic || undefined }));
    }
  }

  // Guarantee at least one run so the paragraph isn't empty
  if (runs.length === 0) runs.push(new TextRun({ text: "" }));
  return runs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convert a markdown-it token stream → docx Paragraph / Table nodes
// ─────────────────────────────────────────────────────────────────────────────
function tokensToDocxChildren(tokens: any[]): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    // ── Headings ──────────────────────────────────────────────────────────
    if (token.type === "heading_open") {
      const level = parseInt(token.tag.replace("h", ""), 10);
      const inlineToken = tokens[i + 1];
      const headingMap: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      };
      const runs = inlineToken?.children
        ? inlineTokensToRuns(inlineToken.children)
        : [new TextRun({ text: inlineToken?.content ?? "" })];

      children.push(
        new Paragraph({
          heading: headingMap[level] ?? HeadingLevel.HEADING_1,
          children: runs,
          spacing: { before: 240, after: 120 },
        })
      );
      i += 3; // heading_open, inline, heading_close
      continue;
    }

    // ── Paragraphs ────────────────────────────────────────────────────────
    if (token.type === "paragraph_open") {
      const inlineToken = tokens[i + 1];
      const runs = inlineToken?.children
        ? inlineTokensToRuns(inlineToken.children)
        : [new TextRun({ text: inlineToken?.content ?? "" })];

      children.push(
        new Paragraph({
          children: runs,
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 80, after: 120 },
        })
      );
      i += 3; // paragraph_open, inline, paragraph_close
      continue;
    }

    // ── Unordered lists ───────────────────────────────────────────────────
    if (token.type === "bullet_list_open") {
      i++;
      while (i < tokens.length && tokens[i].type !== "bullet_list_close") {
        if (tokens[i].type === "list_item_open") {
          i++;
          // collect inline inside the list item
          while (i < tokens.length && tokens[i].type !== "list_item_close") {
            if (tokens[i].type === "paragraph_open" || tokens[i].type === "inline") {
              const inlineTok = tokens[i].type === "inline" ? tokens[i] : tokens[i + 1];
              const runs = inlineTok?.children
                ? inlineTokensToRuns(inlineTok.children)
                : [new TextRun({ text: inlineTok?.content ?? "" })];
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: "• " }), ...runs],
                  indent: { left: 360 },
                  spacing: { before: 40, after: 40 },
                })
              );
              if (tokens[i].type === "paragraph_open") i += 3;
              else i++;
              continue;
            }
            i++;
          }
        }
        i++;
      }
      i++; // skip bullet_list_close
      continue;
    }

    // ── Ordered lists ─────────────────────────────────────────────────────
    if (token.type === "ordered_list_open") {
      let listCounter = parseInt(token.attrGet("start") ?? "1", 10);
      i++;
      while (i < tokens.length && tokens[i].type !== "ordered_list_close") {
        if (tokens[i].type === "list_item_open") {
          const num = listCounter++;
          i++;
          while (i < tokens.length && tokens[i].type !== "list_item_close") {
            if (tokens[i].type === "paragraph_open" || tokens[i].type === "inline") {
              const inlineTok = tokens[i].type === "inline" ? tokens[i] : tokens[i + 1];
              const runs = inlineTok?.children
                ? inlineTokensToRuns(inlineTok.children)
                : [new TextRun({ text: inlineTok?.content ?? "" })];
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: `${num}. ` }), ...runs],
                  indent: { left: 360 },
                  spacing: { before: 40, after: 40 },
                })
              );
              if (tokens[i].type === "paragraph_open") i += 3;
              else i++;
              continue;
            }
            i++;
          }
        }
        i++;
      }
      i++; // skip ordered_list_close
      continue;
    }

    // ── Code blocks ───────────────────────────────────────────────────────
    if (token.type === "code_block" || token.type === "fence") {
      const lines = (token.content ?? "").split("\n");
      for (const line of lines) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, font: "Courier New", size: 18 })],
            spacing: { before: 40, after: 40 },
            indent: { left: 360 },
          })
        );
      }
      i++;
      continue;
    }

    // ── Horizontal rule → empty paragraph with border ─────────────────────
    if (token.type === "hr") {
      children.push(new Paragraph({ text: "", spacing: { before: 120, after: 120 } }));
      i++;
      continue;
    }

    // ── Tables ────────────────────────────────────────────────────────────
    if (token.type === "table_open") {
      const rows: TableRow[] = [];
      i++;
      while (i < tokens.length && tokens[i].type !== "table_close") {
        if (tokens[i].type === "tr_open") {
          const cells: TableCell[] = [];
          i++;
          while (i < tokens.length && tokens[i].type !== "tr_close") {
            if (tokens[i].type === "th_open" || tokens[i].type === "td_open") {
              const isHeader = tokens[i].type === "th_open";
              i++;
              const inlineTok = tokens[i];
              const runs = inlineTok?.children
                ? inlineTokensToRuns(inlineTok.children)
                : [new TextRun({ text: inlineTok?.content ?? "" })];
              if (isHeader) runs.forEach((r: any) => { r._data.bold = true; });
              cells.push(
                new TableCell({
                  children: [new Paragraph({ children: runs })],
                  width: { size: 20, type: WidthType.PERCENTAGE },
                  borders: {
                    top:    { style: BorderStyle.SINGLE, size: 1 },
                    bottom: { style: BorderStyle.SINGLE, size: 1 },
                    left:   { style: BorderStyle.SINGLE, size: 1 },
                    right:  { style: BorderStyle.SINGLE, size: 1 },
                  },
                })
              );
              i += 2; // inline + th/td_close
              continue;
            }
            i++;
          }
          if (cells.length > 0) rows.push(new TableRow({ children: cells }));
        }
        i++;
      }
      if (rows.length > 0) {
        children.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
      }
      i++; // skip table_close
      continue;
    }

    // ── Blockquotes → indented paragraph ─────────────────────────────────
    if (token.type === "blockquote_open") {
      i++;
      while (i < tokens.length && tokens[i].type !== "blockquote_close") {
        if (tokens[i].type === "inline") {
          const runs = inlineTokensToRuns(tokens[i].children ?? []);
          children.push(
            new Paragraph({
              children: runs,
              indent: { left: 720 },
              spacing: { before: 80, after: 80 },
            })
          );
        }
        i++;
      }
      i++;
      continue;
    }

    i++;
  }

  return children;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCX export — proper markdown parsing, preserving all formatting
// ─────────────────────────────────────────────────────────────────────────────
export const buildDocxBuffer = async (
  title: string,
  _contentType: string,
  content: string
): Promise<Buffer> => {
  // Parse content (Markdown or HTML) to a markdown-it token stream
  const tokens = contentToTokens(content);

  // Build docx children from tokens
  const bodyChildren = tokensToDocxChildren(tokens);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 24 },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }, // ~2cm
          },
        },
        children: [
          // Document title
          new Paragraph({
            text: title,
            heading: HeadingLevel.TITLE,
            spacing: { before: 0, after: 480 },
          }),
          // Separator
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated by Lexify • ${new Date().toLocaleDateString()}`,
                size: 18,
                color: "888888",
              }),
            ],
            spacing: { before: 0, after: 480 },
          }),
          // Body
          ...bodyChildren,
          // Footer paragraph
          new Paragraph({
            children: [
              new TextRun({
                text: "Confidential Document • Powered by Lexify Multi-Agent Legal Engine",
                size: 16,
                color: "9CA3AF",
              }),
            ],
            spacing: { before: 480, after: 0 },
          }),
        ],
      },
    ],
  });

  return (await Packer.toBuffer(doc)) as Buffer;
};
