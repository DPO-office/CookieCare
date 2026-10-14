import cors from "cors";
import { config } from "../config/index.js";

const corsOrigins = new Set(
  [
    "http://localhost:5173",
    "http://localhost:3000",
    config.corsOrigin,
  ]
    .flatMap((origin) => (origin ? origin.split(",") : []))
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const cloudRunOriginPattern = /^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.[a-z0-9-]+\.run\.app(?::\d+)?$/i;

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (
      corsOrigins.has(origin) ||
      cloudRunOriginPattern.test(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^https?:\/\/[a-z0-9-]+\.app\.github\.dev(:\d+)?$/i.test(origin) ||
      /^https?:\/\/[a-z0-9-]+\.github\.dev(:\d+)?$/i.test(origin) ||
      /^https?:\/\/[a-z0-9-]+\.onrender\.com(:\d+)?$/i.test(origin) ||
      /^https?:\/\/([a-z0-9-]+\.)?firebase\.google\.com(:\d+)?$/i.test(origin) ||
      /^https?:\/\/[a-z0-9-]+\.cluster-[a-z0-9]+\.cloudworkstations\.dev(:\d+)?$/i.test(origin) ||
      /cloudworkstations\.dev$/i.test(origin) ||
      process.env.NODE_ENV !== "production"
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