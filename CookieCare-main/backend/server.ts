import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { config } from "./src/config/index.js";
import { validateEnv } from "./src/config/validate.js";
import { initSentry, initSentryErrorHandler } from "./src/config/sentry.js";
import apiRoutes from "./src/routes/index.js";
import { corsMiddleware } from "./src/middleware/cors.js";
import { errorHandler } from "./src/middleware/error.js";
import { initQueryLogger } from "./src/middleware/queryLogger.js";
import { logger } from "./src/utils/logger.js";

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

async function startServer() {
  validateEnv();

  if (config.nodeEnv !== "production") {
    // Development: Vite dev server handles SPA + HMR
    // Vite root is the frontend folder
    process.env.VITE_MIDDLEWARE = "1";
    const vite = await createViteServer({
      root: path.resolve(process.cwd(), "frontend"),
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

  const port = config.port;
  httpServer.listen(port, "0.0.0.0", () => {
    logger.info(`Server running on http://localhost:${port} [${config.nodeEnv}]`);
  });
}

// Prevent double-start in test environments
if (process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;