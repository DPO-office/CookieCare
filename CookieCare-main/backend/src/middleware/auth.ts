import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { pool, isDatabaseQuotaError } from "../config/database.js";
import { PoolClient } from "pg";

interface JwtPayload {
  id: string;
  email: string;
}

// TypeScript ko batane ke liye ki Express Request mein 'user' exist karta hai
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        status: string;
        role: string;
      };
      dbClient?: PoolClient;
    }
  }
}

type AuthUser = NonNullable<Express.Request["user"]>;

const USER_CACHE_TTL_MS = 2 * 60 * 1000;
const userCache = new Map<string, { user: AuthUser; expiresAt: number }>();

function getCachedUser(id: string): AuthUser | null {
  const hit = userCache.get(id);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    userCache.delete(id);
    return null;
  }
  return hit.user;
}

function setCachedUser(user: AuthUser): void {
  userCache.set(user.id, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  const queryToken = req.query.token;
  
  let token: string | undefined;

  // 1. Pehle normal standard Authorization Header check karein
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    } else {
      return res.status(401).json({ error: "Access denied. Token format must be Bearer <token>." });
    }
  } 
  // 2. FALLBACK: Agar header absent ho, toh query string read karein (SSE Stream validation ke liye)
  else if (queryToken && typeof queryToken === "string") {
    token = queryToken;
  }

  // Agar dono jagah token missing mile
  if (!token) {
    return res.status(401).json({ error: "Access denied. Token missing." });
  }

  // Frontend string string conversion handling
  if (token === "undefined" || token === "null") {
    return res.status(401).json({ error: "Access denied. Token is null or undefined." });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;

    if (config.skipDb) {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.email.split("@")[0] || "Demo user",
        status: "APPROVED",
        role: "ADMIN",
      };
      return next();
    }

    let user = getCachedUser(decoded.id);

    if (!user) {
      const { rows } = await pool.query(
        "SELECT id, email, name, status, role FROM users WHERE id = $1",
        [decoded.id]
      );

      if (rows.length === 0) {
        return res.status(403).json({ error: "Unauthorized or invalid user session." });
      }

      user = rows[0];
      setCachedUser(user);
    }

    if (user.status !== 'APPROVED') {
      return res.status(403).json({ error: "Your account is awaiting admin approval." });
    }

    req.user = user;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: "Invalid or malformed token." });
    }

    if (isDatabaseQuotaError(err)) {
      console.error("Authentication blocked: database data-transfer quota exceeded.");
      return res.status(503).json({
        error: "The database has exceeded its data transfer quota. Upgrade the Neon plan or wait for the quota to reset, then retry.",
        code: "DATABASE_QUOTA_EXCEEDED",
      });
    }

    console.error("Authentication middleware unexpected error:", err);
    return res.status(500).json({ error: "Internal server error during authentication." });
  }
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: "Access denied. Admins only." });
  }
  next();
};