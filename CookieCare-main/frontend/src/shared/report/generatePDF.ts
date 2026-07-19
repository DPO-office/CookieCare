/**
 * Enterprise PDF Generator — Isolated per-page rendering engine.
 *
 * ISOLATION GUARANTEE:
 *   Each page is rendered inside a hidden <iframe> that is completely
 *   separate from the main document. This means:
 *     - The visible application UI is never touched.
 *     - No layout shifts, no reflow, no flicker.
 *     - The iframe has its own document, its own layout context.
 *
 *   Previous approach used position:fixed + windowWidth override on html2canvas,
 *   which forced the browser to reflow the main page to 794px width — causing
 *   the visible UI to visually compress during PDF generation.
 *
 * Architecture:
 *   1. Build all page HTML strings from the template engine.
 *   2. For each page: create a hidden iframe → write the page HTML into it →
 *      wait for fonts/images to settle → capture with html2canvas → destroy iframe.
 *   3. Assemble captured canvases into a single jsPDF document and save.
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
 * Creates a completely isolated, invisible iframe for off-screen rendering.
 * The iframe is positioned far off-screen and hidden so it has zero visual
 * impact on the main application.
 */
function createIsolatedIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  // Position completely off-screen — does NOT use position:fixed to avoid
  // triggering main-document reflow. position:absolute on a 0×0 element
  // at a negative offset has no visual impact.
  iframe.style.cssText = [
    "position:absolute",
    "left:-99999px",
    "top:0",
    `width:${A4_W_PX}px`,
    `height:${A4_H_PX}px`,
    "border:none",
    "visibility:hidden",
    "pointer-events:none",
    "overflow:hidden",
  ].join(";");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  document.body.appendChild(iframe);
  return iframe;
}

/**
 * Writes a full HTML page into an iframe and waits for it to be fully laid out,
 * including fonts and images.
 */
function writeIframeContent(iframe: HTMLIFrameElement, html: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();

    // Wait for the iframe's load event (fires after subresources settle),
    // then add an extra frame to let fonts finish painting.
    const onLoad = () => {
      iframe.removeEventListener("load", onLoad);
      // Extra settle time for @font-face and images inside the iframe
      setTimeout(resolve, 120);
    };

    // If already loaded (synchronous write), schedule async anyway
    if (iframe.contentDocument?.readyState === "complete") {
      setTimeout(resolve, 120);
    } else {
      iframe.addEventListener("load", onLoad);
      // Fallback timeout in case load never fires
      setTimeout(resolve, 800);
    }
  });
}

/**
 * Generates and downloads an enterprise-branded PDF report.
 * The entire render process is isolated inside hidden iframes — the visible
 * application is never modified or reflowed.
 *
 * @param data      Normalised report data
 * @param fileName  Output file name (without .pdf extension)
 */
export async function generateEnterpriseReport(
  data: EnterpriseReportData,
  fileName: string
): Promise<void> {
  // Pre-load logo assets before building page HTML
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
    const iframe = createIsolatedIframe();

    try {
      // Write the page HTML into the isolated iframe document
      await writeIframeContent(iframe, pageHtml);

      // Capture from the iframe's document body — completely isolated from
      // the main document. No windowWidth/windowHeight override needed because
      // the iframe already has its own 794×1123 viewport.
      const iframeDoc  = iframe.contentDocument!;
      const iframeBody = iframeDoc.body;

      // Ensure body fills the exact A4 dimensions
      iframeBody.style.cssText = `
        margin:0;padding:0;
        width:${A4_W_PX}px;
        height:${A4_H_PX}px;
        overflow:hidden;
        background:#ffffff;
      `;

      const canvas = await html2canvas(iframeBody, {
        scale:           2,
        useCORS:         true,
        allowTaint:      true,
        backgroundColor: "#ffffff",
        logging:         false,
        width:           A4_W_PX,
        height:          A4_H_PX,
        // No windowWidth / windowHeight — we capture the iframe's own viewport,
        // so the main document layout is never touched.
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.93);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, A4_W_MM, A4_H_MM);
    } finally {
      // Always remove the iframe, even if capture throws — no memory leaks
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }
  }

  const safeFileName = fileName.replace(/[^a-zA-Z0-9_\-]/g, "_");
  pdf.save(`${safeFileName}.pdf`);
}
