import { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";
import { logger } from "../utils/logger.js";

export interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

export const errorHandler = (err: ApiError, req: Request, res: Response, next: NextFunction): void => {
  const alreadyEnded = res.writableEnded || res.headersSent;
  if (alreadyEnded) {
    return;
  }

  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  const code = err.code || "INTERNAL_ERROR";

  // Structured logging for errors
  logger.error({
    err: {
      message: err.message,
      stack: err.stack,
      code: err.code,
    },
    status,
    url: req.url,
    method: req.method,
    user: (req as any).user?.id,
  }, "API Error occurred");

  // Capture in Sentry if status is 500 or above
  if (status >= 500) {
    Sentry.captureException(err, {
      extra: {
        url: req.url,
        method: req.method,
        user: (req as any).user?.id
      }
    });
  }

  res.status(status).json({
    success: false,
    error: message,
    code: code,
    details: process.env.NODE_ENV === 'development' ? err.details : undefined
  });
};
