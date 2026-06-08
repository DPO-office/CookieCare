import { chromium } from "playwright";
import { Document, Packer, Paragraph, HeadingLevel, AlignmentType } from "docx";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

/**
 * High-fidelity PDF export using Playwright's print-to-pdf.
 * This preserves HTML styling and professional layout.
 */
export const buildPdfBuffer = async (title: string, contentType: string, content: string): Promise<Buffer> => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const renderedContent = md.render(content);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #111827; line-height: 1.6; }
        h1 { font-size: 24px; color: #000; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-transform: uppercase; }
        h2 { font-size: 18px; margin-top: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
        h3 { font-size: 16px; margin-top: 20px; font-weight: bold; }
        p { margin-bottom: 15px; text-align: justify; }
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
        PrivSecAI Digital Asset Vault • ${contentType.toUpperCase().replace('_', ' ')}
        <br>Generated on ${new Date().toLocaleString()}
      </div>
      <h1>${title}</h1>
      <div class="content-area">${renderedContent}</div>
      <div class="footer">
        Confidential Document • Powered by PrivSecAI Multi-Agent Legal Engine
      </div>
    </body>
    </html>
  `;

  await page.setContent(htmlContent);
  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
    printBackground: true
  });

  await browser.close();
  return Buffer.from(pdfBuffer);
};

/**
 * DOCX export remains similar but refined for better paragraph handling.
 */
export const buildDocxBuffer = async (title: string, contentType: string, content: string): Promise<Buffer> => {
  const sections = content.split('\n\n').map(text => {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const isHeader = /^[0-9]+\.|^[A-Z\s]{5,}$/.test(trimmed);

    return new Paragraph({
      text: trimmed,
      heading: isHeader ? HeadingLevel.HEADING_1 : undefined,
      spacing: { after: 200 },
      alignment: isHeader ? AlignmentType.LEFT : AlignmentType.JUSTIFIED
    });
  }).filter(p => p !== null) as Paragraph[];

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 400 } }),
        ...sections
      ]
    }]
  });

  return await Packer.toBuffer(doc) as Buffer;
};
