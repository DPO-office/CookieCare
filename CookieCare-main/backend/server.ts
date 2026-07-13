import express from "express";
import http from "http";
import path from "path";
import fs from "fs"; // 💡 Added fs to check file paths safely
import { fileURLToPath } from "url"; // 💡 Added for bulletproof ES module path resolution
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

// Initialize Sentry
initSentry(app);

// Middlewares
app.use(corsMiddleware);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
initQueryLogger();

// --- 1. API ROUTES ---
app.use("/api", apiRoutes);

// --- 2. ENVIRONMENT-SPECIFIC STATIC/SPA HANDLING ---
if (config.nodeEnv === "production") {
  // Let's check the absolute most common paths where your single Dockerfile might have dropped the build
  let distPath = path.resolve(process.cwd(), "frontend", "dist");

  // Fallback 1: If it is relative to this server script location (e.g., inside a dist/src folder structure)
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(__dirname, "../frontend/dist");
  }

  // Fallback 2: If the monorepo structure was flattened straight into the root working directory
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(process.cwd(), "dist");
  }

  // Fallback 3: Nested two layers up depending on the build output hierarchy
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(__dirname, "../../frontend/dist");
  }

  logger.info(`[Static Assets] Attempting to serve frontend from resolved path: ${distPath}`);

  // Serve static assets out of the resolved folder
  app.use(express.static(distPath));
  
  app.get("*", (req, res) => {
    // If a request for a static UI file under /assets fallback-routed here, it means express.static missed it
    if (req.path.startsWith('/assets/')) {
      logger.error(`🔴 Asset Mismatch (500): Browser asked for ${req.path}, searched folder location: ${distPath}`);
      return res.status(500).send(`Asset missing inside container directory: ${distPath}`);
    }

    res.sendFile(path.join(distPath, "index.html"), (err) => {
      if (err) {
        logger.error(`🔴 CRITICAL: index.html not found at: ${path.join(distPath, "index.html")}`);
        res.status(500).send("Static UI hosting directory mismatch inside the cloud container.");
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
    const vite = await createViteServer({
      root: path.resolve(process.cwd(), "frontend"),
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: "spa",
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