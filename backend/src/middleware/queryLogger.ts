import { pool } from "../config/database.js";

let isPatched = false;

export const initQueryLogger = () => {
  if (isPatched) return;

  const originalQuery = pool.query.bind(pool);

  // @ts-ignore
  pool.query = (...args: any[]) => {
    const start = Date.now();
    const query = typeof args[0] === 'string' ? args[0] : args[0].text;
    const params = args[1] || [];

    return originalQuery(...args).then((result) => {
      const duration = Date.now() - start;
      // Log query but avoid heavy logging in production if needed
      if (process.env.NODE_ENV !== 'production' || duration > 100) {
        console.log(`[QueryLogger] ${duration}ms | ${query.substring(0, 200)}${query.length > 200 ? '...' : ''}`);
      }
      return result;
    }).catch((err) => {
      const duration = Date.now() - start;
      console.error(`[QueryLogger] FAILED ${duration}ms | ${query} | Error: ${err.message}`);
      throw err;
    });
  };

  isPatched = true;
};

// Middleware is now just a pass-through if we patch at startup,
// or we can just call init once in server.ts
export const queryLoggerMiddleware = (req: any, res: any, next: any) => {
  next();
};
