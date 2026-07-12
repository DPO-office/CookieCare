// Vercel serverless adapter - imports the built backend bundle
// Use dynamic import for ESM compatibility
const serverPath = "../backend/dist/server.js";
const serverBundle = await import(serverPath);

const app = serverBundle.default || serverBundle;

export default app;
