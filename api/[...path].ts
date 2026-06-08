// Use dynamic import for ESM compatibility
const serverPath = "../dist/server.js";
const serverBundle = await import(serverPath);

const app = serverBundle.default || serverBundle;

export default app;
