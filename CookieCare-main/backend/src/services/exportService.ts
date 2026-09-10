import PDFDocument from "pdfkit";
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
// PDF — pure Node.js via PDFKit (no browser required)
// ─────────────────────────────────────────────────────────────────────────────

// A4 dimensions in points (1 pt = 1/72 inch)
const PAGE_WIDTH = 595.28;
const MARGIN = 56; // ~20mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Colours
const COLOR_BLACK   = "#111827";
const COLOR_GREY    = "#6B7280";
const COLOR_LIGHT   = "#9CA3AF";
const COLOR_RULE    = "#E5E7EB";

/**
 * Render a markdown-it token stream into a PDFKit document.
 * Handles: headings, paragraphs, bullet + ordered lists, code blocks, hr, tables.
 */
function renderTokensToPdf(doc: typeof PDFDocument.prototype, tokens: any[]): void {
  let i = 0;
  let listCounter = 0;

  // Helper: render inline children (bold / italic / plain) into the current
  // text stream using PDFKit's continuation API.
  const renderInline = (inlineTok: any, opts: { size?: number; color?: string; indent?: number } = {}) => {
    if (!inlineTok?.children?.length) {
      const text = inlineTok?.content ?? "";
      if (text) doc.text(text, { continued: false, ...( opts.indent ? { indent: opts.indent } : {}) });
      return;
    }

    const children = inlineTok.children as any[];
    let bold = false;
    let italic = false;

    // Collect runs so we can set continued=true on all but the last
    type Run = { text: string; bold: boolean; italic: boolean };
    const runs: Run[] = [];

    for (const tok of children) {
      if (tok.type === "strong_open")  { bold   = true;  continue; }
      if (tok.type === "strong_close") { bold   = false; continue; }
      if (tok.type === "em_open")      { italic = true;  continue; }
      if (tok.type === "em_close")     { italic = false; continue; }
      if (tok.type === "softbreak" || tok.type === "hardbreak") {
        runs.push({ text: "\n", bold, italic });
        continue;
      }
      if (tok.type === "link_open" || tok.type === "link_close") continue;
      const text = tok.content ?? "";
      if (text) runs.push({ text, bold, italic });
    }

    if (!runs.length) return;

    const baseSize  = opts.size  ?? 11;
    const baseColor = opts.color ?? COLOR_BLACK;
    const indent    = opts.indent ?? 0;

    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      const isLast = r === runs.length - 1;
      doc
        .fontSize(run.bold ? baseSize : baseSize)
        .fillColor(baseColor)
        .font(run.bold && run.italic ? "Helvetica-BoldOblique"
            : run.bold               ? "Helvetica-Bold"
            : run.italic             ? "Helvetica-Oblique"
            :                          "Helvetica")
        .text(run.text, {
          continued: !isLast && run.text !== "\n",
          indent: r === 0 ? indent : 0,
          width: CONTENT_WIDTH - indent,
          align: "justify",
          lineGap: 2,
        });
    }
    // Reset font after inline block
    doc.font("Helvetica").fontSize(baseSize).fillColor(COLOR_BLACK);
  };

  while (i < tokens.length) {
    const tok = tokens[i];

    // ── Headings ────────────────────────────────────────────────────────────
    if (tok.type === "heading_open") {
      const level = parseInt(tok.tag.replace("h", ""), 10);
      const inline = tokens[i + 1];
      const text   = inline?.content ?? stripTags(inline?.children?.map((c: any) => c.content ?? "").join("") ?? "");

      const sizes: Record<number, number> = { 1: 18, 2: 15, 3: 13, 4: 12, 5: 11, 6: 10 };
      const size = sizes[level] ?? 12;

      doc.moveDown(level <= 2 ? 0.6 : 0.4);
      doc.font("Helvetica-Bold").fontSize(size).fillColor(COLOR_BLACK).text(text, { width: CONTENT_WIDTH });

      if (level <= 2) {
        doc.moveDown(0.1);
        doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y)
           .strokeColor(level === 1 ? COLOR_BLACK : COLOR_RULE).lineWidth(level === 1 ? 1 : 0.5).stroke();
      }
      doc.moveDown(0.3).font("Helvetica").fontSize(11).fillColor(COLOR_BLACK);
      i += 3;
      continue;
    }

    // ── Paragraphs ──────────────────────────────────────────────────────────
    if (tok.type === "paragraph_open") {
      const inline = tokens[i + 1];
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(11).fillColor(COLOR_BLACK);
      renderInline(inline);
      i += 3;
      continue;
    }

    // ── Bullet lists ────────────────────────────────────────────────────────
    if (tok.type === "bullet_list_open") {
      i++;
      while (i < tokens.length && tokens[i].type !== "bullet_list_close") {
        if (tokens[i].type === "list_item_open") {
          i++;
          while (i < tokens.length && tokens[i].type !== "list_item_close") {
            if (tokens[i].type === "paragraph_open" || tokens[i].type === "inline") {
              const inline = tokens[i].type === "inline" ? tokens[i] : tokens[i + 1];
              doc.font("Helvetica").fontSize(11).fillColor(COLOR_BLACK);
              // Bullet character
              doc.text("•", MARGIN, doc.y, { continued: true, width: 14 });
              renderInline(inline, { indent: 0 });
              doc.moveDown(0.15);
              if (tokens[i].type === "paragraph_open") i += 3; else i++;
              continue;
            }
            i++;
          }
        }
        i++;
      }
      i++;
      continue;
    }

    // ── Ordered lists ───────────────────────────────────────────────────────
    if (tok.type === "ordered_list_open") {
      listCounter = parseInt(tok.attrGet?.("start") ?? "1", 10);
      i++;
      while (i < tokens.length && tokens[i].type !== "ordered_list_close") {
        if (tokens[i].type === "list_item_open") {
          const num = listCounter++;
          i++;
          while (i < tokens.length && tokens[i].type !== "list_item_close") {
            if (tokens[i].type === "paragraph_open" || tokens[i].type === "inline") {
              const inline = tokens[i].type === "inline" ? tokens[i] : tokens[i + 1];
              doc.font("Helvetica").fontSize(11).fillColor(COLOR_BLACK);
              doc.text(`${num}.`, MARGIN, doc.y, { continued: true, width: 20 });
              renderInline(inline, { indent: 0 });
              doc.moveDown(0.15);
              if (tokens[i].type === "paragraph_open") i += 3; else i++;
              continue;
            }
            i++;
          }
        }
        i++;
      }
      i++;
      continue;
    }

    // ── Code blocks ─────────────────────────────────────────────────────────
    if (tok.type === "code_block" || tok.type === "fence") {
      doc.moveDown(0.3);
      doc.font("Courier").fontSize(9).fillColor(COLOR_GREY)
         .text(tok.content ?? "", { width: CONTENT_WIDTH, lineGap: 1 });
      doc.font("Helvetica").fontSize(11).fillColor(COLOR_BLACK).moveDown(0.3);
      i++;
      continue;
    }

    // ── Horizontal rule ─────────────────────────────────────────────────────
    if (tok.type === "hr") {
      doc.moveDown(0.4);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y)
         .strokeColor(COLOR_RULE).lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      i++;
      continue;
    }

    // ── Tables ──────────────────────────────────────────────────────────────
    if (tok.type === "table_open") {
      // Collect all cell texts first so we can lay them out
      const rows: { text: string; isHeader: boolean }[][] = [];
      i++;
      while (i < tokens.length && tokens[i].type !== "table_close") {
        if (tokens[i].type === "tr_open") {
          const row: { text: string; isHeader: boolean }[] = [];
          i++;
          while (i < tokens.length && tokens[i].type !== "tr_close") {
            const isHeader = tokens[i].type === "th_open";
            if (isHeader || tokens[i].type === "td_open") {
              i++;
              const cellText = tokens[i]?.content ?? tokens[i]?.children?.map((c: any) => c.content ?? "").join("") ?? "";
              row.push({ text: cellText, isHeader });
              i += 2; // inline + th/td_close
              continue;
            }
            i++;
          }
          if (row.length) rows.push(row);
        }
        i++;
      }

      if (rows.length) {
        const colCount  = rows[0].length;
        const colWidth  = CONTENT_WIDTH / colCount;
        const rowHeight = 20;
        doc.moveDown(0.4);
        let tableY = doc.y;

        for (const row of rows) {
          let x = MARGIN;
          for (const cell of row) {
            // Cell border
            doc.rect(x, tableY, colWidth, rowHeight).strokeColor(COLOR_RULE).lineWidth(0.5).stroke();
            // Cell text
            doc.font(cell.isHeader ? "Helvetica-Bold" : "Helvetica")
               .fontSize(9).fillColor(COLOR_BLACK)
               .text(cell.text, x + 4, tableY + 5, { width: colWidth - 8, height: rowHeight - 6, ellipsis: true });
            x += colWidth;
          }
          tableY += rowHeight;
        }
        doc.y = tableY;
        doc.moveDown(0.4);
      }
      i++;
      continue;
    }

    i++;
  }
}

export const buildPdfBuffer = async (
  title: string,
  contentType: string,
  content: string
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const label = (contentType ?? "DOCUMENT").toUpperCase().replace(/_/g, " ");

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.fontSize(9).font("Helvetica").fillColor(COLOR_GREY)
       .text(`LORA Digital Asset Vault  •  ${label}`, MARGIN, MARGIN - 20, { width: CONTENT_WIDTH, align: "left" })
       .text(new Date().toLocaleString(), MARGIN, MARGIN - 20, { width: CONTENT_WIDTH, align: "right" });

    doc.moveDown(0.5);

    // ── Title ───────────────────────────────────────────────────────────────
    doc.fontSize(20).font("Helvetica-Bold").fillColor(COLOR_BLACK)
       .text(title.toUpperCase(), { width: CONTENT_WIDTH });
    doc.moveDown(0.2);
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y)
       .strokeColor(COLOR_BLACK).lineWidth(1.5).stroke();
    doc.moveDown(0.6);

    // ── Body ────────────────────────────────────────────────────────────────
    doc.fontSize(11).font("Helvetica").fillColor(COLOR_BLACK);
    const tokens = contentToTokens(content);
    renderTokensToPdf(doc, tokens);

    // ── Footer on every page ────────────────────────────────────────────────
    const pages = doc.bufferedPageRange();
    for (let p = 0; p < pages.count; p++) {
      doc.switchToPage(pages.start + p);
      const footerY = doc.page.height - MARGIN + 8;
      doc.moveTo(MARGIN, footerY - 4).lineTo(MARGIN + CONTENT_WIDTH, footerY - 4)
         .strokeColor(COLOR_RULE).lineWidth(0.5).stroke();
      doc.fontSize(8).font("Helvetica").fillColor(COLOR_LIGHT)
         .text(
           `Confidential Document  •  Powered by LORA Multi-Agent Legal Engine  •  Page ${p + 1} of ${pages.count}`,
           MARGIN, footerY, { width: CONTENT_WIDTH, align: "center" }
         );
    }

    doc.end();
  });
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
                text: `Generated by LORA • ${new Date().toLocaleDateString()}`,
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
                text: "Confidential Document \u2022 Powered by LORA Multi-Agent Legal Engine",
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
