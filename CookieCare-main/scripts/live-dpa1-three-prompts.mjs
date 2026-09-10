/**
 * Upload DPA - 1.pdf from local DPA Templates pack and run 3 lite prompts.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "logs", "analysis", "eval");
const DPA_PATH =
  "C:\\Users\\abhinav.yadav_randst\\Downloads\\DPA Templates-20260907T045915Z-1-001\\DPA Templates\\DPA - 1.pdf";
const EMAIL = process.env.LIVE_EMAIL || "swarnaaishwarya17@gmail.com";
const PASSWORD = process.env.LIVE_PASSWORD || "MamuSecure2026!";
const FRONTEND = process.env.LIVE_FRONTEND || "http://localhost:3000";
const BACKEND = process.env.LIVE_BACKEND || "http://localhost:3000";

const PROMPTS = [
  {
    id: "dsr",
    text: "Review how this agreement addresses data subject rights under GDPR Articles 15–22. Identify: obligations to assist the controller with access, erasure, rectification, and portability requests, defined response timeframes, and any gaps that could result in a GDPR violation.",
  },
  {
    id: "art28",
    text: "Perform a rigorous GDPR Article 28 compliance review of this Data Processing Agreement. Verify: subject matter, duration, nature and purpose of processing, categories of data and data subjects, obligations and rights of the controller, and whether all mandatory Article 28(3) clauses are present and adequate.",
  },
  {
    id: "xfer",
    text: "Analyse all international data transfer provisions. Identify: whether Standard Contractual Clauses, Binding Corporate Rules, or adequacy decisions are referenced, whether Schrems II supplementary measures are addressed, transfers to third countries and the legal basis for each, and any gaps in transfer mechanisms.",
  },
];

function log(msg) {
  const line = `[live-dpa1] ${new Date().toISOString()} ${msg}`;
  console.log(line);
  fs.mkdirSync(OUT, { recursive: true });
  fs.appendFileSync(path.join(OUT, "2026-09-07-live-dpa1-three-run.log"), line + "\n");
}

async function waitHealth(url, label) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status < 500) {
        log(`${label} ready ${r.status}`);
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not ready: ${url}`);
}

async function ensureLite(page) {
  const mode = page.getByRole("button", { name: /Analysis mode:/i });
  if (!(await mode.count())) return;
  const label = await mode.innerText();
  if (/Lite/i.test(label)) return;
  await mode.click();
  await page.getByRole("option", { name: /^Lite$/i }).click().catch(async () => {
    await page.getByText(/^Lite$/i).first().click();
  });
}

async function uploadFromSystem(page) {
  if (!fs.existsSync(DPA_PATH)) throw new Error(`Missing DPA: ${DPA_PATH}`);
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    await fileInput.setInputFiles(DPA_PATH);
    log("uploaded via input[type=file] setInputFiles");
  } else {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: /attach file/i }).click(),
    ]);
    await chooser.setFiles(DPA_PATH);
    log("uploaded via filechooser");
  }
  for (let i = 0; i < 180; i++) {
    const body = await page.locator("body").innerText();
    if (/DPA - 1\.pdf/i.test(body) && !/Uploading/i.test(body)) {
      log("upload visible on composer");
      return;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error("Upload did not finish / DPA - 1.pdf not visible");
}

async function waitReport(page, authToken, startedAt) {
  let jobId = null;
  let sessionId = null;
  let reportText = "";
  while (Date.now() - startedAt < 15 * 60_000) {
    const body = await page.locator("body").innerText();
    const still =
      /Analysis is still writing|Thinking…|Thinking\.\.\.|Analyzing…|Analyzing\.\.\./i.test(
        body
      );
    const hasReport =
      /Bottom line|Requirements at a glance|Element-level compliance/i.test(body) &&
      body.length > 1500 &&
      !still;
    if (authToken && !jobId) {
      try {
        const hist = await fetch(`${BACKEND}/api/analysis/history?limit=3`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }).then((r) => r.json());
        const item = hist?.history?.[0];
        if (item?.jobId) jobId = item.jobId;
        if (item?.sessionId) sessionId = item.sessionId;
      } catch {
        /* ignore */
      }
    }
    if (authToken && jobId) {
      try {
        const job = await fetch(`${BACKEND}/api/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }).then((r) => r.json());
        const st = job.status || job.job?.status;
        const result = job.result || job.job?.result || {};
        if (result.sessionId) sessionId = result.sessionId;
        if (st === "completed" || st === "failed") {
          if (sessionId) {
            const snap = await fetch(`${BACKEND}/api/analysis/session/${sessionId}`, {
              headers: { Authorization: `Bearer ${authToken}` },
            }).then((r) => r.json());
            reportText =
              snap?.renderedOutput ||
              snap?.session?.renderedOutput ||
              body;
          } else {
            reportText = body;
          }
          return { reportText, jobId, sessionId, status: st };
        }
      } catch {
        /* ignore */
      }
    }
    if (hasReport) {
      const idx = body.indexOf("Requirements at a glance");
      reportText = idx >= 0 ? body.slice(idx) : body;
      return { reportText, jobId, sessionId, status: "ui-complete" };
    }
    await page.waitForTimeout(3000);
  }
  return { reportText: await page.locator("body").innerText(), jobId, sessionId, status: "timeout" };
}

async function runOne(page, prompt, freshUpload) {
  log(`=== START ${prompt.id} ===`);
  await page.goto(`${FRONTEND}/analyze`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('textarea[aria-label="Analysis request"], textarea.pcl-input');
  await ensureLite(page);
  if (freshUpload) await uploadFromSystem(page);

  const ta = page.locator('textarea[aria-label="Analysis request"], textarea.pcl-input').first();
  await ta.click();
  await ta.fill(prompt.text);

  let capturedJob = null;
  const onRes = async (res) => {
    try {
      if (
        res.url().includes("/api/analysis/run") &&
        res.request().method() === "POST" &&
        res.status() === 202
      ) {
        const json = await res.json();
        if (json?.job_id) capturedJob = json.job_id;
      }
    } catch {
      /* ignore */
    }
  };
  page.on("response", onRes);

  await page.locator('button.analyze-enter-btn[aria-label="Analyze"]').click();
  const authToken = await page.evaluate(() => localStorage.getItem("lex_token"));
  const startedAt = Date.now();
  const result = await waitReport(page, authToken, startedAt);
  page.off("response", onRes);
  if (capturedJob) result.jobId = capturedJob;

  const prefix = `2026-09-07-live-dpa1-${prompt.id}`;
  fs.writeFileSync(path.join(OUT, `${prefix}.txt`), result.reportText || "", "utf8");
  fs.writeFileSync(
    path.join(OUT, `${prefix}-meta.json`),
    JSON.stringify(
      {
        promptId: prompt.id,
        prompt: prompt.text,
        document: DPA_PATH,
        mode: "lite",
        jobId: result.jobId,
        sessionId: result.sessionId,
        status: result.status,
        elapsedMs: Date.now() - startedAt,
      },
      null,
      2
    )
  );
  await page.screenshot({ path: path.join(OUT, `${prefix}.png`), fullPage: true });
  log(
    `=== DONE ${prompt.id} status=${result.status} job=${result.jobId} session=${result.sessionId} chars=${(result.reportText || "").length} ===`
  );
  return result;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "2026-09-07-live-dpa1-three-run.log"), "");
  log(`DPA exists=${fs.existsSync(DPA_PATH)} path=${DPA_PATH}`);
  await waitHealth(`${BACKEND}/api/analysis/health`, "backend");
  await waitHealth(FRONTEND, "frontend");

  const browser = await chromium.launch({
    headless: process.env.LIVE_HEADLESS === "1",
    channel: process.env.LIVE_BROWSER_CHANNEL || "chrome",
    slowMo: 40,
  }).catch(() => chromium.launch({ headless: process.env.LIVE_HEADLESS === "1" }));

  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);

  await page.goto(`${FRONTEND}/login`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await page.waitForSelector("#auth-email-input");
    await page.fill("#auth-email-input", EMAIL);
    await page.fill("#auth-password-input", PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60_000 });
  }
  log(`logged in ${page.url()}`);

  for (let i = 0; i < PROMPTS.length; i++) {
    await runOne(page, PROMPTS[i], true);
  }

  await browser.close();
  log("all three prompts finished");
}

main().catch((err) => {
  console.error(err);
  fs.appendFileSync(
    path.join(OUT, "2026-09-07-live-dpa1-three-run.log"),
    String(err?.stack || err) + "\n"
  );
  process.exitCode = 1;
});
