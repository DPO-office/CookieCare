/**
 * Live browser E2E: Bitrix24/Alaio international transfer review.
 * Writes status + report under logs/analysis/eval/.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "logs", "analysis", "eval");
const DPA_PATH = "C:\\Users\\abhinav.yadav_randst\\Downloads\\DPA - 1.docx";
const EMAIL = process.env.LIVE_EMAIL || "swarnaaishwarya17@gmail.com";
const PASSWORD = process.env.LIVE_PASSWORD || "MamuSecure2026!";
const FRONTEND = process.env.LIVE_FRONTEND || "http://localhost:3000";
const BACKEND = process.env.LIVE_BACKEND || "http://localhost:3000";
const PREFIX = "2026-09-07-live-xfer-bitrix";

const PROMPT = `Analyse all international data transfer provisions. Identify: whether Standard Contractual Clauses, Binding Corporate Rules, or adequacy decisions are referenced, whether Schrems II supplementary measures are addressed, transfers to third countries and the legal basis for each, and any gaps in transfer mechanisms.`;

function write(name, text) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const p = path.join(OUT_DIR, name);
  fs.writeFileSync(p, text, "utf8");
  return p;
}

function log(msg) {
  const line = `[live-xfer] ${new Date().toISOString()} ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(OUT_DIR, `${PREFIX}-run.log`), line + "\n");
}

async function waitHealth(url, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status < 500) {
        log(`${label} ready (${r.status})`);
        return;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not ready: ${url}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  write(`${PREFIX}-run.log`, "");
  log(`DPA exists=${fs.existsSync(DPA_PATH)}`);
  if (!fs.existsSync(DPA_PATH)) throw new Error(`Missing DPA: ${DPA_PATH}`);

  await waitHealth(`${BACKEND}/api/analysis/health`, "backend");
  await waitHealth(FRONTEND, "frontend");

  const headless = process.env.LIVE_HEADLESS === "1";
  const channel = process.env.LIVE_BROWSER_CHANNEL || "chrome";
  log(`launching chromium headless=${headless} channel=${channel}`);
  let browser;
  try {
    browser = await chromium.launch({
      headless,
      channel,
      slowMo: headless ? 0 : 80,
    });
  } catch (err) {
    log(`channel=${channel} failed (${err.message}); falling back to bundled chromium`);
    browser = await chromium.launch({
      headless,
      slowMo: headless ? 0 : 80,
    });
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);

  const apiEvents = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    if (
      url.includes("/api/analysis/") ||
      url.includes("/api/documents/") ||
      url.includes("/api/jobs/") ||
      url.includes("/api/auth/login")
    ) {
      apiEvents.push({
        status: res.status(),
        url,
        method: res.request().method(),
        at: new Date().toISOString(),
      });
    }
  });

  try {
    log("goto login");
    await page.goto(`${FRONTEND}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#auth-email-input");
    await page.fill("#auth-email-input", EMAIL);
    await page.fill("#auth-password-input", PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60_000 });
    log(`logged in → ${page.url()}`);

    await page.goto(`${FRONTEND}/analyze`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('textarea[aria-label="Analysis request"], textarea.pcl-input');
    log("analyze page ready");

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles(DPA_PATH);
      log("setInputFiles via existing input");
    } else {
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByRole("button", { name: /attach file/i }).click(),
      ]);
      await chooser.setFiles(DPA_PATH);
      log("setFiles via filechooser");
    }

    await page.waitForTimeout(1500);
    const uploadDone = page.getByText(/DPA - 1\.docx|Uploading|uploaded/i).first();
    await uploadDone.waitFor({ state: "visible", timeout: 180_000 }).catch(() => {});
    for (let i = 0; i < 120; i++) {
      const uploading = await page.getByText(/Uploading/i).count();
      if (uploading === 0) break;
      await page.waitForTimeout(1000);
    }
    log("upload phase complete (or timed)");
    await page.screenshot({
      path: path.join(OUT_DIR, `${PREFIX}-after-upload.png`),
      fullPage: true,
    });

    const ta = page.locator('textarea[aria-label="Analysis request"], textarea.pcl-input').first();
    await ta.click();
    await ta.fill(PROMPT);
    log(`prompt filled (${PROMPT.length} chars)`);

    let jobId = null;
    let sessionId = null;
    const authToken = await page.evaluate(() => localStorage.getItem("lex_token"));

    const jobIdPromise = new Promise((resolve) => {
      const handler = async (res) => {
        try {
          if (
            res.url().includes("/api/analysis/run") &&
            res.request().method() === "POST" &&
            res.status() === 202
          ) {
            const json = await res.json();
            if (json?.job_id) {
              page.off("response", handler);
              resolve(json.job_id);
            }
          }
        } catch {
          // ignore
        }
      };
      page.on("response", handler);
      setTimeout(() => resolve(null), 120_000);
    });

    await page.locator('button.analyze-enter-btn[aria-label="Analyze"]').click();
    log("Analyze clicked — waiting for completion");

    jobId = await jobIdPromise;
    if (jobId) log(`job_id=${jobId}`);

    const startedAt = Date.now();
    let sawThinking = false;
    for (let i = 0; i < 60 && !sawThinking; i++) {
      const body = await page.locator("body").innerText();
      if (/Thinking|Analyzing|Classifying|Retriev|VERIFY|Planning/i.test(body)) {
        sawThinking = true;
        log("analysis progress visible");
        break;
      }
      if (jobId || apiEvents.some((e) => e.url.includes("/api/analysis/run") && e.status === 202)) {
        sawThinking = true;
        log("analysis job enqueued (202)");
        break;
      }
      await page.waitForTimeout(1000);
    }
    if (!sawThinking) log("WARNING: never saw Thinking/job enqueue — continuing anyway");

    let reportText = "";
    let lastLen = 0;
    let stableCount = 0;
    while (Date.now() - startedAt < 15 * 60_000) {
      const body = await page.locator("body").innerText();
      const stillThinking = /Thinking…|Thinking\.\.\.|Analyzing…|Analyzing\.\.\./i.test(body);
      const hasReport =
        /Bottom line|Requirements at a glance|What needs attention|Element-level compliance|✅\s*Present|⚠️\s*Partial|❌\s*Gap|Partially covered/i.test(
          body
        ) && body.length > 2000;

      if (authToken) {
        if (!jobId) {
          try {
            const hist = await fetch(`${BACKEND}/api/analysis/history?limit=1`, {
              headers: { Authorization: `Bearer ${authToken}` },
            }).then((r) => r.json());
            const item = hist?.history?.[0];
            if (item?.jobId) {
              jobId = item.jobId;
              log(`job_id from history=${jobId}`);
            }
            if (item?.sessionId) sessionId = item.sessionId;
          } catch {
            // ignore
          }
        }
        if (jobId) {
          try {
            const job = await fetch(`${BACKEND}/api/jobs/${jobId}`, {
              headers: { Authorization: `Bearer ${authToken}` },
            }).then((r) => r.json());
            const status = job?.status || job?.job?.status;
            const result = job?.result || job?.job?.result;
            if (status === "completed" || status === "failed") {
              log(`job ${jobId} status=${status}`);
              sessionId = result?.sessionId || sessionId;
              reportText =
                result?.renderedOutput ||
                (typeof result === "string" ? result : "") ||
                body;
              if (status === "completed" && reportText && reportText.length > 500) break;
              if (status === "failed") {
                reportText = `JOB FAILED\n${JSON.stringify(job, null, 2)}\n\nUI:\n${body}`;
                break;
              }
            }
          } catch {
            // ignore
          }
        }
      }

      if (!stillThinking && hasReport) {
        if (Math.abs(body.length - lastLen) < 80) {
          stableCount += 1;
        } else {
          stableCount = 0;
        }
        lastLen = body.length;
        if (stableCount >= 2) {
          reportText = body;
          log(`UI report stabilized at ${body.length} chars`);
          break;
        }
      } else {
        lastLen = body.length;
        stableCount = 0;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed > 0 && Math.floor(elapsed / 30000) !== Math.floor((elapsed - 3000) / 30000)) {
        log(`still waiting… ${Math.round(elapsed / 1000)}s body=${body.length} thinking=${stillThinking} job=${jobId || "-"}`);
      }
      await page.waitForTimeout(3000);
    }

    if (authToken && sessionId) {
      try {
        const snap = await fetch(`${BACKEND}/api/analysis/session/${sessionId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }).then((r) => r.json());
        if (snap?.renderedOutput) {
          reportText = snap.renderedOutput;
          log(`session snapshot loaded ${sessionId} chars=${reportText.length}`);
        }
        write(`${PREFIX}-session.json`, JSON.stringify(snap, null, 2));
      } catch (err) {
        log(`session fetch failed: ${err.message}`);
      }
    }

    await page.screenshot({
      path: path.join(OUT_DIR, `${PREFIX}-result.png`),
      fullPage: true,
    });

    if (!reportText) {
      reportText = await page.locator("body").innerText();
    }
    const reportPath = write(`${PREFIX}-ui-report.txt`, reportText);
    write(`${PREFIX}-api-events.json`, JSON.stringify(apiEvents, null, 2));
    write(
      `${PREFIX}-meta.json`,
      JSON.stringify({ jobId, sessionId, apiEventsTail: apiEvents.slice(-30) }, null, 2)
    );
    log(`report saved ${reportPath} chars=${reportText.length}`);
    log("keeping browser open 45s so you can inspect the UI…");
    await page.waitForTimeout(45_000);
    log("done");
  } catch (err) {
    log(`FAIL ${err?.stack || err}`);
    await page
      .screenshot({
        path: path.join(OUT_DIR, `${PREFIX}-error.png`),
        fullPage: true,
      })
      .catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
