import * as Sentry from "@sentry/node";
import express from "express";

export function initSentry(app: express.Application) {
  if (!process.env.SENTRY_DSN) {
    console.warn("⚠️ SENTRY_DSN not found. Sentry error tracking is disabled.");
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Performance Monitoring
    tracesSampleRate: 1.0,
  });

  // For Sentry v8+, we use Sentry.setupExpressErrorHandler(app) but for middleware we might need different approach
  // Let's stick to the modern v8/v9 initialization if possible
}

export function initSentryErrorHandler(app: express.Application) {
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }
}
