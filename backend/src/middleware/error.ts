import { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";

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

  // Log error for debugging
  console.error(`[ErrorHandler] ${status} - ${message}`, {
    stack: err.stack,
    url: req.url,
    method: req.method,
    user: req.user?.id
  });

  // Capture in Sentry if status is 500 or above
  if (status >= 500) {
    Sentry.captureException(err, {
      extra: {
        url: req.url,
        method: req.method,
        user: req.user?.id
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
