import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serverBundle = require("../dist/server.cjs");

const app = serverBundle.default || serverBundle;

export default app;
