import express from "express";
import http from "http";
import path from "path";
import { pathToFileURL } from 'url';
import { createServer as createViteServer } from "vite";
import { config } from "./backend/src/config/index.js";
import { validateEnv } from "./backend/src/config/validate.js";
import { initSentry, initSentryErrorHandler } from "./backend/src/config/sentry.js";
import apiRoutes from "./backend/src/routes/index.js";
import { corsMiddleware } from "./backend/src/middleware/cors.js";
import { errorHandler } from "./backend/src/middleware/error.js";
import { initQueryLogger } from "./backend/src/middleware/queryLogger.js";
import { logger } from "./backend/src/utils/logger.js";

const app = express();
const httpServer = http.createServer(app);

// Initialize Sentry before any other middleware
initSentry(app);

// Middlewares
app.use(corsMiddleware);
initQueryLogger();

// Structured logging for requests
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
      userId: (req as any).user?.id,
    }, "Request processed");
  });
  next();
});

// Handle aborted requests BEFORE body parsing
app.use((req, res, next) => {
  req.on("aborted", () => {
    if (!res.headersSent && !res.writableEnded) {
      try {
        res.destroy();
      } catch (_) {
        // ignore
      }
    }
  });
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// API Routes
app.use("/api", apiRoutes);

// Sentry Error Handler (must be after routes, before our custom error handler)
initSentryErrorHandler(app);

// Error Handler
app.use(errorHandler);

async function startServer() {
  validateEnv();
  // Database initialization is decoupled from server startup.
  // Run `npx tsx scripts/setupDb.ts` manually to initialize the database.
  logger.info("Skipping database initialization on server startup. Run `npx tsx scripts/setupDb.ts` to initialize the database.");

  if (config.nodeEnv !== "production") {
    // Bypass external file loading completely to prevent ESM schema URL panic
    const vite = await createViteServer({
      configFile: false,
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: "custom",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist/client");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const port = config.port;
  httpServer.listen(port, "0.0.0.0", () => {
    logger.info(`Server running on http://localhost:${port} [${config.nodeEnv}]`);
  });
}

if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
