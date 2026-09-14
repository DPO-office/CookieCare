/**
 * Cloud Run / production entry.
 *
 * Bind PORT immediately with Node builtins only, then load the bundled app.
 * The Express graph pulls Playwright, Docling, and the analysis pipeline, and
 * Cloud Run fails the revision if that work happens before the process listens.
 */
import http from "node:http";

process.env.COOKIECARE_BOOTSTRAP = "1";

const port = Number(process.env.PORT) || 8080;
let handler = null;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  if (handler) {
    handler(req, res);
    return;
  }

  const url = (req.url || "").split("?")[0];
  if (url === "/api/healthz") {
    sendJson(res, 200, { status: "starting" });
    return;
  }

  sendJson(res, 503, { error: "Application is starting" });
});

server.on("error", (err) => {
  console.error("[boot] HTTP server error:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("[boot] uncaughtException:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[boot] unhandledRejection:", reason);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[boot] listening on 0.0.0.0:${port} NODE_ENV=${process.env.NODE_ENV || ""}`);
  import("./dist/server.js")
    .then(async (mod) => {
      if (typeof mod.attachToServer === "function") {
        await mod.attachToServer();
      }
      handler = mod.default;
      console.log("[boot] application ready");
    })
    .catch((err) => {
      console.error("[boot] failed to load application:", err);
      process.exit(1);
    });
});
