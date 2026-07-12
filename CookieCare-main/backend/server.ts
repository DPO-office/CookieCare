import express from "express";
import http from "http";
import path from "path";
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
  // In production, serve the pre-built frontend from frontend/dist
  const distPath = path.resolve(process.cwd(), "frontend", "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
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
