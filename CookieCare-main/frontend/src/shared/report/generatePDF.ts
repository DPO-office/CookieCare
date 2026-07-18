/**
 * Enterprise PDF Generator — Per-page rendering engine.
 *
 * Renders each A4 page as a separate html2canvas capture,
 * then assembles them into a single jsPDF document.
 *
 * Pages are pre-distributed by the template's pagination engine,
 * eliminating mid-element page breaks entirely.
 */
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { EnterpriseReportData } from "./reportTypes";
import { buildReportPages, A4_W_PX, A4_H_PX } from "./reportTemplate";
import { preloadLogos } from "./brandAssets";

/** A4 in mm */
const A4_W_MM = 210;
const A4_H_MM = 297;

/**
 * Generates and downloads an enterprise-branded PDF report.
 * @param data      Normalised report data
 * @param fileName  Output file name (without .pdf extension)
 */
export async function generateEnterpriseReport(
  data: EnterpriseReportData,
  fileName: string
): Promise<void> {
  // Pre-load real logo PNGs from /public before building pages
  await preloadLogos();

  const { pages } = buildReportPages(data);

  const pdf = new jsPDF({
    orientation: "portrait",
    unit:        "mm",
    format:      "a4",
    compress:    true,
  });

  for (let i = 0; i < pages.length; i++) {
    const pageHtml = pages[i];

    // Mount this page in an off-screen container
    const container = document.createElement("div");
    container.style.cssText = [
      "position:fixed",
      "top:-9999999px",
      "left:-9999999px",
      `width:${A4_W_PX}px`,
      `height:${A4_H_PX}px`,
      "overflow:hidden",
      "background:#ffffff",
      "z-index:-9999",
    ].join(";");
    container.innerHTML = pageHtml;
    document.body.appendChild(container);

    try {
      // Give the browser one frame to lay out the DOM
      await new Promise<void>(resolve => setTimeout(resolve, 80));

      // Capture at 2× scale for sharp, print-quality output
      const canvas = await html2canvas(container, {
        scale:           2,
        useCORS:         true,
        allowTaint:      true,
        backgroundColor: "#ffffff",
        logging:         false,
        width:           A4_W_PX,
        height:          A4_H_PX,
        windowWidth:     A4_W_PX,
        windowHeight:    A4_H_PX,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.93);

      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, A4_W_MM, A4_H_MM);
    } finally {
      document.body.removeChild(container);
    }
  }

  const safeFileName = fileName.replace(/[^a-zA-Z0-9_\-]/g, "_");
  pdf.save(`${safeFileName}.pdf`);
}
