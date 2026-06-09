import cors from "cors";
import { config } from "../config/index.js";

const corsOrigins = new Set(
  [
    "http://localhost:5173",
    "http://localhost:3000",
    config.corsOrigin,
    config.vercelUrl,
  ]
    .flatMap((origin) => (origin ? origin.split(",") : []))
    .map((origin) => origin.trim())
    .filter(Boolean)
);

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (
      !origin || 
      corsOrigins.has(origin) || 
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^https?:\/\/[a-z0-9-]+\.app\.github\.dev(:\d+)?$/i.test(origin) ||
      /^https?:\/\/[a-z0-9-]+\.github\.dev(:\d+)?$/i.test(origin) ||
      /^https?:\/\/[a-z0-9-]+\.vercel\.app(:\d+)?$/i.test(origin) ||
      // CRITICAL FIX 1: Explicitly allow Firebase Studio environment domains
      /^https?:\/\/([a-z0-9-]+\.)?firebase\.google\.com(:\d+)?$/i.test(origin) ||
      // CRITICAL FIX 2: Allow Google Cloud Workstations development URLs
      /^https?:\/\/[a-z0-9-]+\.cluster-[a-z0-9]+\.cloudworkstations\.dev(:\d+)?$/i.test(origin) ||
      // Extra fallback for any variations of cloudworkstations
      /cloudworkstations\.dev$/i.test(origin) ||
      process.env.NODE_ENV !== "production" // Fallback for local editor proxies
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});