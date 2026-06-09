import { pool } from "../config/database.js";

let isPatched = false;

export const initQueryLogger = () => {
  if (isPatched) return;

  const originalQuery = pool.query.bind(pool);

  // @ts-ignore
  pool.query = (...args: any[]) => {
    const start = Date.now();
    const queryStr = typeof args[0] === 'string' ? args[0] : args[0].text;
    const params = args[1] || [];

    return originalQuery(...args).then((result) => {
      const duration = Date.now() - start;
      const isSlow = duration > 1000;

      if (process.env.NODE_ENV !== 'production' || isSlow) {
        const status = isSlow ? "⚠️ SLOW_QUERY" : "✅ QUERY";
        console.log(`[QueryLogger] ${status} | ${duration}ms | ${queryStr.substring(0, 500)}${queryStr.length > 500 ? '...' : ''}`);
      }
      return result;
    }).catch((err) => {
      const duration = Date.now() - start;
      console.error(`[QueryLogger] ❌ QUERY_ERROR | ${duration}ms | ${queryStr} | Error: ${err.message}`);
      throw err;
    });
  };

  isPatched = true;
  console.log("✅ QueryLogger initialized.");
};

export const queryLoggerMiddleware = (req: any, res: any, next: any) => {
  // Pass-through since we patched the pool at startup
  next();
};
