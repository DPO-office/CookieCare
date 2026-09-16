import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { config } from "./src/config/index.js";
import { validateEnv } from "./src/config/validate.js";
import { initSentry, initSentryErrorHandler } from "./src/config/sentry.js";
import apiRoutes from "./src/routes/index.js";
import { corsMiddleware } from "./src/middleware/cors.js";
import { errorHandler } from "./src/middleware/error.js";
import { initQueryLogger } from "./src/middleware/queryLogger.js";
import { logger } from "./src/utils/logger.js";
import { getDocumentParserReadiness } from "./src/modules/analysis/capabilities/ingest/document-structure/index.js";
import { startStaleJobSweep } from "./src/services/jobs/staleJobSweep.js";

console.log(
  `[server] application modules evaluated NODE_ENV=${config.nodeEnv} PORT=${config.port}`
);

const app = express();
const httpServer = http.createServer(app);

// Get absolute path context for ES Modules safely
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveFrontendDistPath() {
  const candidates = [
    path.resolve(__dirname, "../../frontend/dist"),
    path.resolve(process.cwd(), "frontend", "dist"),
    path.resolve(process.cwd(), "dist"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

// Initialize Sentry
initSentry(app);

// Middlewares
app.use(corsMiddleware);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
initQueryLogger();

app.get("/api/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// --- 1. API ROUTES ---
app.use("/api", apiRoutes);
// Unmatched /api paths must not fall through to Vite (which would proxy
// them back to this same server and fail with ECONNREFUSED / ENOBUFS).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// --- 2. ENVIRONMENT-SPECIFIC STATIC/SPA HANDLING ---
if (config.nodeEnv === "production") {
  const distPath = resolveFrontendDistPath();
  const assetsPath = path.join(distPath, "assets");

  logger.info(`[Static Assets] Serving frontend from resolved path: ${distPath}`);

  const assetsStatic = express.static(assetsPath, {
    fallthrough: false,
    immutable: true,
    maxAge: "1y",
    index: false,
  });

  app.use("/assets", (req, res, next) => {
    assetsStatic(req, res, (err?: unknown) => {
      if (!err) {
        return next();
      }

      if (!res.headersSent) {
        const statusCode = err && typeof err === "object" && "status" in err ? Number((err as { status?: unknown }).status) || 500 : 500;
        res.status(statusCode).type("text/plain").send(statusCode === 404 ? "Asset not found" : "Asset serving failed");
      }
    });
  });

  // The SPA shell must never be cached: it points at immutable hashed bundles,
  // so a stale copy pins the client to an old build with no revalidation.
  app.use(express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-store, must-revalidate");
      }
    },
  }));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith('/assets/')) {
      return res.status(404).type("text/plain").send("Asset not found");
    }

    res.set("Cache-Control", "no-store, must-revalidate");
    res.sendFile(path.join(distPath, "index.html"), (err) => {
      if (err) {
        next(err);
      }
    });
  });
}

// Error Handling (must be after routes)
initSentryErrorHandler(app);
app.use(errorHandler);

async function configureRuntime() {
  validateEnv();

  // Recover jobs stranded in queued/processing by a prior restart/crash (in-
  // process jobs have no worker to resume them) so the UI stops showing them
  // as perpetually "uploading"/"processing".
  startStaleJobSweep();

  if (config.nodeEnv !== "production") {
    // Development: Vite dev server handles SPA + HMR.
    // Keep this import dynamic so production never loads the Vite package.
    const { createServer: createViteServer } = await import("vite");
    process.env.VITE_MIDDLEWARE = "1";
    const frontendRoot = path.resolve(process.cwd(), "frontend");
    const vite = await createViteServer({
      configFile: path.resolve(frontendRoot, "vite.config.ts"),
      root: frontendRoot,
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
        proxy: {},
        // Native fs.watch on Windows throws EBUSY for locked scratch files
        // (e.g. frontend/scripts/_list.txt). An unhandled watcher 'error'
        // kills the whole Node process and aborts in-flight compare jobs.
        watch: {
          ignored: [
            "**/scripts/**",
            "**/*.py",
            "**/.git/**",
            "**/node_modules/**",
          ],
        },
      },
      appType: "spa",
    });
    vite.watcher.on("error", (err: NodeJS.ErrnoException) => {
      logger.warn(
        { err: err.message, path: err.path, code: err.code },
        "[vite] file watcher error ignored"
      );
    });
    app.use(vite.middlewares);
  }
}

async function startServer() {
  await configureRuntime();
  const port = config.port;
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "0.0.0.0", () => {
      httpServer.removeListener("error", reject);
      logger.info(`Server running on http://localhost:${port} [${config.nodeEnv}]`);
      resolve();
    });
  });
}

/** Used by backend/boot.mjs after it has already bound PORT. */
export async function attachToServer() {
  await configureRuntime();
  const parser = await getDocumentParserReadiness();
  logger.info({ parser }, "Application attached");
  if (!parser.ready) {
    logger.error(
      { parser },
      "Docling is not ready. PDF/DOCX uploads will fail until the native addon and .pdfium/.models assets load."
    );
  }
}

if (process.env.NODE_ENV !== "test" && process.env.COOKIECARE_BOOTSTRAP !== "1") {
  startServer().catch((err) => {
    console.error("[server] fatal startup error:", err);
    process.exit(1);
  });
}

export default app;