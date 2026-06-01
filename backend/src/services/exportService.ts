import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

const stripHtmlToText = (value: string): string => {
  if (!value) return "";
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6)>/gi, "\n\n")
    .replace(/<\/(tr)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^### (.*$)/gm, "$1")
    .replace(/^## (.*$)/gm, "$1")
    .replace(/^# (.*$)/gm, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const getExportText = (title: string, contentType: string, content: string): string => {
  let body = content
    .replace(/\[GEMINI\]/g, "[AI LEGAL ASSISTANT]")
    .replace(/\[USER\]/g, "[USER QUERY]");

  body = stripHtmlToText(body);

  const headerLabel = contentType === "cookie_report"
    ? "CookieCare Privacy Compliance Report"
    : contentType === "risk_report"
      ? "CookieCare Legal Risk Report"
      : contentType === "redlines"
        ? "CookieCare Draft Redline Export"
        : "CookieCare Report";

  return [
    headerLabel,
    `Title: ${title}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    body || "No content available.",
  ].join("\n");
};

export const buildPdfBuffer = async (title: string, contentType: string, content: string): Promise<Buffer> => {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const lines = getExportText(title, contentType, content).split("\n");

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text(lines[0]);
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10).fillColor("#6B7280").text(lines[1]);
    doc.text(lines[2]);
    doc.moveDown(1.5);

    doc.font("Helvetica").fontSize(11).fillColor("#111827");

    const bodyLines = lines.slice(4);
    let currentParagraph = "";

    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i].trim();
      if (!line) {
        if (currentParagraph) {
          doc.text(currentParagraph, { align: "justify", lineGap: 2 });
          doc.moveDown(0.8);
          currentParagraph = "";
        }
        continue;
      }
      const isHeader = /^[0-9]+\.|^[A-Z\s]{5,}$/.test(line);
      if (isHeader) {
        if (currentParagraph) {
          doc.text(currentParagraph, { align: "justify", lineGap: 2 });
          doc.moveDown(0.8);
          currentParagraph = "";
        }
        doc.font("Helvetica-Bold").fontSize(12).text(line);
        doc.font("Helvetica").fontSize(11);
        doc.moveDown(0.4);
      } else {
        currentParagraph += (currentParagraph ? " " : "") + line;
      }
    }
    if (currentParagraph) doc.text(currentParagraph, { align: "justify", lineGap: 2 });
    doc.end();
  });
};

export const buildDocxBuffer = async (title: string, contentType: string, content: string): Promise<Buffer> => {
  const lines = getExportText(title, contentType, content).split("\n");
  const bodyText = lines.slice(4).join("\n").trim();

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: lines[0], heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }),
          new Paragraph({ children: [new TextRun({ text: lines[1], italics: true, color: "666666" })], spacing: { after: 100 } }),
          new Paragraph({ children: [new TextRun({ text: lines[2], color: "666666" })], spacing: { after: 400 } }),
          ...bodyText.split(/\n{2,}/).map((para) => {
            const trimmed = para.trim();
            const isHeader = /^[0-9]+\.|^[A-Z\s]{5,}$/.test(trimmed);
            return new Paragraph({
              text: trimmed,
              heading: isHeader ? HeadingLevel.HEADING_2 : undefined,
              spacing: { after: isHeader ? 150 : 240 },
              alignment: isHeader ? undefined : AlignmentType.BOTH
            });
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc) as Buffer;
};
