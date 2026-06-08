import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import { config } from "./backend/src/config/index.js";
import { validateEnv } from "./backend/src/config/validate.js";
import { initSentry, initSentryErrorHandler } from "./backend/src/config/sentry.js";
import { dbInit } from "./backend/src/config/initDb.js";
import apiRoutes from "./backend/src/routes/index.js";
import { corsMiddleware } from "./backend/src/middleware/cors.js";
import { errorHandler } from "./backend/src/middleware/error.js";

const app = express();
const httpServer = http.createServer(app);

// Initialize Sentry before any other middleware
initSentry(app);

// Middlewares
app.use(corsMiddleware);

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
  try {
    await dbInit();
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Database initialization failed:", err);
  }

  if (config.nodeEnv !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const port = config.port;
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port} [${config.nodeEnv}]`);
  });
}

if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
