var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config/index.ts
import dotenv from "dotenv";
function numberFromEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
var config, isProduction;
var init_config = __esm({
  "src/config/index.ts"() {
    dotenv.config();
    config = {
      port: Number(process.env.PORT) || 3e3,
      nodeEnv: process.env.NODE_ENV || "development",
      databaseUrl: process.env.DATABASE_URL || "",
      // OpenRouter replaces Gemini as the AI provider
      openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
      openRouterModel: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3-0324",
      openRouterTemperature: numberFromEnv(process.env.OPENROUTER_TEMPERATURE, 0.2),
      openRouterMaxTokens: numberFromEnv(process.env.OPENROUTER_MAX_TOKENS, 4096),
      // Kept for backward compatibility — no longer used for AI calls
      geminiApiKey: process.env.GEMINI_API_KEY || "",
      jwtSecret: process.env.JWT_SECRET || "privsec-ai-enterprise-secret-2026",
      // Fixed: Added the Render production URL as a default fallback
      corsOrigin: process.env.CORS_ORIGIN || "https://privlex-ai.onrender.com"
    };
    isProduction = config.nodeEnv === "production";
  }
});

// src/config/database.ts
import pg from "pg";
var Pool, rawConnectionString, isNeon, isPooler, connectionString, pool;
var init_database = __esm({
  "src/config/database.ts"() {
    init_config();
    ({ Pool } = pg);
    rawConnectionString = config.databaseUrl.trim();
    isNeon = rawConnectionString.includes("neon.tech");
    isPooler = rawConnectionString.includes("-pooler.");
    connectionString = rawConnectionString;
    if (isNeon) {
      connectionString = rawConnectionString.replace(/[?&]sslmode=[^&]*/g, "").replace(/[?&]$/, "").replace(/\?$/, "");
      if (isPooler && !connectionString.includes("pgbouncer=true")) {
        connectionString += (connectionString.includes("?") ? "&" : "?") + "pgbouncer=true";
      }
    }
    pool = new Pool({
      connectionString,
      ssl: isNeon ? { rejectUnauthorized: false } : void 0,
      max: 20,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 6e4,
      keepAlive: true,
      keepAliveInitialDelayMillis: 0
    });
    pool.on("error", (err) => {
      console.error("Unexpected database pool error:", err);
    });
  }
});

// src/utils/crypto.ts
var crypto_exports = {};
__export(crypto_exports, {
  decrypt: () => decrypt,
  decryptData: () => decryptData,
  encrypt: () => encrypt,
  encryptData: () => encryptData
});
import crypto4 from "crypto";
function encryptData(text) {
  if (!text) return "";
  if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes.");
  }
  const iv = crypto4.randomBytes(12);
  const cipher = crypto4.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `LEXGCM_${iv.toString("hex")}:${authTag}:${encrypted}`;
}
function decryptData(text) {
  if (!text) return "";
  if (text.startsWith("LEXGCM_")) {
    try {
      if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length !== 32) {
        throw new Error("ENCRYPTION_KEY must be 32 bytes.");
      }
      const payload = text.replace("LEXGCM_", "");
      const [ivHex, authTagHex, encryptedHex] = payload.split(":");
      if (!ivHex || !authTagHex || !encryptedHex) {
        return "[DECRYPTION_FORMAT_ERROR]";
      }
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const decipher = crypto4.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (err) {
      console.error("Decryption failed:", err);
      (async () => {
        let client;
        try {
          client = await pool.connect();
          await client.query("BEGIN");
          await client.query("SET LOCAL app.current_user_role = 'ADMIN'");
          await client.query(`
            INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
            VALUES ($1, $2, $3)
          `, [null, "decryption_failure", JSON.stringify({ error: err.message, timestamp: (/* @__PURE__ */ new Date()).toISOString() })]);
          await client.query("COMMIT");
        } catch (auditErr) {
          if (client) {
            try {
              await client.query("ROLLBACK");
            } catch (rollbackErr) {
            }
          }
          console.error("Failed to log decryption failure audit:", auditErr);
        } finally {
          if (client) client.release();
        }
      })();
      return "[DECRYPTION_FAILURE]";
    }
  }
  if (text.startsWith("LEXENC_")) {
    try {
      const rawBase64 = text.replace("LEXENC_", "");
      return Buffer.from(rawBase64, "base64").toString("utf-8");
    } catch (err) {
      return "[LEGACY_DECRYPTION_ERROR]";
    }
  }
  return text;
}
var ENCRYPTION_KEY, ALGORITHM, encrypt, decrypt;
var init_crypto = __esm({
  "src/utils/crypto.ts"() {
    init_database();
    ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    ALGORITHM = "aes-256-gcm";
    if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length !== 32) {
      console.warn("\u26A0\uFE0F [SECURITY] ENCRYPTION_KEY is missing or invalid (must be 32 bytes). Encryption/Decryption features will fail.");
    }
    encrypt = encryptData;
    decrypt = decryptData;
  }
});

// src/utils/browserManager.ts
import { chromium } from "playwright";
var BrowserManager, browserManager;
var init_browserManager = __esm({
  "src/utils/browserManager.ts"() {
    BrowserManager = class _BrowserManager {
      constructor() {
        this.browser = null;
        this.launchPromise = null;
        // Track whether we're using a remote endpoint or local launch
        this.usingRemote = false;
        /**
         * Probe whether a Playwright browser can actually be launched or connected.
         *
         * Returns `true` when Playwright is available, `false` when the executable
         * is missing, blocked by Group Policy, or otherwise unlaunchable.
         *
         * The result is cached after the first successful launch so subsequent calls
         * are free once the browser is running.
         */
        this._playwrightAvailable = null;
      }
      static getInstance() {
        if (!_BrowserManager.instance) {
          _BrowserManager.instance = new _BrowserManager();
        }
        return _BrowserManager.instance;
      }
      async launchLocal() {
        console.log("[BrowserManager] Launching local Chromium browser.");
        const browser = await chromium.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
          ]
        });
        this.usingRemote = false;
        return browser;
      }
      async connectRemote(endpoint) {
        console.log("[BrowserManager] Connecting to remote browser endpoint.");
        const browser = await chromium.connectOverCDP(endpoint);
        this.usingRemote = true;
        return browser;
      }
      async getBrowser() {
        if (this.browser && this.browser.isConnected()) {
          return this.browser;
        }
        if (this.launchPromise) {
          return this.launchPromise;
        }
        const endpoint = process.env.BROWSER_ENDPOINT;
        this.launchPromise = (async () => {
          let browser;
          if (endpoint && !endpoint.includes("YOUR_TOKEN_HERE")) {
            try {
              browser = await this.connectRemote(endpoint);
            } catch (remoteErr) {
              console.warn("[BrowserManager] Remote browser failed, falling back to local launch:", remoteErr.message);
              browser = await this.launchLocal();
            }
          } else {
            browser = await this.launchLocal();
          }
          this.browser = browser;
          this.launchPromise = null;
          browser.on("disconnected", () => {
            console.warn("[BrowserManager] Browser disconnected. Will relaunch on next request.");
            this.browser = null;
          });
          return browser;
        })().catch((err) => {
          this.launchPromise = null;
          console.error("[BrowserManager] Failed to start browser:", err);
          throw err;
        });
        return this.launchPromise;
      }
      /**
       * Creates a new browser context. Automatically reconnects if the browser
       * has gone away since the last call.
       */
      async newContext(options) {
        let browser;
        try {
          browser = await this.getBrowser();
        } catch (err) {
          this.browser = null;
          this.launchPromise = null;
          browser = await this.getBrowser();
        }
        if (!browser.isConnected()) {
          this.browser = null;
          browser = await this.launchLocal();
          this.browser = browser;
          browser.on("disconnected", () => {
            console.warn("[BrowserManager] Browser disconnected. Will relaunch on next request.");
            this.browser = null;
          });
        }
        const context = await browser.newContext({
          // Reasonable defaults to avoid detection and reduce resource usage
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          ignoreHTTPSErrors: true,
          ...options
        });
        if (options?.optimizeForScanning) {
          await context.route("**/*", (route2) => {
            const resourceType = route2.request().resourceType();
            if (["image", "font", "media"].includes(resourceType)) {
              return route2.abort();
            }
            return route2.continue();
          });
        }
        return context;
      }
      async newPage(options) {
        const context = await this.newContext(options);
        return context.newPage();
      }
      async cleanup() {
        if (this.browser) {
          try {
            await this.browser.close();
          } catch (_) {
          }
          this.browser = null;
        }
      }
      async isAvailable() {
        if (this.browser && this.browser.isConnected()) {
          this._playwrightAvailable = true;
          return true;
        }
        if (this._playwrightAvailable === false) {
          return false;
        }
        try {
          await this.getBrowser();
          this._playwrightAvailable = true;
          return true;
        } catch (err) {
          console.warn(
            "[BrowserManager] Playwright unavailable:",
            err.message
          );
          this._playwrightAvailable = false;
          return false;
        }
      }
    };
    browserManager = BrowserManager.getInstance();
  }
});

// src/services/websiteScanner/urlValidator.ts
function validateUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    return { valid: false, reason: `Invalid URL format: ${err.message}` };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, reason: `Blocked hostname: ${hostname}` };
  }
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, reason: `Private IP range blocked: ${hostname}` };
    }
  }
  if (parsed.port && BLOCKED_PORTS.has(parsed.port)) {
    return { valid: false, reason: `Blocked port: ${parsed.port}` };
  }
  return { valid: true };
}
function normaliseUrl(raw) {
  return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
}
var BLOCKED_HOSTS, PRIVATE_IP_PATTERNS, BLOCKED_PORTS;
var init_urlValidator = __esm({
  "src/services/websiteScanner/urlValidator.ts"() {
    BLOCKED_HOSTS = /* @__PURE__ */ new Set([
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "169.254.169.254",
      // AWS metadata
      "::1",
      "::ffff:127.0.0.1",
      "localhost.localdomain"
    ]);
    PRIVATE_IP_PATTERNS = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^fc[0-9a-f]{2}:/i,
      // IPv6 unique-local
      /^fe[89ab][0-9a-f]:/i
      // IPv6 link-local
    ];
    BLOCKED_PORTS = /* @__PURE__ */ new Set(["25", "465", "587"]);
  }
});

// src/utils/logger.ts
import pino from "pino";
var isProduction2, logger;
var init_logger = __esm({
  "src/utils/logger.ts"() {
    isProduction2 = process.env.NODE_ENV === "production";
    logger = pino({
      level: process.env.LOG_LEVEL || "info",
      transport: isProduction2 ? void 0 : {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "SYS:standard"
        }
      },
      base: {
        env: process.env.NODE_ENV
      }
    });
  }
});

// src/services/websiteScanner/httpCrawler.ts
function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#039;/gi, "'").replace(/\s{2,}/g, " ").trim();
}
function removeTagBlocks(html, ...tags) {
  let result = html;
  for (const tag of tags) {
    result = result.replace(
      new RegExp(`<${tag}[^>]*/\\s*>`, "gi"),
      ""
    );
    result = result.replace(
      new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}\\s*>`, "gi"),
      ""
    );
  }
  return result;
}
function removeByAttribute(html, attr, value) {
  const pattern = new RegExp(
    `<[a-z][^>]*${attr}\\s*=\\s*["']?${value}["']?[^>]*>[\\s\\S]*?<\\/[a-z]+>`,
    "gi"
  );
  return html.replace(pattern, "");
}
function extractCleanText(html) {
  let cleaned = html;
  cleaned = removeTagBlocks(cleaned, "script", "style", "noscript", "iframe", "object", "embed", "svg");
  cleaned = removeTagBlocks(cleaned, "nav", "header", "footer", "aside");
  cleaned = removeByAttribute(cleaned, "role", "navigation");
  cleaned = removeByAttribute(cleaned, "role", "banner");
  cleaned = removeByAttribute(cleaned, "role", "contentinfo");
  cleaned = cleaned.replace(
    /<[a-z][^>]*(?:id|class)\s*=\s*["'][^"']*(?:cookie-banner|cookie-notice|consent-banner|advertisement|tracking|onetrust|cybot|CookieConsent|sidebar|widget|popup|modal|social-share)[^"']*["'][^>]*>[\s\S]*?<\/[a-z]+>/gi,
    ""
  );
  const mainMatch = /<main[\s>][\s\S]*?<\/main\s*>/i.exec(cleaned) ?? /<article[\s>][\s\S]*?<\/article\s*>/i.exec(cleaned);
  const source = mainMatch ? mainMatch[0] : cleaned;
  return source.split(/\n/).map((line) => stripTags(line).trim()).filter((line) => line.length > 0).join("\n");
}
function extractTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return m ? stripTags(m[1]).trim() : "";
}
function extractMetaContent(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]+content\\s*=\\s*["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)"[^>]+(?:name|property)\\s*=\\s*["']${name}["']`, "i")
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(html);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}
function extractCanonical(html) {
  const m = /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']*)["']/i.exec(html);
  return m?.[1]?.trim() ?? null;
}
function extractLanguage(html) {
  const m = /<html[^>]+lang\s*=\s*["']([^"']+)["']/i.exec(html);
  return m?.[1]?.trim() ?? null;
}
function extractOpenGraph(html) {
  const og = {};
  const pattern = /<meta[^>]+(?:property|name)\s*=\s*["']((?:og:|twitter:|article:)[^"']*)["'][^>]+content\s*=\s*["']([^"']*)["']/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    if (m[1] && m[2]) og[m[1]] = m[2].trim();
  }
  return og;
}
function extractLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a[^>]+href\s*=\s*["']([^"'#][^"']*)["']/gi;
  let m;
  const base = new URL(baseUrl);
  while ((m = pattern.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("javascript:") || raw.startsWith("mailto:")) continue;
    try {
      const resolved = new URL(raw, base).toString();
      links.push(resolved);
    } catch {
    }
  }
  return links;
}
function captureSecurityHeaders(headers) {
  const captured = {};
  for (const name of RELEVANT_HEADERS) {
    const value = headers.get(name);
    if (value) captured[name] = value;
  }
  return captured;
}
async function fetchHtml(url) {
  const validation = validateUrl(url);
  if (!validation.valid) {
    logger.warn(`${TAG} Blocked fetch for invalid URL: ${url} \u2014 ${validation.reason}`);
    return null;
  }
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": DEFAULT_UA, "Accept": "text/html,application/xhtml+xml,*/*" }
    });
    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      logger.debug(`${TAG} Skipping non-HTML response for ${url} (${contentType})`);
      return { html: "", statusCode: resp.status, headers: resp.headers };
    }
    const html = await resp.text();
    return { html, statusCode: resp.status, headers: resp.headers };
  } catch (err) {
    logger.warn(`${TAG} Fetch failed for ${url}: ${err.message}`);
    return null;
  }
}
async function httpExtractPageContent(url) {
  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      url,
      text: "",
      title: "",
      description: null,
      statusCode: 0,
      ok: false,
      error: `URL validation failed: ${validation.reason}`
    };
  }
  const fetched = await fetchHtml(url);
  if (!fetched) {
    return {
      url,
      text: "",
      title: "",
      description: null,
      statusCode: 0,
      ok: false,
      error: "HTTP fetch failed"
    };
  }
  const { html, statusCode } = fetched;
  const ok = statusCode >= 200 && statusCode < 400;
  if (!html) {
    return { url, text: "", title: "", description: null, statusCode, ok };
  }
  const title = extractTitle(html);
  const description = extractMetaContent(html, "description") ?? extractMetaContent(html, "og:description");
  const text = extractCleanText(html);
  logger.debug(`${TAG} Extracted ${text.length} chars from ${url} (HTTP ${statusCode})`);
  return { url, text, title, description, statusCode, ok };
}
async function httpExtractPageMetadata(url) {
  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      url,
      title: null,
      description: null,
      openGraph: {},
      headers: {},
      language: null,
      canonical: null,
      capturedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  let securityHeaders = {};
  try {
    const headResp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8e3),
      headers: { "User-Agent": DEFAULT_UA }
    });
    securityHeaders = captureSecurityHeaders(headResp.headers);
  } catch {
  }
  const fetched = await fetchHtml(url);
  if (!fetched) {
    return {
      url,
      title: null,
      description: null,
      openGraph: {},
      headers: securityHeaders,
      language: null,
      canonical: null,
      capturedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  const { html, headers } = fetched;
  if (Object.keys(securityHeaders).length === 0) {
    securityHeaders = captureSecurityHeaders(headers);
  }
  const title = extractTitle(html) || null;
  const description = extractMetaContent(html, "description") ?? extractMetaContent(html, "og:description") ?? null;
  const openGraph = extractOpenGraph(html);
  const language = extractLanguage(html);
  const canonical = extractCanonical(html);
  logger.debug(`${TAG} Metadata captured for ${url} (HTTP fallback)`);
  return {
    url,
    title,
    description,
    openGraph,
    headers: securityHeaders,
    language,
    canonical,
    capturedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function httpCrawlLinks(rootUrl, domain, limit, existingUrls) {
  const fetched = await fetchHtml(rootUrl);
  if (!fetched || !fetched.html) return 0;
  const rawLinks = extractLinks(fetched.html, rootUrl);
  let added = 0;
  for (const link of rawLinks) {
    if (existingUrls.size >= limit) break;
    try {
      const u = new URL(link);
      if (u.hostname === domain && (u.protocol === "http:" || u.protocol === "https:") && !u.hash && validateUrl(link).valid && !existingUrls.has(link)) {
        existingUrls.add(link);
        added++;
      }
    } catch {
    }
  }
  logger.debug(`${TAG} HTTP link crawl found ${added} new URLs on ${rootUrl}`);
  return added;
}
var TAG, DEFAULT_UA, FETCH_TIMEOUT_MS, RELEVANT_HEADERS;
var init_httpCrawler = __esm({
  "src/services/websiteScanner/httpCrawler.ts"() {
    init_urlValidator();
    init_logger();
    TAG = "[HttpCrawler]";
    DEFAULT_UA = "CookieCare-Scanner/1.0";
    FETCH_TIMEOUT_MS = 2e4;
    RELEVANT_HEADERS = [
      "content-security-policy",
      "strict-transport-security",
      "x-content-type-options",
      "x-frame-options",
      "permissions-policy",
      "referrer-policy",
      "x-xss-protection",
      "server",
      "x-powered-by",
      "content-language"
    ];
  }
});

// src/services/websiteScanner/contentExtractor.ts
var contentExtractor_exports = {};
__export(contentExtractor_exports, {
  extractMultiplePages: () => extractMultiplePages,
  extractPageContent: () => extractPageContent
});
async function extractPageContent(url) {
  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      url,
      text: "",
      title: "",
      description: null,
      statusCode: 0,
      ok: false,
      error: `URL validation failed: ${validation.reason}`
    };
  }
  const playwrightOk = await browserManager.isAvailable();
  if (!playwrightOk) {
    logger.warn(`${TAG3} [WebsiteScanner] Playwright unavailable. Falling back to HTTP crawler.`);
    return httpExtractPageContent(url);
  }
  logger.info(`${TAG3} [WebsiteScanner] Using Playwright`);
  let context;
  try {
    context = await browserManager.newContext({ optimizeForScanning: true });
    const page = await context.newPage();
    let statusCode = 0;
    page.on("response", (resp) => {
      if (resp.url() === url || resp.url().startsWith(url)) {
        statusCode = resp.status();
      }
    });
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 2e4 });
    } catch (navErr) {
      logger.warn(`${TAG3} Navigation failed for ${url}: ${navErr.message}`);
      return {
        url,
        text: "",
        title: "",
        description: null,
        statusCode,
        ok: false,
        error: navErr.message
      };
    }
    const { title, description, text } = await page.evaluate(
      (noiseSelectors) => {
        const document = globalThis.document;
        document.querySelectorAll(noiseSelectors).forEach((el) => el.remove());
        const title2 = document.title ?? "";
        const descMeta = document.querySelector('meta[name="description"]') ?? document.querySelector('meta[property="og:description"]');
        const description2 = descMeta?.getAttribute("content") ?? null;
        const mainEl = document.querySelector("main") ?? document.querySelector('[role="main"]') ?? document.querySelector("article") ?? document.body;
        const rawText = mainEl?.innerText ?? "";
        const text2 = rawText.split(/\n+/).map((line) => line.trim()).filter((line) => line.length > 0).join("\n");
        return { title: title2, description: description2, text: text2 };
      },
      NOISE_SELECTORS
    );
    const ok = statusCode >= 200 && statusCode < 400;
    logger.debug(`${TAG3} Extracted ${text.length} chars from ${url} (status ${statusCode})`);
    return { url, text, title, description, statusCode, ok };
  } catch (err) {
    logger.error(`${TAG3} Unexpected error extracting ${url}: ${err.message}`);
    return {
      url,
      text: "",
      title: "",
      description: null,
      statusCode: 0,
      ok: false,
      error: err.message
    };
  } finally {
    if (context) await context.close().catch(() => {
    });
  }
}
async function extractMultiplePages(urls) {
  const results = [];
  for (const url of urls) {
    const result = await extractPageContent(url);
    results.push(result);
  }
  return results;
}
var TAG3, NOISE_SELECTORS;
var init_contentExtractor = __esm({
  "src/services/websiteScanner/contentExtractor.ts"() {
    init_browserManager();
    init_urlValidator();
    init_logger();
    init_httpCrawler();
    TAG3 = "[ContentExtractor]";
    NOISE_SELECTORS = [
      "nav",
      "header",
      "footer",
      "aside",
      "script",
      "style",
      "noscript",
      "iframe",
      "object",
      "embed",
      // Cookie/consent banners
      "#onetrust-consent-sdk",
      "#CybotCookiebotDialog",
      ".cookie-banner",
      ".cookie-notice",
      ".consent-banner",
      // Ads & tracking
      '[class*="advertisement"]',
      '[class*="tracking"]',
      '[id*="ad-"]',
      '[id*="ads-"]',
      ".ad",
      ".ads",
      // Common navigation wrappers
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      // Social share / sidebar widgets
      ".social-share",
      ".sidebar",
      ".widget",
      ".popup",
      ".modal"
    ].join(", ");
  }
});

// server.ts
init_config();
import express2 from "express";
import http from "http";
import path2 from "path";
import fs2 from "fs";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createServer as createViteServer } from "vite";

// src/config/validate.ts
init_config();
function validateEnv() {
  const required = [
    { key: "DATABASE_URL", value: config.databaseUrl },
    { key: "OPENROUTER_API_KEY", value: config.openRouterApiKey },
    { key: "ENCRYPTION_KEY", value: process.env.ENCRYPTION_KEY }
  ];
  const missing = required.filter((item) => !item.value || item.value.trim() === "");
  if (missing.length > 0) {
    if (process.env.NODE_ENV === "test") {
      console.warn("\u26A0\uFE0F Skipping env validation in test mode.");
      return;
    }
    console.error("\u274C [FATAL] Missing required environment variables:");
    missing.forEach((item) => console.error(`   - ${item.key}`));
    console.error("\nPlease ensure your .env file or environment settings are correct.");
    process.exit(1);
  }
  if (process.env.ENCRYPTION_KEY && Buffer.from(process.env.ENCRYPTION_KEY).length !== 32) {
    console.error("\u274C [FATAL] ENCRYPTION_KEY must be exactly 32 bytes.");
    process.exit(1);
  }
  console.log("\u2705 Environment validation successful.");
}

// src/config/sentry.ts
import * as Sentry from "@sentry/node";
function initSentry(app2) {
  if (!process.env.SENTRY_DSN) {
    console.warn("\u26A0\uFE0F SENTRY_DSN not found. Sentry error tracking is disabled.");
    return;
  }
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Performance Monitoring
    tracesSampleRate: 1
  });
}
function initSentryErrorHandler(app2) {
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app2);
  }
}

// src/routes/index.ts
init_database();
import { Router as Router16 } from "express";

// src/routes/auth.ts
import { Router } from "express";

// src/controllers/auth.ts
init_database();
init_config();
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto3 from "crypto";

// src/utils/dbUtils.ts
init_database();
async function withTransaction(userId, userRole, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sanitizedId = userId.replace(/'/g, "''");
    const sanitizedRole = userRole.replace(/'/g, "''");
    await client.query(`SET LOCAL app.current_user_id = '${sanitizedId}'`);
    await client.query(`SET LOCAL app.current_user_role = '${sanitizedRole}'`);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// src/controllers/folders.ts
import crypto2 from "crypto";
var DEFAULT_FOLDER_NAME = "Uploaded Documents";
async function getOrCreateDefaultFolder(userId, userRole = "USER") {
  return withTransaction(userId, userRole, async (client) => {
    const { rows } = await client.query(
      "SELECT id FROM folders WHERE user_id = $1 AND name = $2 LIMIT 1",
      [userId, DEFAULT_FOLDER_NAME]
    );
    if (rows.length > 0) {
      return rows[0].id;
    }
    const folderId = "fld_" + crypto2.randomUUID();
    await client.query(
      "INSERT INTO folders (id, name, user_id) VALUES ($1, $2, $3)",
      [folderId, DEFAULT_FOLDER_NAME, userId]
    );
    console.log(`[defaultFolder] Created "${DEFAULT_FOLDER_NAME}" (${folderId}) for user ${userId}`);
    return folderId;
  });
}
async function migrateUnassignedDocuments(userId, defaultFolderId, userRole = "USER") {
  await withTransaction(userId, userRole, async (client) => {
    const result = await client.query(
      "UPDATE files SET folder_id = $1 WHERE creator_id = $2 AND folder_id IS NULL",
      [defaultFolderId, userId]
    );
    if ((result.rowCount ?? 0) > 0) {
      console.log(`[defaultFolder] Migrated ${result.rowCount} unassigned doc(s) for user ${userId} \u2192 folder ${defaultFolderId}`);
    }
  });
}
var getFolders = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const defaultFolderId = await getOrCreateDefaultFolder(userId, userRole);
    await migrateUnassignedDocuments(userId, defaultFolderId, userRole);
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows: rows2 } = await client.query(
        "SELECT * FROM folders WHERE user_id = current_setting('app.current_user_id', true) ORDER BY created_at DESC"
      );
      return rows2;
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var createFolder = async (req, res) => {
  const { name } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  if (!name) return res.status(400).json({ error: "Folder name is required." });
  try {
    const id = "fld_" + crypto2.randomUUID();
    const row = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "INSERT INTO folders (id, name, user_id) VALUES ($1, $2, $3) RETURNING *",
        [id, name, userId]
      );
      return rows[0];
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var deleteFolder = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows: folderRows } = await client.query(
        "SELECT name FROM folders WHERE id = $1",
        [req.params.id]
      );
      if (folderRows.length > 0 && folderRows[0].name === DEFAULT_FOLDER_NAME) {
        throw new Error("DEFAULT_FOLDER_PROTECTED");
      }
      const result = await client.query(
        "DELETE FROM folders WHERE id = $1",
        [req.params.id]
      );
      if (result.rowCount === 0) throw new Error("Folder not found.");
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "folder_delete", JSON.stringify({ folderId: req.params.id })]);
    });
    res.json({ success: true });
  } catch (err) {
    if (err.message === "DEFAULT_FOLDER_PROTECTED") {
      return res.status(403).json({ error: "The 'Uploaded Documents' folder cannot be deleted." });
    }
    res.status(err.message === "Folder not found." ? 404 : 500).json({ error: err.message });
  }
};

// src/controllers/auth.ts
var register = async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Please enter all required fields." });
  }
  const normalizedEmail = email.toLowerCase();
  const newUserId = "user_" + crypto3.randomUUID();
  try {
    const checkMail = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (checkMail.rows.length > 0) {
      return res.status(400).json({ error: "Email already exists." });
    }
    const passwordHash = await argon2.hash(password);
    await pool.query(
      "INSERT INTO users (id, email, name, password_hash, status, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [newUserId, normalizedEmail, name, passwordHash, "PENDING_APPROVAL", "USER"]
    );
    return res.status(201).json({ message: "Account created successfully. Awaiting administrator approval." });
  } catch (err) {
    console.error("Registration failed:", err);
    return res.status(500).json({ error: "Registration failed." });
  }
};
var login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing identity credentials" });
  }
  const normalizedEmail = email.toLowerCase();
  try {
    const { rows } = await pool.query(
      "SELECT id, email, name, password_hash, status, role FROM users WHERE email = $1",
      [normalizedEmail]
    ).catch((dbErr) => {
      console.error("Database query failed during login:", dbErr);
      throw new Error("DATABASE_ERROR");
    });
    if (rows.length > 0) {
      const user = rows[0];
      const isPasswordValid = await argon2.verify(user.password_hash, password);
      if (isPasswordValid) {
        if (user.status !== "APPROVED") {
          return res.status(403).json({ error: "Your account is awaiting admin approval." });
        }
        const token = jwt.sign(
          { id: user.id, email: user.email },
          config.jwtSecret,
          { expiresIn: "24h" }
        );
        getOrCreateDefaultFolder(user.id, user.role).then((folderId) => migrateUnassignedDocuments(user.id, folderId, user.role)).catch((err) => console.warn("[defaultFolder] Setup on login failed:", err));
        return res.json({
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            status: user.status,
            role: user.role
          }
        });
      }
    }
  } catch (err) {
    console.error("Login failed:", err);
    if (err.message === "DATABASE_ERROR") {
      return res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
    }
    return res.status(500).json({ error: "Login failed due to an internal server error." });
  }
  return res.status(401).json({ error: "Invalid email or password." });
};

// src/routes/auth.ts
var router = Router();
router.post("/register", register);
router.post("/login", login);
var auth_default = router;

// src/routes/admin.ts
import { Router as Router2 } from "express";

// src/middleware/auth.ts
init_config();
init_database();
import jwt2 from "jsonwebtoken";
var authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const queryToken = req.query.token;
  let token;
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    } else {
      return res.status(401).json({ error: "Access denied. Token format must be Bearer <token>." });
    }
  } else if (queryToken && typeof queryToken === "string") {
    token = queryToken;
  }
  if (!token) {
    return res.status(401).json({ error: "Access denied. Token missing." });
  }
  if (token === "undefined" || token === "null") {
    return res.status(401).json({ error: "Access denied. Token is null or undefined." });
  }
  try {
    const decoded = jwt2.verify(token, config.jwtSecret);
    const { rows } = await pool.query(
      "SELECT id, email, name, status, role FROM users WHERE id = $1",
      [decoded.id]
    );
    if (rows.length === 0) {
      return res.status(403).json({ error: "Unauthorized or invalid user session." });
    }
    const user = rows[0];
    if (user.status !== "APPROVED") {
      return res.status(403).json({ error: "Your account is awaiting admin approval." });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(403).json({ error: "Invalid or malformed token." });
    }
    console.error("Authentication middleware unexpected error:", err);
    return res.status(500).json({ error: "Internal server error during authentication." });
  }
};
var isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Access denied. Admins only." });
  }
  next();
};

// src/controllers/admin.ts
init_database();

// src/RAG/ragService.ts
init_database();
function sanitizeText(text) {
  return text.replace(/\0/g, "");
}
function splitIntoClauseAwareChunks(content) {
  const paragraphs = content.split(/\n\n+/);
  const chunks = [];
  let currentChunk = "";
  const maxChunkLength = 800;
  const overlapLength = 150;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    if ((currentChunk + "\n\n" + trimmed).length <= maxChunkLength) {
      currentChunk = currentChunk ? currentChunk + "\n\n" + trimmed : trimmed;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      const lastPart = currentChunk.substring(Math.max(0, currentChunk.length - overlapLength));
      const overlapText = lastPart.includes("\n") ? lastPart.substring(lastPart.indexOf("\n") + 1) : lastPart;
      currentChunk = overlapText ? overlapText.trim() + "\n\n" + trimmed : trimmed;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks.filter((c) => c.trim().length > 15);
}
async function embedText(_text) {
  return null;
}
async function chunkAndIndexDocument(fileId, content, userId) {
  const cleanedContent = sanitizeText(content);
  const chunks = splitIntoClauseAwareChunks(cleanedContent);
  const processedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    const vector = await embedText(chunks[i]);
    processedChunks.push({
      index: i,
      content: chunks[i],
      // null embedding stored as NULL — chunk is still searchable via lexical search
      embedding: vector ? `[${vector.join(",")}]` : null
    });
  }
  await withTransaction(userId, "USER", async (client) => {
    for (const chunk of processedChunks) {
      await client.query(
        "INSERT INTO legal_document_chunks (file_id, user_id, chunk_index, content, embedding) VALUES ($1, $2, $3, $4, $5)",
        [fileId, userId, chunk.index, chunk.content, chunk.embedding]
      );
    }
  });
}
async function searchHybrid(query, userId, fileIds, folderIds) {
  const embedding = await embedText(query);
  const hasEmbedding = embedding !== null;
  const vectorStr = hasEmbedding ? `[${embedding.join(",")}]` : null;
  let resolvedFolderIds;
  let includeNullFolder = false;
  if (folderIds && folderIds.length > 0) {
    const realFolderIds = folderIds.filter((id) => id !== "root");
    includeNullFolder = folderIds.includes("root");
    resolvedFolderIds = realFolderIds.length > 0 ? realFolderIds : void 0;
  }
  const buildFolderFilter = (startIdx, params) => {
    const parts = [];
    let idx = startIdx;
    if (resolvedFolderIds && resolvedFolderIds.length > 0) {
      parts.push(`file_id IN (SELECT id FROM files WHERE folder_id = ANY($${idx++}))`);
      params.push(resolvedFolderIds);
    }
    if (includeNullFolder) {
      parts.push(`file_id IN (SELECT id FROM files WHERE folder_id IS NULL)`);
    }
    if (parts.length === 0) return { sql: "", params, nextIdx: idx };
    return { sql: ` AND (${parts.join(" OR ")})`, params, nextIdx: idx };
  };
  return await withTransaction(userId, "USER", async (client) => {
    console.log(`[searchHybrid] userId=${userId} query="${query.substring(0, 80)}" folderIds=${JSON.stringify(folderIds)} resolvedFolderIds=${JSON.stringify(resolvedFolderIds)} includeNullFolder=${includeNullFolder}`);
    try {
      let countSql = `SELECT COUNT(*) FROM legal_document_chunks WHERE user_id = $1`;
      const countParams = [userId];
      if (fileIds && fileIds.length > 0) {
        countSql += ` AND file_id = ANY($2)`;
        countParams.push(fileIds);
      } else if (resolvedFolderIds && resolvedFolderIds.length > 0) {
        const folderParts = [
          `file_id IN (SELECT id FROM files WHERE folder_id = ANY($2))`
        ];
        countParams.push(resolvedFolderIds);
        if (includeNullFolder) {
          folderParts.push(`file_id IN (SELECT id FROM files WHERE folder_id IS NULL)`);
        }
        countSql += ` AND (${folderParts.join(" OR ")})`;
      } else if (includeNullFolder) {
        countSql += ` AND file_id IN (SELECT id FROM files WHERE folder_id IS NULL)`;
      }
      const { rows: countRows } = await client.query(countSql, countParams);
      console.log(`[searchHybrid] Available chunks in scope: ${countRows[0]?.count ?? 0}`);
    } catch (countErr) {
      console.warn("[searchHybrid] Count query failed:", countErr.message);
    }
    let semanticRows = [];
    if (hasEmbedding) {
      const semanticParams = [userId, vectorStr];
      let sIdx = 3;
      let fileFilterSql2 = "";
      if (fileIds && fileIds.length > 0) {
        fileFilterSql2 += ` AND file_id = ANY($${sIdx++})`;
        semanticParams.push(fileIds);
      }
      const folderFilter2 = buildFolderFilter(sIdx, semanticParams);
      sIdx = folderFilter2.nextIdx;
      const semanticQuerySql = `
        SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title
        FROM legal_document_chunks
        WHERE user_id = $1
        ${fileFilterSql2}
        ${folderFilter2.sql}
        ORDER BY embedding <=> $2::vector
        LIMIT 20
      `;
      try {
        const result = await client.query(semanticQuerySql, folderFilter2.params);
        semanticRows = result.rows;
      } catch (err) {
        console.warn("[RAG] Semantic search failed, falling back to lexical only:", err.message);
      }
    }
    const lexicalParams = [userId, query, `%${query}%`];
    let lIdx = 4;
    let fileFilterSql = "";
    if (fileIds && fileIds.length > 0) {
      fileFilterSql += ` AND file_id = ANY($${lIdx++})`;
      lexicalParams.push(fileIds);
    }
    const folderFilter = buildFolderFilter(lIdx, lexicalParams);
    lIdx = folderFilter.nextIdx;
    const lexicalQuerySql = `
      SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title,
             ts_rank(to_tsvector('english', content), plainto_tsquery('english', $2)) as fts_rank
      FROM legal_document_chunks
      WHERE user_id = $1
        AND (to_tsvector('english', content) @@ plainto_tsquery('english', $2) OR content ILIKE $3)
        ${fileFilterSql}
        ${folderFilter.sql}
      ORDER BY fts_rank DESC, id
      LIMIT 20
    `;
    let lexicalRows = [];
    try {
      const { rows } = await client.query(lexicalQuerySql, folderFilter.params);
      lexicalRows = rows;
    } catch (lexErr) {
      console.warn("[RAG] Lexical query failed:", lexErr.message);
    }
    if (semanticRows.length === 0 && lexicalRows.length === 0) {
      console.log("[searchHybrid] Primary queries returned 0 results \u2014 attempting broad fallback scan");
      const broadTerms = [
        "indemnity",
        "liability",
        "termination",
        "confidential",
        "intellectual property",
        "payment",
        "governing law",
        "compliance",
        "data protection",
        "obligation"
      ];
      const broadPattern = `%(${broadTerms.join("|")})%`;
      const broadParams = [userId];
      let bIdx = 2;
      let bFileFilterSql = "";
      if (fileIds && fileIds.length > 0) {
        bFileFilterSql += ` AND file_id = ANY($${bIdx++})`;
        broadParams.push(fileIds);
      }
      const bFolderFilter = buildFolderFilter(bIdx, broadParams);
      bIdx = bFolderFilter.nextIdx;
      const broadSql = `
        SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title,
               1.0 as fts_rank
        FROM legal_document_chunks
        WHERE user_id = $1
          ${bFileFilterSql}
          ${bFolderFilter.sql}
          AND content ~* $${bIdx}
        LIMIT 20
      `;
      try {
        const { rows: broadRows } = await client.query(broadSql, bFolderFilter.params.concat([broadPattern]));
        if (broadRows.length > 0) {
          console.log(`[searchHybrid] Broad fallback returned ${broadRows.length} chunk(s)`);
          lexicalRows = broadRows;
        } else {
          console.log("[searchHybrid] Broad fallback also empty \u2014 returning any available chunks in scope");
          const anyParams = [userId];
          let aIdx = 2;
          let aFileFilterSql = "";
          if (fileIds && fileIds.length > 0) {
            aFileFilterSql += ` AND file_id = ANY($${aIdx++})`;
            anyParams.push(fileIds);
          }
          const aFolderFilter = buildFolderFilter(aIdx, anyParams);
          const anySql = `
            SELECT id, content, file_id, (SELECT title FROM files WHERE id = file_id) as title,
                   0.5 as fts_rank
            FROM legal_document_chunks
            WHERE user_id = $1
              ${aFileFilterSql}
              ${aFolderFilter.sql}
            ORDER BY chunk_index ASC
            LIMIT 20
          `;
          const { rows: anyRows } = await client.query(anySql, aFolderFilter.params);
          console.log(`[searchHybrid] Last-resort scan returned ${anyRows.length} chunk(s)`);
          lexicalRows = anyRows;
        }
      } catch (broadErr) {
        console.warn("[RAG] Broad fallback failed:", broadErr.message);
      }
    }
    console.log(`[searchHybrid] Final \u2014 semantic: ${semanticRows.length}, lexical: ${lexicalRows.length}`);
    const rrfMap = /* @__PURE__ */ new Map();
    semanticRows.forEach((row, index) => {
      const key = `${row.file_id}_${row.content.substring(0, 50)}`;
      rrfMap.set(key, { doc: row, semanticRank: index + 1, lexicalRank: Infinity });
    });
    lexicalRows.forEach((row, index) => {
      const key = `${row.file_id}_${row.content.substring(0, 50)}`;
      if (rrfMap.has(key)) {
        rrfMap.get(key).lexicalRank = index + 1;
      } else {
        rrfMap.set(key, { doc: row, semanticRank: Infinity, lexicalRank: index + 1 });
      }
    });
    const fusedResults = Array.from(rrfMap.values()).map((item) => {
      const semScore = item.semanticRank === Infinity ? 0 : 1 / (60 + item.semanticRank);
      const lexScore = item.lexicalRank === Infinity ? 0 : 1 / (60 + item.lexicalRank);
      const rrfScore = semScore * 0.7 + lexScore * 0.3;
      return {
        ...item.doc,
        rrfScore
      };
    });
    fusedResults.sort((a, b) => b.rrfScore - a.rrfScore);
    const finalResults = fusedResults.slice(0, 5);
    console.log(`[searchHybrid] Returning ${finalResults.length} chunk(s): ${finalResults.map((r) => r.title ?? r.file_id).join(", ")}`);
    return finalResults;
  });
}
async function reindexUnchunkedDocuments(userId) {
  const { decrypt: decrypt2 } = await Promise.resolve().then(() => (init_crypto(), crypto_exports));
  const { rows: files } = await pool.query(
    `SELECT f.id, f.content, f.is_encrypted
     FROM files f
     WHERE f.creator_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM legal_document_chunks ldc WHERE ldc.file_id = f.id
       )
       AND f.content IS NOT NULL
       AND f.content <> ''`,
    [userId]
  );
  let indexed = 0;
  let skipped = 0;
  for (const file of files) {
    try {
      const plaintext = file.is_encrypted ? decrypt2(file.content) : file.content;
      if (!plaintext || plaintext.trim().length < 30) {
        skipped++;
        continue;
      }
      await chunkAndIndexDocument(file.id, plaintext, userId);
      indexed++;
      console.log(`[reindexUnchunkedDocuments] Indexed file ${file.id} for user ${userId}`);
    } catch (err) {
      console.warn(`[reindexUnchunkedDocuments] Failed for file ${file.id}:`, err.message);
      skipped++;
    }
  }
  console.log(`[reindexUnchunkedDocuments] Done \u2014 indexed: ${indexed}, skipped: ${skipped}`);
  return { indexed, skipped };
}

// src/controllers/admin.ts
var approveUser = async (req, res) => {
  const { userId, role, status } = req.body;
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;
  if (!userId) {
    return res.status(400).json({ error: "userId is required." });
  }
  try {
    const finalRole = role || "USER";
    const finalStatus = status || "APPROVED";
    await withTransaction(currentUserId, currentUserRole, async (client) => {
      await client.query(
        "UPDATE users SET status = $1, role = $2, approved_at = CASE WHEN $1 = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE approved_at END WHERE id = $3",
        [finalStatus, finalRole, userId]
      );
    });
    res.json({ success: true, message: `User updated to ${finalStatus} with role ${finalRole}.` });
  } catch (error) {
    console.error("Admin user update failed:", error);
    res.status(500).json({ error: "Failed to update user." });
  }
};
var getAllUsers = async (req, res) => {
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;
  try {
    const rows = await withTransaction(currentUserId, currentUserRole, async (client) => {
      const { rows: rows2 } = await client.query(
        "SELECT id, email, name, status, role, created_at FROM users ORDER BY created_at DESC"
      );
      return rows2;
    });
    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch users:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
};
var getPendingUsers = async (req, res) => {
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;
  try {
    const rows = await withTransaction(currentUserId, currentUserRole, async (client) => {
      const { rows: rows2 } = await client.query(
        "SELECT id, email, name, status, role, created_at FROM users WHERE status = 'PENDING_APPROVAL' ORDER BY created_at DESC"
      );
      return rows2;
    });
    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch pending users:", err);
    res.status(500).json({ error: "Failed to fetch pending users." });
  }
};
var reindexChunks = async (req, res) => {
  const targetUserId = req.body?.userId;
  try {
    if (targetUserId) {
      const result = await reindexUnchunkedDocuments(targetUserId);
      return res.json({ success: true, userId: targetUserId, ...result });
    }
    const { rows: users } = await pool.query("SELECT id FROM users");
    let totalIndexed = 0;
    let totalSkipped = 0;
    for (const user of users) {
      const result = await reindexUnchunkedDocuments(user.id);
      totalIndexed += result.indexed;
      totalSkipped += result.skipped;
    }
    return res.json({ success: true, totalIndexed, totalSkipped });
  } catch (err) {
    console.error("[reindexChunks] Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// src/routes/admin.ts
var router2 = Router2();
router2.patch("/users/update", authenticateToken, isAdmin, approveUser);
router2.get("/users", authenticateToken, isAdmin, getAllUsers);
router2.get("/pending-users", authenticateToken, isAdmin, getPendingUsers);
router2.post("/reindex-chunks", authenticateToken, isAdmin, reindexChunks);
var admin_default = router2;

// src/routes/documents.ts
import { Router as Router3 } from "express";

// src/controllers/documents.ts
init_database();

// src/services/jobQueue.ts
init_database();

// src/modules/drafting/config/model-specs.ts
var PROVIDER_TASK_PRESETS = {
  ["GEMINI" /* GEMINI */]: {
    ["FAST_STITCH" /* FAST_STITCH */]: {
      model: "gemini-2.5-flash" /* GEMINI_2_5_FLASH */,
      temperature: 0.1
    },
    ["COMPLEX_DRAFT" /* COMPLEX_DRAFT */]: {
      model: "gemini-2.5-pro" /* GEMINI_2_5_PRO */,
      temperature: 0,
      maxOutputTokens: 8192
    },
    ["STRUCTURAL_JSON" /* STRUCTURAL_JSON */]: {
      model: "gemini-2.5-pro" /* GEMINI_2_5_PRO */,
      temperature: 0,
      responseMimeType: "application/json"
    },
    ["STRUCTURAL_JSON_LITE" /* STRUCTURAL_JSON_LITE */]: {
      model: "gemini-2.5-flash" /* GEMINI_2_5_FLASH */,
      temperature: 0,
      responseMimeType: "application/json"
    },
    ["REFINEMENT" /* REFINEMENT */]: {
      model: "gemini-2.5-flash" /* GEMINI_2_5_FLASH */,
      temperature: 0.2
    }
  },
  ["OPENROUTER" /* OPENROUTER */]: {
    ["FAST_STITCH" /* FAST_STITCH */]: {
      model: "meta-llama/llama-3.3-70b-instruct" /* LLAMA_3_3_70B */,
      temperature: 0.1
    },
    ["COMPLEX_DRAFT" /* COMPLEX_DRAFT */]: {
      model: "anthropic/claude-3.5-sonnet" /* CLAUDE_3_5_SONNET */,
      temperature: 0
    },
    ["STRUCTURAL_JSON" /* STRUCTURAL_JSON */]: {
      model: "openai/gpt-4o-mini" /* GPT_4O_MINI */,
      temperature: 0,
      responseMimeType: "application/json"
    },
    ["STRUCTURAL_JSON_LITE" /* STRUCTURAL_JSON_LITE */]: {
      model: "anthropic/claude-3.5-sonnet" /* CLAUDE_3_5_SONNET */,
      temperature: 0,
      responseMimeType: "application/json"
    },
    ["REFINEMENT" /* REFINEMENT */]: {
      model: "meta-llama/llama-3.3-70b-instruct" /* LLAMA_3_3_70B */,
      temperature: 0.2
    }
  }
};
var GEMINI_ENV_CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT || "lexify-production-cloud",
  location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  timeoutMs: 45e3
};

// src/modules/drafting/llm/provider/gemini-provider.ts
import { GoogleGenAI } from "@google/genai";
var GeminiProvider = class {
  constructor() {
    const project = GEMINI_ENV_CONFIG.projectId;
    const location = GEMINI_ENV_CONFIG.location;
    if (!project || project.trim() === "") {
      throw new Error("Gemini initialization failed: GOOGLE_CLOUD_PROJECT variable is missing.");
    }
    this.ai = new GoogleGenAI({
      enterprise: true,
      project: project.trim(),
      location: location.trim()
    });
  }
  async getCompletion(prompt, systemInstruction2, runtimeConfig) {
    try {
      const response = await this.ai.models.generateContent({
        model: runtimeConfig.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction2,
          temperature: runtimeConfig.temperature,
          maxOutputTokens: runtimeConfig.maxOutputTokens
        }
      });
      return response.text ?? "";
    } catch (err) {
      throw new Error(`Gemini Completion Engine failure: ${err.message}`);
    }
  }
  async getJsonCompletion(prompt, systemInstruction2, jsonSchema, runtimeConfig) {
    try {
      const response = await this.ai.models.generateContent({
        model: runtimeConfig.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction2,
          temperature: runtimeConfig.temperature,
          responseMimeType: "application/json",
          responseSchema: jsonSchema
        }
      });
      const rawText = response.text;
      if (!rawText) {
        throw new Error("Gemini returned an empty structured content response block.");
      }
      return JSON.parse(rawText);
    } catch (err) {
      throw new Error(`Gemini JSON Processing Circuit failure: ${err.message}`);
    }
  }
};

// src/modules/drafting/llm/provider/openrouter-provider.ts
var OpenRouterLegacyProvider = class {
  constructor() {
    const key = process.env.OPENROUTER_API_KEY || "";
    if (!key || key.trim() === "") {
      throw new Error("OpenRouter Legacy initialization aborted: Missing OPENROUTER_API_KEY in environment configuration.");
    }
    this.apiKey = key.trim();
    this.baseUrl = "https://openrouter.ai/api/v1/chat/completions";
  }
  async getCompletion(prompt, systemInstruction2, runtimeConfig) {
    const messages = [];
    if (systemInstruction2?.trim()) {
      messages.push({ role: "system", content: systemInstruction2 });
    }
    messages.push({ role: "user", content: prompt });
    return this.executeFetchCall(messages, runtimeConfig);
  }
  async getJsonCompletion(prompt, systemInstruction2, jsonSchema, runtimeConfig) {
    const messages = [];
    if (systemInstruction2?.trim()) {
      messages.push({ role: "system", content: systemInstruction2 });
    }
    const schemaHint = jsonSchema ? `

Return ONLY valid JSON matching this schema:
${JSON.stringify(jsonSchema)}` : "\n\nReturn ONLY valid JSON.";
    messages.push({ role: "user", content: `${prompt}${schemaHint}` });
    const responseFormat = jsonSchema ? { type: "json_schema", json_schema: { name: "structured_output", strict: true, schema: jsonSchema } } : { type: "json_object" };
    const rawResultText = await this.executeFetchCall(messages, runtimeConfig, responseFormat);
    try {
      return JSON.parse(rawResultText);
    } catch (err) {
      throw new Error(`OpenRouter JSON payload parsing failed: ${err.message}. Raw text payload: ${rawResultText}`);
    }
  }
  async executeFetchCall(messages, runtimeConfig, responseFormat) {
    const body = {
      model: runtimeConfig.model,
      messages,
      temperature: runtimeConfig.temperature
    };
    if (responseFormat) {
      body.response_format = responseFormat;
    }
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenRouter API endpoint response error (${res.status}): ${errorText}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenRouter payload emerged from network missing expected text content keys.");
    }
    return content;
  }
};

// src/modules/drafting/llm/index.ts
var providersCache = {};
function getProviderEngine(provider) {
  if (!providersCache[provider]) {
    switch (provider) {
      case "GEMINI" /* GEMINI */:
        providersCache[provider] = new GeminiProvider();
        break;
      case "OPENROUTER" /* OPENROUTER */:
        providersCache[provider] = new OpenRouterLegacyProvider();
        break;
      default:
        throw new Error(`Unsupported LLM routing provider instance request: ${provider}`);
    }
  }
  return providersCache[provider];
}
async function executeCompletion(prompt, systemInstruction2, task, provider = "GEMINI" /* GEMINI */) {
  const engine = getProviderEngine(provider);
  const runtimeConfig = PROVIDER_TASK_PRESETS[provider][task];
  return engine.getCompletion(prompt, systemInstruction2, runtimeConfig);
}
async function executeJsonCompletion(prompt, systemInstruction2, jsonSchema, task, provider = "GEMINI" /* GEMINI */) {
  const engine = getProviderEngine(provider);
  const runtimeConfig = PROVIDER_TASK_PRESETS[provider][task];
  return engine.getJsonCompletion(prompt, systemInstruction2, jsonSchema, runtimeConfig);
}

// src/agents/analysisAgent.ts
import { z } from "zod";
var FindingSchema = z.object({
  id: z.string(),
  clauseTitle: z.string(),
  clauseText: z.string().optional(),
  severity: z.enum(["low", "medium", "high"]),
  category: z.enum([
    "indemnity",
    "liability",
    "termination",
    "ip",
    "confidentiality",
    "payment",
    "compliance",
    "data_protection",
    "governing_law",
    "other"
  ]),
  issue: z.string(),
  whyItMatters: z.string(),
  recommendation: z.string(),
  fallbackPosition: z.string().optional(),
  sourceExcerpt: z.string().optional()
});
var RichAuditSchema = z.object({
  executiveSummary: z.string(),
  overallRisk: z.enum(["low", "medium", "high"]),
  documentType: z.string().optional(),
  keyTerms: z.object({
    parties: z.array(z.string()).default([]),
    governingLaw: z.string().optional(),
    liabilityCap: z.string().optional(),
    terminationNotice: z.string().optional(),
    paymentTerms: z.array(z.string()).default([]),
    indemnityScope: z.string().optional(),
    confidentialityTerm: z.string().optional()
  }),
  findings: z.array(FindingSchema),
  missingClauses: z.array(
    z.object({
      clauseName: z.string(),
      reason: z.string(),
      recommendation: z.string()
    })
  ),
  obligations: z.array(
    z.object({
      party: z.string().optional(),
      obligation: z.string(),
      deadline: z.string().optional(),
      trigger: z.string().optional()
    })
  ),
  complianceGaps: z.array(
    z.object({
      regulation: z.string(),
      issue: z.string(),
      severity: z.string(),
      remediation: z.string()
    })
  ),
  recommendedRedlines: z.array(
    z.object({
      clauseTitle: z.string(),
      currentIssue: z.string(),
      suggestedRevision: z.string()
    })
  )
});
function addLegacyAliases(audit) {
  return {
    ...audit,
    // Flat alias so existing consumers that read .summary don't break
    summary: audit.executiveSummary,
    // Map findings → risks so DashboardHome.tsx analysis.risks.length still works
    risks: audit.findings.map((f) => ({
      id: f.id,
      clause: f.clauseText ?? f.clauseTitle,
      severity: f.severity,
      risk_level: f.category,
      reasons: [f.whyItMatters],
      description: f.issue,
      actionableInsight: f.recommendation,
      remediation: f.fallbackPosition ?? f.recommendation
    }))
  };
}
var AnalysisAgent = class {
  // ── Keep intact: used by interactAnalyze ──────────────────────────────────
  async analyzeDocuments(contents, prompt) {
    const combinedContent = contents.join("\n\n---\n\n");
    const systemPrompt = `You are a Senior Compliance Officer.

Identify:
- Critical liability risks
- Compliance gaps
- Regulatory concerns
- Suggested remediation actions

IMPORTANT:
Return your response in clean, well-structured Markdown format.
Use headers, bullet points, and bold text for readability.`;
    const userPrompt = `Analyze the following document(s) and address this query:

${prompt}

[DOCUMENTS]
${combinedContent}`;
    try {
      return await executeCompletion(
        userPrompt,
        systemPrompt,
        "COMPLEX_DRAFT" /* COMPLEX_DRAFT */,
        "GEMINI" /* GEMINI */
      );
    } catch (err) {
      console.error("AnalysisAgent.analyzeDocuments error:", err);
      throw err;
    }
  }
  // ── Primary audit method ──────────────────────────────────────────────────
  async runAudit(params) {
    const { content, type, referenceContext } = params;
    const referenceSection = referenceContext ? `

[REFERENCE CONTEXT FROM RELATED DOCUMENTS]
${referenceContext}
` : "";
    const systemPrompt = `You are an expert Legal Counsel and Risk Assessment Agent specialising in commercial contract review.

Perform a thorough legal audit for a ${type} document. Your output must be a practical legal review grounded in the actual document text.

Instructions:
- Ground every finding in actual clauses or text present in the document
- Include the verbatim clause text or a short source excerpt wherever possible
- Identify missing standard protections that a commercial agreement of this type should contain
- Provide practical recommendations AND a fallback negotiation position for each finding
- Do not hallucinate clauses, facts, or parties that are not present in the document
- If you cannot determine a value (e.g. governing law not stated), mark it as null or omit it
- Return ONLY a valid JSON object \u2014 absolutely no markdown fences, no commentary, no preamble

The JSON must exactly match this schema:
{
  "executiveSummary": "2-4 sentence plain English summary of the document and its key risks",
  "overallRisk": "low | medium | high",
  "documentType": "type of legal document, e.g. NDA, SLA, MSA, Employment Agreement",
  "keyTerms": {
    "parties": ["Party A name", "Party B name"],
    "governingLaw": "jurisdiction or null",
    "liabilityCap": "cap amount/formula or null",
    "terminationNotice": "notice period or null",
    "paymentTerms": ["payment term 1", "payment term 2"],
    "indemnityScope": "brief description or null",
    "confidentialityTerm": "duration or null"
  },
  "findings": [
    {
      "id": "finding_1",
      "clauseTitle": "Short clause name",
      "clauseText": "Verbatim or paraphrased clause text",
      "severity": "low | medium | high",
      "category": "indemnity | liability | termination | ip | confidentiality | payment | compliance | data_protection | governing_law | other",
      "issue": "Specific legal problem with this clause",
      "whyItMatters": "Business/legal consequences if unaddressed",
      "recommendation": "Concrete suggested change",
      "fallbackPosition": "Minimum acceptable negotiation position",
      "sourceExcerpt": "Exact quote from document supporting this finding"
    }
  ],
  "missingClauses": [
    {
      "clauseName": "Name of missing clause",
      "reason": "Why this clause is normally expected in this document type",
      "recommendation": "What to add"
    }
  ],
  "obligations": [
    {
      "party": "Party name or 'Both parties'",
      "obligation": "Description of the obligation",
      "deadline": "Deadline or timeframe if specified",
      "trigger": "Event that triggers the obligation"
    }
  ],
  "complianceGaps": [
    {
      "regulation": "GDPR / CCPA / DPDPA / etc",
      "issue": "Specific gap",
      "severity": "RED | YELLOW | GREEN",
      "remediation": "How to resolve"
    }
  ],
  "recommendedRedlines": [
    {
      "clauseTitle": "Clause to redline",
      "currentIssue": "What is wrong",
      "suggestedRevision": "Proposed replacement language"
    }
  ]
}`;
    const userPrompt = `Document Type Context: ${type}
${referenceSection}
[DOCUMENT TO AUDIT]
${content.substring(0, 14e3)}`;
    try {
      console.log(`[AnalysisAgent] Running rich audit via Gemini (type: ${type}, refContext: ${referenceContext ? "yes" : "no"})`);
      const parsed = await executeJsonCompletion(
        userPrompt,
        systemPrompt,
        {
          type: "object",
          properties: {
            executiveSummary: { type: "string" },
            overallRisk: { type: "string", enum: ["low", "medium", "high"] },
            documentType: { type: "string" },
            keyTerms: {
              type: "object",
              properties: {
                parties: { type: "array", items: { type: "string" } },
                governingLaw: { type: ["string", "null"] },
                liabilityCap: { type: ["string", "null"] },
                terminationNotice: { type: ["string", "null"] },
                paymentTerms: { type: "array", items: { type: "string" } },
                indemnityScope: { type: ["string", "null"] },
                confidentialityTerm: { type: ["string", "null"] }
              },
              required: ["parties", "paymentTerms"],
              additionalProperties: true
            },
            findings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  clauseTitle: { type: "string" },
                  clauseText: { type: ["string", "null"] },
                  severity: { type: "string", enum: ["low", "medium", "high"] },
                  category: {
                    type: "string",
                    enum: [
                      "indemnity",
                      "liability",
                      "termination",
                      "ip",
                      "confidentiality",
                      "payment",
                      "compliance",
                      "data_protection",
                      "governing_law",
                      "other"
                    ]
                  },
                  issue: { type: "string" },
                  whyItMatters: { type: "string" },
                  recommendation: { type: "string" },
                  fallbackPosition: { type: ["string", "null"] },
                  sourceExcerpt: { type: ["string", "null"] }
                },
                required: ["id", "clauseTitle", "severity", "category", "issue", "whyItMatters", "recommendation"],
                additionalProperties: false
              }
            },
            missingClauses: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  clauseName: { type: "string" },
                  reason: { type: "string" },
                  recommendation: { type: "string" }
                },
                required: ["clauseName", "reason", "recommendation"],
                additionalProperties: false
              }
            },
            obligations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  party: { type: ["string", "null"] },
                  obligation: { type: "string" },
                  deadline: { type: ["string", "null"] },
                  trigger: { type: ["string", "null"] }
                },
                required: ["obligation"],
                additionalProperties: false
              }
            },
            complianceGaps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  regulation: { type: "string" },
                  issue: { type: "string" },
                  severity: { type: "string" },
                  remediation: { type: "string" }
                },
                required: ["regulation", "issue", "severity", "remediation"],
                additionalProperties: false
              }
            },
            recommendedRedlines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  clauseTitle: { type: "string" },
                  currentIssue: { type: "string" },
                  suggestedRevision: { type: "string" }
                },
                required: ["clauseTitle", "currentIssue", "suggestedRevision"],
                additionalProperties: false
              }
            }
          },
          required: ["executiveSummary", "overallRisk", "keyTerms", "findings", "missingClauses", "obligations", "complianceGaps", "recommendedRedlines"],
          additionalProperties: false
        },
        "STRUCTURAL_JSON" /* STRUCTURAL_JSON */,
        "GEMINI" /* GEMINI */
      );
      parsed.keyTerms = parsed.keyTerms ?? {};
      parsed.keyTerms.parties = Array.isArray(parsed.keyTerms?.parties) ? parsed.keyTerms.parties : [];
      parsed.keyTerms.paymentTerms = Array.isArray(parsed.keyTerms?.paymentTerms) ? parsed.keyTerms.paymentTerms : [];
      parsed.findings = Array.isArray(parsed.findings) ? parsed.findings : [];
      parsed.missingClauses = Array.isArray(parsed.missingClauses) ? parsed.missingClauses : [];
      parsed.obligations = Array.isArray(parsed.obligations) ? parsed.obligations : [];
      parsed.complianceGaps = Array.isArray(parsed.complianceGaps) ? parsed.complianceGaps : [];
      parsed.recommendedRedlines = Array.isArray(parsed.recommendedRedlines) ? parsed.recommendedRedlines : [];
      parsed.findings = parsed.findings.map((f, i) => ({
        ...f,
        id: f.id || `finding_${i + 1}`
      }));
      const validated = RichAuditSchema.parse(parsed);
      return addLegacyAliases(validated);
    } catch (err) {
      console.warn(
        "[AnalysisAgent] AI audit failed or schema validation error. Falling back to heuristics.",
        err
      );
      return this.heuristicAudit(content, type);
    }
  }
  // ── Heuristic fallback — returns the full richer shape ───────────────────
  heuristicAudit(content, type) {
    const findings = [];
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes("liquidated damages")) {
      findings.push({
        id: "h_finding_1",
        clauseTitle: "Liquidated Damages",
        clauseText: "Liquidated damages clause detected",
        severity: "high",
        category: "liability",
        issue: "Liquidated damages clauses can become punitive if not reasonably linked to actual loss.",
        whyItMatters: "Uncapped liability may expose a party to excessive financial penalties disproportionate to actual loss.",
        recommendation: "Negotiate for actual proven damages and establish a reasonable liability cap.",
        fallbackPosition: "Accept liquidated damages only if capped at total contract value.",
        sourceExcerpt: "Liquidated damages clause detected in document."
      });
    }
    if (lowerContent.includes("all intellectual property") || lowerContent.includes("exclusive ownership")) {
      findings.push({
        id: "h_finding_2",
        clauseTitle: "Broad IP Ownership",
        clauseText: "Broad intellectual property ownership language detected",
        severity: "medium",
        category: "ip",
        issue: "The clause may transfer ownership of pre-existing intellectual property without limitation.",
        whyItMatters: "Ambiguous IP assignment can result in loss of background IP and pre-existing technology.",
        recommendation: "Clearly distinguish background IP from newly created deliverables.",
        fallbackPosition: "Limit assignment to project-specific deliverables only.",
        sourceExcerpt: "All intellectual property / exclusive ownership language detected."
      });
    }
    if (lowerContent.includes("terminate immediately") && !lowerContent.includes("notice")) {
      findings.push({
        id: "h_finding_3",
        clauseTitle: "Immediate Termination Without Notice",
        clauseText: "Terminate immediately clause with no notice period detected",
        severity: "medium",
        category: "termination",
        issue: "Immediate termination rights without a notice or cure period create operational disruption risk.",
        whyItMatters: "A party may lose all contractual benefits without an opportunity to remedy a breach.",
        recommendation: "Add a minimum notice period and a cure window before termination becomes effective.",
        fallbackPosition: "Accept 15-day notice minimum with a 10-day cure period.",
        sourceExcerpt: "Terminate immediately language detected without accompanying notice provision."
      });
    }
    const richResult = {
      executiveSummary: `Heuristic audit completed for document type: ${type}. ${findings.length} potential risk indicator(s) were detected based on keyword analysis. A full AI-powered review is recommended.`,
      overallRisk: findings.some((f) => f.severity === "high") ? "high" : findings.some((f) => f.severity === "medium") ? "medium" : "low",
      documentType: type,
      keyTerms: {
        parties: [],
        paymentTerms: []
      },
      findings,
      missingClauses: [],
      obligations: [],
      complianceGaps: [],
      recommendedRedlines: []
    };
    return addLegacyAliases(richResult);
  }
};

// src/services/openRouterClient.ts
async function openRouterComplete(systemPrompt, userPrompt, options = {}) {
  console.log(
    `[openRouterComplete] Routing call to Gemini provider via modules/drafting/llm (jsonMode=${!!options.jsonMode})`
  );
  if (options.jsonMode) {
    const task = "STRUCTURAL_JSON" /* STRUCTURAL_JSON */;
    const result = await executeJsonCompletion(
      userPrompt,
      systemPrompt || "",
      void 0,
      // No explicit schema required
      task,
      "GEMINI" /* GEMINI */
    );
    return JSON.stringify(result);
  } else {
    const task = "COMPLEX_DRAFT" /* COMPLEX_DRAFT */;
    return executeCompletion(
      userPrompt,
      systemPrompt || "",
      task,
      "GEMINI" /* GEMINI */
    );
  }
}

// src/agents/draftingAgent.ts
var DraftingAgent = class {
  async generateDraft(prompt) {
    const systemPrompt = "You are an expert Legal Draftsman. Generate a professional legal document based on the user's instruction. Return only the document content in Markdown format. Do not include any preamble or notes.";
    const userPrompt = prompt;
    try {
      return await openRouterComplete(systemPrompt, userPrompt);
    } catch (err) {
      console.error("DraftingAgent error:", err);
      throw err;
    }
  }
};

// src/agents/negotiationAgent.ts
var NegotiationAgent = class {
  /**
   * Evaluates the document against provided playbooks and generates a structured, 
   * commercially minded negotiation strategy with clean redlines.
   */
  async negotiate(documentContent, playbooks, instructions) {
    const playbookText = playbooks.length > 0 ? playbooks.join("\n\n---\n\n") : "Default corporate playbook and risk guidelines.";
    const systemPrompt = `You are an elite corporate legal counsel and master transactional negotiator. 
Your objective is to review the provided contract against our playbook rules and user guidelines to produce a comprehensive, structured redline and strategic advisory report.

REQUIRED OUTPUT STRUCTURE (Markdown):
1. ### \u{1F4CB} Executive Risk Summary
   - Provide a high-level, clear overview of the contract's primary exposure vectors (e.g., liability caps, indemnification gaps, IP ownership transfer).

2. ### \u2694\uFE0F Recommended Redline Adjustments
   Represent your suggestions in a clean Markdown Table using these exact column headers:
   | Provision Name | Original Text | Proposed Redline Clause | Strategic Rationale |
   
   Ensure that:
   - "Original Text" is a highly accurate representation of the risky text.
   - "Proposed Redline Clause" is fully drafted, balanced, and ready to copy-paste.
   - "Strategic Rationale" explains the operational risk of the original and why the redline is a fair compromise.

3. ### \u{1F4AC} Tactical Negotiation Scripting
   - Provide practical talking points and defensive scripts our business team can use verbally or in emails to defend each redline when dealing with the counterparty's legal team.

STRICT TONE CONSTRAINT:
Maintain a highly professional, commercially constructive, and executive-ready tone. Focus purely on transactional risk mitigation and deal velocity. Avoid academic legal theory.`;
    const userPrompt = `[DOCUMENT CONTENT]
${documentContent}

[NEGOTIATION PLAYBOOKS]
${playbookText}

[USER INSTRUCTIONS]
${instructions || "Ensure the agreement is protective, mutual, and commercially reasonable."}

Analyze the agreement and generate your professional negotiation layout:`;
    try {
      return await executeCompletion(
        userPrompt,
        systemPrompt,
        "COMPLEX_DRAFT" /* COMPLEX_DRAFT */,
        // Routes to Gemini Pro / Sonnet for deep analytical depth
        "GEMINI" /* GEMINI */
      );
    } catch (err) {
      console.error("NegotiationAgent error during execution:", err);
      throw err;
    }
  }
  async draftRedline(documentContent, playbooks, instructions) {
    return await this.negotiate(documentContent, playbooks, instructions);
  }
};

// src/agents/askLawyerAgent.ts
var AskLawyerAgent = class {
  /**
   * Upgraded Ask AI Lawyer agent with jurisdiction awareness, output format control,
   * and document-grounded structured analysis.
   */
  async getAdvice(options) {
    const {
      prompt,
      context,
      jurisdictions = [],
      outputFormat = "Full IRAC",
      sources = []
    } = options;
    const jurisdictionClause = jurisdictions.length > 0 ? `

**JURISDICTIONAL SCOPE:** Your analysis must prioritize and reference legal principles, statutes, and case law from the following jurisdictions: ${jurisdictions.join(", ")}. Where the retrieved documents or general principles do not clearly cover these jurisdictions, state that assumption explicitly and recommend jurisdiction-specific counsel.` : "";
    const formatInstructions = this.getFormatInstructions(outputFormat);
    const systemPrompt = `You are a Senior Legal Counsel specializing in commercial contract law, regulatory compliance, and risk assessment.

Your task is to provide **document-grounded, jurisdiction-aware, structured legal analysis** based on the retrieved document context provided below.${jurisdictionClause}

${formatInstructions}

**CRITICAL RULES:**
1. **Ground your analysis in the retrieved document context wherever possible.** Quote or paraphrase relevant clauses. If the context does not support a point, clearly state: "The retrieved documents do not address this issue \u2014 the following is based on general legal principles."
2. **Clearly separate:**
   - Conclusions grounded in the provided documents
   - General legal principles applied when context is insufficient
3. **Provide practical, actionable legal analysis** \u2014 not vague generic advice.
4. **Identify risks, ambiguities, and assumptions** where the documents are unclear or incomplete.
5. **Include practical recommendations / next steps** at the end.
6. **Return clean, well-structured Markdown** with headers, bullet points, and bold text for readability.

If the retrieved document context is weak or empty, you must still provide a structured answer using general legal principles, but clearly label it as such and recommend that the user consult jurisdiction-specific counsel or provide more specific documents.`;
    const userPrompt = `[RETRIEVED DOCUMENT CONTEXT]
${context || "\u26A0\uFE0F No document chunks were retrieved. You must rely on general legal principles and clearly state where assumptions are made."}

[USER QUERY]
${prompt}

Provide your analysis using the required ${outputFormat} structure.`;
    try {
      const result = await openRouterComplete(systemPrompt, userPrompt);
      const text = result || "I cannot answer this query right now.";
      const sourcesMetadata = sources.length > 0 ? sources.map((s, idx) => ({
        id: `src_${idx + 1}`,
        title: s.title || "Untitled Document",
        file_id: s.file_id,
        excerpt: s.content.substring(0, 200) + (s.content.length > 200 ? "..." : "")
      })) : void 0;
      return { text, sources: sourcesMetadata };
    } catch (err) {
      console.error("AskLawyerAgent error:", err);
      throw err;
    }
  }
  getFormatInstructions(format) {
    switch (format) {
      case "Brief Summary":
        return `**OUTPUT FORMAT: Brief Summary**

Structure your answer as follows:
1. **Executive Summary** (2-4 sentences): Concise answer to the user's query.
2. **Key Points** (3-5 bullet points): Core legal principles or document findings.
3. **Risks / Ambiguities** (2-3 bullet points): Gaps, assumptions, or areas of concern.
4. **Practical Recommendation** (1-2 sentences): Clear next step or actionable advice.

Keep the answer **concise and practical** \u2014 no more than 300-400 words total.`;
      case "Full IRAC":
        return `**OUTPUT FORMAT: Full IRAC (Issue, Rule, Application, Conclusion)**

Structure your answer as follows:

### ISSUE
State the legal question or problem clearly in 1-2 sentences.

### RULE
Explain the relevant legal principles, statutes, or contract provisions that apply. If grounded in the retrieved documents, quote or cite the specific clause/section. If based on general legal principles, state that explicitly.

### APPLICATION
Apply the rule to the facts or document provisions retrieved. Analyze how the rule interacts with the user's situation. Identify risks, ambiguities, or gaps in the documents.

### CONCLUSION
Provide a clear conclusion that answers the user's query. Include:
- The likely legal outcome or interpretation
- Practical next steps or recommendations
- Any disclaimers about jurisdiction or missing information

Use **clear headers** for each section and bullet points where appropriate.`;
      case "CREAC":
        return `**OUTPUT FORMAT: CREAC (Conclusion, Rule, Explanation, Application, Conclusion)**

Structure your answer as follows:

### CONCLUSION (Short Answer)
Provide a direct, concise answer to the user's query in 2-3 sentences.

### RULE
Explain the relevant legal principles, statutes, or contract provisions. If grounded in the retrieved documents, quote or cite the specific clause. If based on general legal principles, state that explicitly.

### EXPLANATION OF RULE
Elaborate on how the rule works, its purpose, and any relevant nuances or exceptions. Reference case law, regulatory guidance, or contract interpretation principles where applicable.

### APPLICATION
Apply the rule to the facts or document provisions. Analyze the interaction between the rule and the user's situation. Highlight risks, ambiguities, or missing protections.

### CONCLUSION (Full Answer)
Restate and expand on the conclusion. Include:
- Detailed legal outcome or interpretation
- Practical recommendations / next steps
- Disclaimers about jurisdiction, assumptions, or areas requiring further research

Use **clear headers** and bullet points for readability.`;
      default:
        return "";
    }
  }
};

// src/agents/dpaReviewAgent.ts
import { z as z2 } from "zod";
var FindingSchema2 = z2.object({
  id: z2.string(),
  clause: z2.string(),
  status: z2.enum(["compliant", "warning", "missing"]),
  severity: z2.enum(["low", "medium", "high"]),
  articleReference: z2.string().optional(),
  description: z2.string(),
  recommendation: z2.string()
});
var RecommendationSchema = z2.object({
  category: z2.string(),
  priority: z2.enum(["critical", "high", "medium", "low"]),
  items: z2.array(z2.string())
});
var MissingClauseSchema = z2.object({
  clauseName: z2.string(),
  articleReference: z2.string().optional(),
  reason: z2.string(),
  recommendation: z2.string()
});
var ScoreBreakdownSchema = z2.object({
  article28Compliance: z2.number().min(0).max(100),
  processorObligations: z2.number().min(0).max(100),
  securityMeasures: z2.number().min(0).max(100),
  dataSubjectRights: z2.number().min(0).max(100),
  internationalTransfers: z2.number().min(0).max(100),
  subprocessorControls: z2.number().min(0).max(100)
});
var DPAReviewResultSchema = z2.object({
  overallScore: z2.number().min(0).max(100),
  riskLevel: z2.enum(["low", "medium", "high"]),
  summary: z2.string(),
  findings: z2.array(FindingSchema2),
  recommendations: z2.array(RecommendationSchema),
  missingClauses: z2.array(MissingClauseSchema),
  scoreBreakdown: ScoreBreakdownSchema
});
var DPA_RETRIEVAL_QUERY = "GDPR Article 28 data processing agreement processor controller subprocessor obligations security measures technical organisational international transfers standard contractual clauses data subject rights audit rights incident notification data retention deletion";
var SYSTEM_PROMPT = `You are a GDPR expert and Data Protection Officer specialising in Data Processing Agreement (DPA) compliance reviews.

Perform a thorough compliance audit of the provided DPA document against GDPR requirements, primarily GDPR Article 28 and related provisions.

Evaluate the following dimensions:
1. GDPR Article 28 compliance (controller/processor relationship, mandatory provisions)
2. Processor obligations (processing instructions, confidentiality, security, sub-processors)
3. Security measures (Article 32 \u2014 technical and organisational measures)
4. Data subject rights (assistance obligations, timelines)
5. International transfers (Chapter V GDPR \u2014 SCCs, adequacy decisions, BCRs)
6. Sub-processor controls (authorisation, notice period, flow-down obligations)
7. Audit rights (scope, notice period, cost allocation)
8. Data retention and deletion (end-of-contract obligations, timelines)
9. Incident notification (Article 33/34 \u2014 timelines, content requirements)
10. Missing mandatory clauses

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
OUTPUT FORMAT \u2014 FOLLOW THIS EXACTLY
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

You MUST return a single raw JSON object with EXACTLY these 7 top-level keys:
  overallScore, riskLevel, summary, findings, recommendations, missingClauses, scoreBreakdown

STRICT RULES:
- Return ONLY the JSON object. No markdown fences, no prose, no commentary before or after.
- Do NOT use any other field names. Forbidden alternatives:
    \u2717 compliantProvisions  \u2192 use findings[] with status "compliant"
    \u2717 warnings             \u2192 use findings[] with status "warning"
    \u2717 issues               \u2192 use findings[]
    \u2717 missingClauses as strings \u2192 missingClauses MUST be objects (see schema below)
- Every finding goes into the "findings" array regardless of its status.
- "missingClauses" must be an array of OBJECTS, never an array of strings.
- Ground every finding in the actual document text. Do NOT invent provisions.

EXACT SCHEMA (copy field names character-for-character):

{
  "overallScore": <integer 0\u2013100>,
  "riskLevel": <"low" | "medium" | "high">,
  "summary": "<2\u20134 sentence executive summary>",
  "findings": [
    {
      "id": "finding_1",
      "clause": "<short clause name>",
      "status": <"compliant" | "warning" | "missing">,
      "severity": <"low" | "medium" | "high">,
      "articleReference": "<e.g. Art. 28 GDPR>",
      "description": "<what was found or not found>",
      "recommendation": "<concrete actionable recommendation>"
    }
  ],
  "recommendations": [
    {
      "category": "<category name>",
      "priority": <"critical" | "high" | "medium" | "low">,
      "items": ["<item 1>", "<item 2>"]
    }
  ],
  "missingClauses": [
    {
      "clauseName": "<name of missing clause>",
      "articleReference": "<relevant GDPR article>",
      "reason": "<why this clause is mandatory>",
      "recommendation": "<exact language or approach to add>"
    }
  ],
  "scoreBreakdown": {
    "article28Compliance": <0\u2013100>,
    "processorObligations": <0\u2013100>,
    "securityMeasures": <0\u2013100>,
    "dataSubjectRights": <0\u2013100>,
    "internationalTransfers": <0\u2013100>,
    "subprocessorControls": <0\u2013100>
  }
}

REMINDER: Output the JSON object only. No text before or after it.`;
function normalizeLLMOutput(raw) {
  let changed = false;
  const out = { ...raw };
  const findings = Array.isArray(out.findings) ? [...out.findings] : [];
  if (Array.isArray(out.compliantProvisions) && out.compliantProvisions.length > 0) {
    changed = true;
    out.compliantProvisions.forEach((item, i) => {
      if (typeof item === "string") {
        findings.push({
          id: `norm_compliant_${i + 1}`,
          clause: item,
          status: "compliant",
          severity: "low",
          description: item,
          recommendation: "No action required \u2014 provision is compliant."
        });
      } else if (item && typeof item === "object") {
        findings.push({
          id: item.id ?? `norm_compliant_${i + 1}`,
          clause: item.clause ?? item.name ?? item.title ?? "Compliant Provision",
          status: "compliant",
          severity: item.severity ?? "low",
          articleReference: item.articleReference ?? item.article ?? void 0,
          description: item.description ?? item.text ?? item.clause ?? "",
          recommendation: item.recommendation ?? "No action required \u2014 provision is compliant."
        });
      }
    });
    delete out.compliantProvisions;
  }
  if (Array.isArray(out.warnings) && out.warnings.length > 0) {
    changed = true;
    out.warnings.forEach((item, i) => {
      if (typeof item === "string") {
        findings.push({
          id: `norm_warning_${i + 1}`,
          clause: item,
          status: "warning",
          severity: "medium",
          description: item,
          recommendation: "Review and strengthen this provision to meet GDPR requirements."
        });
      } else if (item && typeof item === "object") {
        findings.push({
          id: item.id ?? `norm_warning_${i + 1}`,
          clause: item.clause ?? item.name ?? item.title ?? "Warning",
          status: "warning",
          severity: item.severity ?? "medium",
          articleReference: item.articleReference ?? item.article ?? void 0,
          description: item.description ?? item.text ?? item.clause ?? "",
          recommendation: item.recommendation ?? "Review and strengthen this provision to meet GDPR requirements."
        });
      }
    });
    delete out.warnings;
  }
  if (Array.isArray(out.issues) && out.issues.length > 0) {
    changed = true;
    out.issues.forEach((item, i) => {
      if (typeof item === "string") {
        findings.push({
          id: `norm_issue_${i + 1}`,
          clause: item,
          status: "warning",
          severity: "medium",
          description: item,
          recommendation: "Address this issue to improve GDPR compliance."
        });
      } else if (item && typeof item === "object") {
        findings.push({
          id: item.id ?? `norm_issue_${i + 1}`,
          clause: item.clause ?? item.name ?? item.title ?? "Issue",
          status: item.status ?? "warning",
          severity: item.severity ?? "medium",
          articleReference: item.articleReference ?? item.article ?? void 0,
          description: item.description ?? item.text ?? "",
          recommendation: item.recommendation ?? "Address this issue to improve GDPR compliance."
        });
      }
    });
    delete out.issues;
  }
  out.findings = findings.map((f, i) => ({
    ...f,
    id: f.id || `finding_${i + 1}`,
    clause: f.clause || "Unknown Clause",
    status: ["compliant", "warning", "missing"].includes(f.status) ? f.status : "warning",
    severity: ["low", "medium", "high"].includes(f.severity) ? f.severity : "medium",
    description: f.description || "",
    recommendation: f.recommendation || ""
  }));
  if (Array.isArray(out.missingClauses) && out.missingClauses.length > 0) {
    const normalised = out.missingClauses.map((item, i) => {
      if (typeof item === "string") {
        changed = true;
        return {
          clauseName: item,
          articleReference: void 0,
          reason: `This provision is mandatory under GDPR for a valid DPA.`,
          recommendation: `Add an explicit clause addressing: ${item}`
        };
      }
      if (item && typeof item === "object") {
        const normalized = {
          clauseName: item.clauseName ?? item.name ?? item.clause ?? item.title ?? "Unknown Clause",
          reason: item.reason ?? item.description ?? item.text ?? "This provision is mandatory under GDPR.",
          recommendation: item.recommendation ?? item.action ?? "Add the missing clause."
        };
        if (item.articleReference ?? item.article ?? item.gdprArticle) {
          normalized.articleReference = item.articleReference ?? item.article ?? item.gdprArticle;
        }
        if (!item.clauseName || !item.reason || !item.recommendation) changed = true;
        return normalized;
      }
      changed = true;
      return {
        clauseName: String(item),
        reason: "This provision is mandatory under GDPR for a valid DPA.",
        recommendation: `Add an explicit clause addressing: ${String(item)}`
      };
    });
    out.missingClauses = normalised;
  } else {
    out.missingClauses = Array.isArray(out.missingClauses) ? out.missingClauses : [];
  }
  if (!Array.isArray(out.recommendations)) {
    out.recommendations = [];
    changed = true;
  }
  const defaultBreakdown = {
    article28Compliance: 50,
    processorObligations: 50,
    securityMeasures: 50,
    dataSubjectRights: 50,
    internationalTransfers: 50,
    subprocessorControls: 50
  };
  if (!out.scoreBreakdown || typeof out.scoreBreakdown !== "object") {
    out.scoreBreakdown = defaultBreakdown;
    changed = true;
  } else {
    for (const key of Object.keys(defaultBreakdown)) {
      if (typeof out.scoreBreakdown[key] !== "number") {
        out.scoreBreakdown[key] = defaultBreakdown[key];
        changed = true;
      }
    }
  }
  if (typeof out.overallScore !== "number") {
    out.overallScore = 50;
    changed = true;
  }
  if (!["low", "medium", "high"].includes(out.riskLevel)) {
    out.riskLevel = out.overallScore >= 70 ? "low" : out.overallScore >= 40 ? "medium" : "high";
    changed = true;
  }
  if (typeof out.summary !== "string" || out.summary.trim() === "") {
    out.summary = "DPA compliance review completed. Manual verification is recommended.";
    changed = true;
  }
  return { normalized: out, changed };
}
var DPAReviewAgent = class {
  /**
   * Review a DPA document.
   * @param documentText  Extracted plaintext of the DPA
   * @param userId        User ID — used to scope RAG retrieval
   * @param fileId        Optional file ID — used to retrieve indexed chunks from this doc
   */
  async reviewDPA(documentText, userId, fileId) {
    console.log(
      `[DPAReviewAgent] reviewDPA called \u2014 userId=${userId} fileId=${fileId ?? "(none \u2014 ephemeral upload)"} documentText length=${documentText.length}`
    );
    let ragContext = "";
    if (fileId) {
      try {
        const chunks = await searchHybrid(
          DPA_RETRIEVAL_QUERY,
          userId,
          [fileId]
        );
        const ownChunks = chunks.filter((c) => c.file_id === fileId);
        const foreignChunks = chunks.filter((c) => c.file_id !== fileId);
        if (foreignChunks.length > 0) {
          console.warn(
            `[DPAReviewAgent] Discarding ${foreignChunks.length} chunk(s) from unrelated files: ` + foreignChunks.map((c) => c.title ?? c.file_id).join(", ")
          );
        }
        if (ownChunks.length > 0) {
          ragContext = ownChunks.map((c) => `[${c.title ?? "DPA Document"}]
${c.content}`).join("\n\n");
          console.log(
            `[DPAReviewAgent] Using ${ownChunks.length} RAG chunk(s) from the uploaded file for context`
          );
        } else {
          console.log(
            `[DPAReviewAgent] No indexed chunks found for fileId=${fileId} \u2014 falling back to raw document text`
          );
        }
      } catch (ragErr) {
        console.warn(
          "[DPAReviewAgent] RAG retrieval failed, continuing with raw text only:",
          ragErr.message
        );
      }
    } else {
      console.log(
        "[DPAReviewAgent] No fileId provided \u2014 skipping RAG to avoid returning chunks from unrelated documents"
      );
    }
    const usingRag = ragContext.length > 0;
    const documentContext = usingRag ? ragContext : documentText.substring(0, 14e3);
    console.log(
      `[DPAReviewAgent] Context source: ${usingRag ? "RAG chunks from uploaded file" : "raw document text"} \u2014 ${documentContext.length} chars`
    );
    const userPrompt = `[DPA DOCUMENT]
${documentContext}

Review the above Data Processing Agreement for GDPR compliance. Identify all compliant provisions, warnings, and missing mandatory clauses. Return only the structured JSON as specified.`;
    let responseText;
    try {
      console.log(
        `[DPAReviewAgent] Calling OpenRouter \u2014 context length: ${documentContext.length} chars`
      );
      responseText = await openRouterComplete(SYSTEM_PROMPT, userPrompt, {
        jsonMode: true,
        temperature: 0.2
      });
    } catch (llmErr) {
      console.error("[DPAReviewAgent] OpenRouter call failed:", llmErr);
      throw llmErr;
    }
    responseText = responseText.trim();
    console.log(
      `[DPAReviewAgent] Raw LLM response (${responseText.length} chars):
` + responseText.substring(0, 3e3) + (responseText.length > 3e3 ? `
...[truncated, total ${responseText.length} chars]` : "")
    );
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    }
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      console.warn(
        "[DPAReviewAgent] JSON parse failed \u2014 raw text was:\n",
        responseText.substring(0, 1e3),
        "\nError:",
        parseErr.message
      );
      return this.heuristicFallback(documentText);
    }
    const { normalized, changed } = normalizeLLMOutput(parsed);
    if (changed) {
      console.log(
        "[DPAReviewAgent] Normalization applied \u2014 LLM used a non-standard shape. Keys present in raw response: " + Object.keys(parsed).join(", ")
      );
    } else {
      console.log("[DPAReviewAgent] No normalization needed \u2014 LLM output matched expected schema");
    }
    console.log(
      "[DPAReviewAgent] Normalized object (pre-Zod):",
      JSON.stringify(normalized, null, 2).substring(0, 4e3)
    );
    try {
      return DPAReviewResultSchema.parse(normalized);
    } catch (validationErr) {
      console.warn(
        "[DPAReviewAgent] Zod validation failed after normalization. Errors:\n",
        JSON.stringify(validationErr?.errors ?? validationErr, null, 2)
      );
      return this.heuristicFallback(documentText);
    }
  }
  // ── Heuristic fallback — returns a minimal but valid result shape ──────────
  heuristicFallback(content) {
    const lower = content.toLowerCase();
    const findings = [];
    if (lower.includes("article 28") || lower.includes("art. 28")) {
      findings.push({
        id: "h_1",
        clause: "Article 28 Compliance",
        status: "compliant",
        severity: "low",
        articleReference: "Art. 28 GDPR",
        description: "The document contains references to GDPR Article 28 processor relationship provisions.",
        recommendation: "Verify all mandatory Article 28(3) sub-clauses are explicitly addressed."
      });
    } else {
      findings.push({
        id: "h_1",
        clause: "Article 28 Compliance",
        status: "missing",
        severity: "high",
        articleReference: "Art. 28 GDPR",
        description: "No explicit reference to GDPR Article 28 was detected in the document.",
        recommendation: "Add an explicit Article 28 compliance section covering all mandatory provisions."
      });
    }
    if (!lower.includes("sub-processor") && !lower.includes("subprocessor")) {
      findings.push({
        id: "h_2",
        clause: "Sub-Processor Controls",
        status: "missing",
        severity: "high",
        articleReference: "Art. 28(2) GDPR",
        description: "No sub-processor authorisation or notification mechanism was detected.",
        recommendation: "Add a clause requiring prior written consent and 30-day notice for new sub-processors."
      });
    }
    if (!lower.includes("international transfer") && !lower.includes("standard contractual")) {
      findings.push({
        id: "h_3",
        clause: "International Transfers",
        status: "missing",
        severity: "high",
        articleReference: "Art. 44-49 GDPR",
        description: "No international transfer provisions or SCCs were detected.",
        recommendation: "Add a clause specifying the legal basis for any transfers outside the EEA."
      });
    }
    const compliantCount = findings.filter((f) => f.status === "compliant").length;
    const overallScore = Math.round(compliantCount / Math.max(findings.length, 1) * 60);
    return {
      overallScore,
      riskLevel: overallScore >= 70 ? "low" : overallScore >= 40 ? "medium" : "high",
      summary: "Heuristic analysis completed. A full AI-powered review could not be generated. The document was scanned for key GDPR provisions using keyword analysis. Manual review is strongly recommended.",
      findings,
      recommendations: [
        {
          category: "Immediate Actions",
          priority: "critical",
          items: [
            "Conduct a full manual DPA review against GDPR Article 28 requirements.",
            "Ensure all mandatory processor obligations are explicitly addressed."
          ]
        }
      ],
      missingClauses: findings.filter((f) => f.status === "missing").map((f) => ({
        clauseName: f.clause,
        articleReference: f.articleReference,
        reason: `This provision is mandatory under ${f.articleReference ?? "GDPR"} for a valid DPA.`,
        recommendation: f.recommendation
      })),
      scoreBreakdown: {
        article28Compliance: lower.includes("article 28") ? 60 : 0,
        processorObligations: lower.includes("processor") ? 50 : 20,
        securityMeasures: lower.includes("security") ? 50 : 20,
        dataSubjectRights: lower.includes("data subject") ? 50 : 20,
        internationalTransfers: lower.includes("transfer") ? 40 : 0,
        subprocessorControls: lower.includes("sub-processor") ? 50 : 0
      }
    };
  }
};

// src/agents/vendorReviewAgent.ts
import { z as z3 } from "zod";
var VendorFindingSchema = z3.object({
  id: z3.string(),
  title: z3.string(),
  category: z3.string(),
  severity: z3.enum(["low", "medium", "high", "critical"]),
  status: z3.enum(["passed", "warning", "missing", "high-risk"]),
  description: z3.string(),
  evidence: z3.string().optional(),
  recommendation: z3.string()
});
var VendorRecommendationSchema = z3.object({
  category: z3.string(),
  priority: z3.enum(["critical", "high", "medium", "low"]),
  items: z3.array(z3.string())
});
var CertificationSchema = z3.object({
  name: z3.string(),
  status: z3.enum(["confirmed", "claimed", "expired", "missing"]),
  details: z3.string().optional()
});
var ComplianceItemSchema = z3.object({
  label: z3.string(),
  status: z3.enum(["compliant", "partial", "missing", "na"]),
  notes: z3.string().optional()
});
var ScoreBreakdownSchema2 = z3.object({
  privacyPosture: z3.number().min(0).max(100),
  securityPosture: z3.number().min(0).max(100),
  gdprCompliance: z3.number().min(0).max(100),
  ccpaCompliance: z3.number().min(0).max(100),
  contractualRisk: z3.number().min(0).max(100),
  vendorTransparency: z3.number().min(0).max(100)
});
var VendorInfoSchema = z3.object({
  name: z3.string().optional(),
  industry: z3.string().optional(),
  headquarters: z3.string().optional(),
  dataRegions: z3.string().optional(),
  primaryServices: z3.string().optional()
}).optional();
var VendorReviewResultSchema = z3.object({
  overallScore: z3.number().min(0).max(100),
  overallRisk: z3.enum(["low", "medium", "high", "critical"]),
  summary: z3.string(),
  vendorInfo: VendorInfoSchema,
  findings: z3.array(VendorFindingSchema),
  recommendations: z3.array(VendorRecommendationSchema),
  strengths: z3.array(z3.string()),
  concerns: z3.array(z3.string()),
  certifications: z3.array(CertificationSchema),
  compliance: z3.array(ComplianceItemSchema),
  scoreBreakdown: ScoreBreakdownSchema2
});
var VENDOR_RETRIEVAL_QUERY = "vendor privacy policy data processing GDPR CCPA compliance ISO 27001 SOC 2 security certifications DPA subprocessors data retention incident response international transfers trust center cookie policy terms of service third-party risk onboarding";
var SYSTEM_PROMPT2 = `You are a senior Vendor Risk and Privacy Compliance Analyst specialising in third-party risk assessments, GDPR, CCPA, ISO 27001, SOC 2 and enterprise vendor onboarding.

Perform a comprehensive vendor risk assessment based on the provided context (uploaded documents and/or website intelligence). Evaluate ALL of the following dimensions:

1. Privacy posture (privacy policy quality, data subject rights, GDPR/CCPA alignment)
2. Security posture (security documentation, certifications, encryption, incident response)
3. GDPR compliance (lawful basis, DPA availability, Art. 28 obligations, international transfers)
4. CCPA compliance (consumer rights, data sale disclosure, opt-out mechanisms)
5. Cookie practices (consent mechanisms, cookie categories, policy clarity)
6. Security headers and technical controls (HSTS, CSP, X-Frame-Options if detectable)
7. Trust Center maturity (dedicated trust page, compliance documentation, audit reports)
8. ISO 27001 (certification presence, scope, expiry)
9. SOC 2 (Type I vs Type II, audit period, coverage)
10. Other certifications (PCI DSS, HIPAA, FedRAMP, etc.)
11. Data retention policies (defined periods, deletion obligations)
12. Incident response (documented plan, GDPR 72h notification, SLA)
13. Data transfers (SCCs, adequacy decisions, BCRs)
14. Vendor transparency (sub-processor list, update frequency, notice periods)
15. DPA availability (formal DPA, Article 28 provisions)
16. Terms of Service (liability caps, indemnity, IP, termination)
17. Overall vendor risk (onboarding readiness, contractual gaps, due diligence completeness)

CRITICAL RULES:
- Ground every finding in evidence from the provided context
- If a dimension cannot be evaluated (no relevant content), mark it as "missing" with status "missing"
- Do NOT invent certifications, policies, or facts not present in the context
- Provide concrete, actionable recommendations for every finding
- Return ONLY a valid JSON object \u2014 absolutely no markdown fences, no preamble, no commentary

The JSON must exactly match this schema:
{
  "overallScore": <integer 0-100, weighted average of all dimensions>,
  "overallRisk": "low" | "medium" | "high" | "critical",
  "summary": "<3-5 sentence executive summary of the vendor's overall risk picture>",
  "vendorInfo": {
    "name": "<company name if identifiable or null>",
    "industry": "<industry/sector if identifiable or null>",
    "headquarters": "<location if identifiable or null>",
    "dataRegions": "<data storage regions if identifiable or null>",
    "primaryServices": "<primary services/products if identifiable or null>"
  },
  "findings": [
    {
      "id": "finding_1",
      "title": "<Short finding title>",
      "category": "<Category: Privacy | Security | GDPR | CCPA | Certifications | Data Retention | Incident Response | Transfers | Subprocessors | DPA | Trust Center | Contractual | Cookie Practices>",
      "severity": "low" | "medium" | "high" | "critical",
      "status": "passed" | "warning" | "missing" | "high-risk",
      "description": "<What was found or not found>",
      "evidence": "<Specific evidence from context, quote or reference>",
      "recommendation": "<Concrete actionable recommendation>"
    }
  ],
  "recommendations": [
    {
      "category": "<Category name e.g. Missing Documentation | Suggested Improvements | Risk Mitigation | Compliance Recommendations>",
      "priority": "critical" | "high" | "medium" | "low",
      "items": ["<Actionable item 1>", "<item 2>"]
    }
  ],
  "strengths": ["<Strength 1>", "<Strength 2>"],
  "concerns": ["<Concern 1>", "<Concern 2>"],
  "certifications": [
    {
      "name": "<ISO 27001 | SOC 2 Type II | SOC 2 Type I | PCI DSS | HIPAA | FedRAMP | Other>",
      "status": "confirmed" | "claimed" | "expired" | "missing",
      "details": "<Scope, expiry, coverage or null>"
    }
  ],
  "compliance": [
    {
      "label": "<GDPR | CCPA | ISO 27001 | SOC 2 | HIPAA | PCI DSS | etc.>",
      "status": "compliant" | "partial" | "missing" | "na",
      "notes": "<Brief explanation>"
    }
  ],
  "scoreBreakdown": {
    "privacyPosture": <0-100>,
    "securityPosture": <0-100>,
    "gdprCompliance": <0-100>,
    "ccpaCompliance": <0-100>,
    "contractualRisk": <0-100>,
    "vendorTransparency": <0-100>
  }
}`;
function summariseWebsiteIntelligence(scanResult) {
  const lines = [
    `[WEBSITE INTELLIGENCE]`,
    `Homepage: ${scanResult.homepage}`,
    `Scanned at: ${scanResult.scannedAt}`,
    `Discovered pages: ${scanResult.discoveredPages.length}`
  ];
  if (scanResult.metadata) {
    const m = scanResult.metadata;
    if (m.title) lines.push(`Site title: ${m.title}`);
    if (m.description) lines.push(`Meta description: ${m.description}`);
    if (m.language) lines.push(`Language: ${m.language}`);
    const relevantHeaders = [
      "content-security-policy",
      "strict-transport-security",
      "x-frame-options",
      "x-content-type-options",
      "permissions-policy",
      "referrer-policy",
      "x-xss-protection"
    ];
    const foundHeaders = relevantHeaders.filter((h) => h in (m.headers ?? {}));
    if (foundHeaders.length > 0) {
      lines.push(`Security headers present: ${foundHeaders.join(", ")}`);
    } else {
      lines.push(`Security headers: none detected`);
    }
    if (m.openGraph && Object.keys(m.openGraph).length > 0) {
      const ogTitle = m.openGraph["og:title"] || m.openGraph["title"];
      if (ogTitle) lines.push(`OG title: ${ogTitle}`);
    }
  }
  const compliancePages = {
    "Privacy Policy": scanResult.privacyPolicy,
    "Cookie Policy": scanResult.cookiePolicy,
    "Security Page": scanResult.securityPage,
    "Trust Center": scanResult.trustCenter,
    "Terms": scanResult.terms,
    "Legal": scanResult.legal,
    "DPA": scanResult.dpa,
    "AI Policy": scanResult.aiPolicy,
    "Responsible AI": scanResult.responsibleAI
  };
  lines.push(`
[COMPLIANCE PAGES DISCOVERED]`);
  for (const [name, page] of Object.entries(compliancePages)) {
    if (page && page.reachable) {
      lines.push(`\u2713 ${name}: ${page.url} (HTTP ${page.statusCode})`);
    } else if (page && !page.reachable) {
      lines.push(`\u2717 ${name}: found but not reachable (HTTP ${page.statusCode})`);
    } else {
      lines.push(`\u2717 ${name}: not found`);
    }
  }
  const reachableCount = Object.values(compliancePages).filter((p) => p?.reachable).length;
  lines.push(`
Compliance pages reachable: ${reachableCount} / ${Object.keys(compliancePages).length}`);
  return lines.join("\n");
}
var VendorReviewAgent = class {
  /**
   * Review a vendor using merged context from documents and/or website scan.
   *
   * @param params.documentText   Merged plaintext from uploaded documents (may be empty)
   * @param params.websiteScan    Structured website intelligence (may be null)
   * @param params.userId         User ID for scoped RAG retrieval
   * @param params.fileIds        Indexed file IDs for RAG retrieval scope
   */
  async reviewVendor(params) {
    const { documentText, websiteScan, userId, fileIds } = params;
    console.log(
      `[VendorReviewAgent] reviewVendor called \u2014 userId=${userId} fileIds=${fileIds && fileIds.length > 0 ? fileIds.join(", ") : "(none \u2014 ephemeral)"} documentText length=${documentText.length} websiteScan=${websiteScan ? "yes" : "no"}`
    );
    let ragContext = "";
    if (fileIds && fileIds.length > 0) {
      try {
        const chunks = await searchHybrid(
          VENDOR_RETRIEVAL_QUERY,
          userId,
          fileIds
        );
        const ownChunks = chunks.filter((c) => fileIds.includes(c.file_id));
        const foreignChunks = chunks.filter((c) => !fileIds.includes(c.file_id));
        if (foreignChunks.length > 0) {
          console.warn(
            `[VendorReviewAgent] Discarding ${foreignChunks.length} chunk(s) from unrelated files: ` + foreignChunks.map((c) => c.title ?? c.file_id).join(", ")
          );
        }
        if (ownChunks.length > 0) {
          ragContext = ownChunks.map((c) => `[${c.title ?? "Vendor Document"}]
${c.content}`).join("\n\n");
          console.log(
            `[VendorReviewAgent] Using ${ownChunks.length} RAG chunk(s) from the uploaded file(s) for context`
          );
        } else {
          console.log(
            `[VendorReviewAgent] No indexed chunks found for provided fileIds \u2014 falling back to raw document text`
          );
        }
      } catch (ragErr) {
        console.warn(
          "[VendorReviewAgent] RAG retrieval failed, continuing without it:",
          ragErr.message
        );
      }
    } else {
      console.log(
        "[VendorReviewAgent] No fileIds provided \u2014 skipping RAG to avoid returning chunks from unrelated documents"
      );
    }
    const contextParts = [];
    if (websiteScan) {
      contextParts.push(summariseWebsiteIntelligence(websiteScan));
    }
    if (ragContext.length > 0) {
      contextParts.push(`[DOCUMENT CONTEXT (RAG \u2014 uploaded file)]
${ragContext}`);
    } else if (documentText.length > 0) {
      contextParts.push(
        `[DOCUMENT CONTENT]
${documentText.substring(0, 12e3)}` + (documentText.length > 12e3 ? "\n...[truncated]" : "")
      );
    }
    const assembledContext = contextParts.join("\n\n");
    console.log(
      `[VendorReviewAgent] Context assembled \u2014 websiteScan=${websiteScan ? "yes" : "no"}, contextSource=${ragContext.length > 0 ? "RAG chunks from uploaded file(s)" : documentText.length > 0 ? "raw document text" : "website only"}, rawDocLen=${documentText.length}, totalContextLen=${assembledContext.length}`
    );
    const hasWebsiteContent = websiteScan !== null && (websiteScan.discoveredPages.length > 0 || Object.values({
      p: websiteScan.privacyPolicy,
      c: websiteScan.cookiePolicy,
      s: websiteScan.securityPage,
      t: websiteScan.trustCenter,
      terms: websiteScan.terms,
      l: websiteScan.legal,
      d: websiteScan.dpa,
      a: websiteScan.aiPolicy,
      r: websiteScan.responsibleAI
    }).some((p) => p?.reachable));
    const hasDocumentContent = ragContext.length > 0 || documentText.length > 100;
    if (!hasWebsiteContent && !hasDocumentContent) {
      console.warn(
        "[VendorReviewAgent] No usable content retrieved \u2014 refusing heuristic analysis."
      );
      throw new Error(
        "We couldn't retrieve enough content from this website to perform an analysis. Please try again later or upload supporting documents."
      );
    }
    const userPrompt = `[VENDOR ASSESSMENT CONTEXT]
${assembledContext}

Perform a comprehensive vendor risk assessment based on the above context. Evaluate all dimensions as specified. Return only the structured JSON.`;
    let responseText;
    try {
      console.log(
        `[VendorReviewAgent] Calling OpenRouter \u2014 prompt length: ${userPrompt.length} chars`
      );
      responseText = await openRouterComplete(SYSTEM_PROMPT2, userPrompt, {
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 4096
      });
    } catch (llmErr) {
      console.error("[VendorReviewAgent] OpenRouter call failed:", llmErr);
      throw llmErr;
    }
    responseText = responseText.trim();
    console.log(
      `[VendorReviewAgent] Raw LLM response (${responseText.length} chars):
` + responseText.substring(0, 3e3) + (responseText.length > 3e3 ? `
...[truncated, total ${responseText.length} chars]` : "")
    );
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    }
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      console.warn(
        "[VendorReviewAgent] JSON parse failed. Falling back to heuristic analysis.\n",
        responseText.substring(0, 500)
      );
      return this.heuristicFallback(documentText, websiteScan);
    }
    let normalizationApplied = false;
    const ensureArray = (val, key) => {
      if (!Array.isArray(val)) {
        normalizationApplied = true;
        return [];
      }
      return val;
    };
    parsed.findings = ensureArray(parsed.findings, "findings");
    parsed.recommendations = ensureArray(parsed.recommendations, "recommendations");
    parsed.strengths = ensureArray(parsed.strengths, "strengths");
    parsed.concerns = ensureArray(parsed.concerns, "concerns");
    parsed.certifications = ensureArray(parsed.certifications, "certifications");
    parsed.compliance = ensureArray(parsed.compliance, "compliance");
    if (!parsed.vendorInfo || typeof parsed.vendorInfo !== "object") {
      parsed.vendorInfo = {};
      normalizationApplied = true;
    }
    const vi = parsed.vendorInfo;
    const nullToUndefined = (v) => v === null || v === void 0 ? void 0 : String(v);
    vi.name = nullToUndefined(vi.name);
    vi.industry = nullToUndefined(vi.industry);
    vi.headquarters = nullToUndefined(vi.headquarters);
    vi.dataRegions = nullToUndefined(vi.dataRegions);
    vi.primaryServices = nullToUndefined(vi.primaryServices);
    if (Object.values(vi).some((v) => v === null)) normalizationApplied = true;
    if (!parsed.scoreBreakdown || typeof parsed.scoreBreakdown !== "object") {
      parsed.scoreBreakdown = {
        privacyPosture: 50,
        securityPosture: 50,
        gdprCompliance: 50,
        ccpaCompliance: 50,
        contractualRisk: 50,
        vendorTransparency: 50
      };
      normalizationApplied = true;
    } else {
      const sbDefaults = {
        privacyPosture: 50,
        securityPosture: 50,
        gdprCompliance: 50,
        ccpaCompliance: 50,
        contractualRisk: 50,
        vendorTransparency: 50
      };
      for (const key of Object.keys(sbDefaults)) {
        const val = parsed.scoreBreakdown[key];
        if (typeof val !== "number") {
          parsed.scoreBreakdown[key] = sbDefaults[key];
          normalizationApplied = true;
        } else {
          parsed.scoreBreakdown[key] = Math.max(0, Math.min(100, val));
        }
      }
    }
    parsed.findings = parsed.findings.map((f, i) => ({
      ...f,
      id: f.id ?? `finding_${i + 1}`,
      severity: ["low", "medium", "high", "critical"].includes(f.severity) ? f.severity : "medium",
      status: ["passed", "warning", "missing", "high-risk"].includes(f.status) ? f.status : "warning"
    }));
    parsed.recommendations = parsed.recommendations.map((r) => ({
      ...r,
      priority: ["critical", "high", "medium", "low"].includes(r.priority) ? r.priority : "medium",
      items: Array.isArray(r.items) ? r.items : []
    }));
    parsed.certifications = parsed.certifications.map((c) => {
      const cert = {
        name: c.name ?? "Unknown",
        status: ["confirmed", "claimed", "expired", "missing"].includes(c.status) ? c.status : "missing"
      };
      if (c.details !== null && c.details !== void 0) {
        cert.details = String(c.details);
      }
      if (c.details === null) normalizationApplied = true;
      return cert;
    });
    parsed.compliance = parsed.compliance.map((c) => {
      const item = {
        label: c.label ?? "Unknown",
        status: ["compliant", "partial", "missing", "na"].includes(c.status) ? c.status : "missing"
      };
      if (c.notes !== null && c.notes !== void 0) {
        item.notes = String(c.notes);
      }
      if (c.notes === null) normalizationApplied = true;
      return item;
    });
    if (!["low", "medium", "high", "critical"].includes(parsed.overallRisk)) {
      parsed.overallRisk = "medium";
      normalizationApplied = true;
    }
    if (typeof parsed.overallScore !== "number") {
      parsed.overallScore = 50;
      normalizationApplied = true;
    }
    if (normalizationApplied) {
      console.log(
        "[VendorReviewAgent] Normalization applied \u2014 LLM used a non-standard or partial shape. Keys present in raw response: " + Object.keys(parsed).join(", ")
      );
    } else {
      console.log("[VendorReviewAgent] No normalization needed \u2014 LLM output matched expected schema");
    }
    console.log(
      "[VendorReviewAgent] Normalized object (pre-Zod):",
      JSON.stringify(parsed, null, 2).substring(0, 3e3)
    );
    try {
      return VendorReviewResultSchema.parse(parsed);
    } catch (validationErr) {
      console.warn(
        "[VendorReviewAgent] Zod validation failed after normalization. Falling back to heuristic.\n",
        JSON.stringify(validationErr?.errors ?? validationErr, null, 2)
      );
      return this.heuristicFallback(documentText, websiteScan);
    }
  }
  // ── Heuristic fallback ────────────────────────────────────────────────────
  heuristicFallback(content, websiteScan) {
    const lower = content.toLowerCase();
    const findings = [];
    const hasPrivacyPolicy = websiteScan?.privacyPolicy?.reachable || lower.includes("privacy policy");
    findings.push({
      id: "h_1",
      title: "Privacy Policy",
      category: "Privacy",
      severity: hasPrivacyPolicy ? "low" : "high",
      status: hasPrivacyPolicy ? "passed" : "missing",
      description: hasPrivacyPolicy ? "A privacy policy was identified in the provided context." : "No privacy policy was detected in the provided context.",
      recommendation: hasPrivacyPolicy ? "Review the privacy policy for GDPR lawful basis, data subject rights, and retention periods." : "Request a formal privacy policy before onboarding."
    });
    const hasDPA = websiteScan?.dpa?.reachable || lower.includes("data processing agreement") || lower.includes(" dpa ");
    findings.push({
      id: "h_2",
      title: "DPA Availability",
      category: "GDPR",
      severity: hasDPA ? "low" : "high",
      status: hasDPA ? "passed" : "missing",
      description: hasDPA ? "A Data Processing Agreement reference was detected." : "No Data Processing Agreement was identified.",
      recommendation: hasDPA ? "Ensure the DPA covers all GDPR Article 28 mandatory provisions." : "Require a signed DPA before any personal data processing begins."
    });
    const hasISO = lower.includes("iso 27001") || lower.includes("iso27001");
    findings.push({
      id: "h_3",
      title: "ISO 27001 Certification",
      category: "Certifications",
      severity: hasISO ? "low" : "medium",
      status: hasISO ? "passed" : "warning",
      description: hasISO ? "ISO 27001 reference detected in provided documentation." : "No ISO 27001 certification evidence found.",
      recommendation: hasISO ? "Verify the certificate is current and its scope covers the services in use." : "Request a current ISO 27001 certificate with audit scope."
    });
    const hasSOC2 = lower.includes("soc 2") || lower.includes("soc2");
    findings.push({
      id: "h_4",
      title: "SOC 2 Report",
      category: "Certifications",
      severity: hasSOC2 ? "low" : "medium",
      status: hasSOC2 ? "warning" : "missing",
      description: hasSOC2 ? "SOC 2 reference detected. Verify whether Type II (preferred) is available." : "No SOC 2 report evidence found.",
      recommendation: "Request a current SOC 2 Type II report covering at least 6 months."
    });
    if (websiteScan) {
      const trustCenter = websiteScan.trustCenter?.reachable;
      findings.push({
        id: "h_5",
        title: "Trust Center",
        category: "Trust Center",
        severity: trustCenter ? "low" : "medium",
        status: trustCenter ? "passed" : "missing",
        description: trustCenter ? `Trust Center page found at ${websiteScan.trustCenter.url}` : "No dedicated Trust Center page was found on the vendor website.",
        recommendation: trustCenter ? "Review the Trust Center for current certifications, audit reports, and sub-processor list." : "Request that the vendor publish a Trust Center with compliance documentation."
      });
    }
    const passedCount = findings.filter((f) => f.status === "passed").length;
    const overallScore = Math.round(passedCount / findings.length * 70) + 10;
    return {
      overallScore,
      overallRisk: overallScore >= 70 ? "low" : overallScore >= 50 ? "medium" : "high",
      summary: "Heuristic analysis completed. A full AI-powered review could not be generated. The context was scanned for key compliance signals. Manual review is strongly recommended.",
      vendorInfo: {
        name: void 0,
        industry: void 0,
        headquarters: void 0,
        dataRegions: void 0,
        primaryServices: void 0
      },
      findings,
      recommendations: [
        {
          category: "Immediate Actions",
          priority: "critical",
          items: [
            "Conduct a manual vendor due diligence review.",
            "Request DPA, privacy policy, and current security certifications.",
            "Verify sub-processor list and international transfer mechanisms."
          ]
        }
      ],
      strengths: findings.filter((f) => f.status === "passed").map((f) => f.title),
      concerns: findings.filter((f) => f.status !== "passed").map((f) => f.title),
      certifications: [
        { name: "ISO 27001", status: lower.includes("iso 27001") ? "claimed" : "missing" },
        { name: "SOC 2 Type II", status: lower.includes("soc 2") ? "claimed" : "missing" }
      ],
      compliance: [
        { label: "GDPR", status: hasDPA ? "partial" : "missing", notes: "DPA availability check" },
        { label: "CCPA", status: "missing", notes: "No CCPA evidence in context" },
        { label: "ISO 27001", status: hasISO ? "partial" : "missing" },
        { label: "SOC 2", status: hasSOC2 ? "partial" : "missing" }
      ],
      scoreBreakdown: {
        privacyPosture: hasPrivacyPolicy ? 60 : 20,
        securityPosture: hasISO ? 65 : 25,
        gdprCompliance: hasDPA ? 55 : 15,
        ccpaCompliance: 20,
        contractualRisk: 40,
        vendorTransparency: websiteScan?.trustCenter?.reachable ? 60 : 20
      }
    };
  }
};

// src/agents/aiEthicsAgent.ts
import { z as z4 } from "zod";
var EthicsFindingSchema = z4.object({
  id: z4.string(),
  title: z4.string(),
  category: z4.string(),
  severity: z4.enum(["low", "medium", "high", "critical"]),
  status: z4.enum(["passed", "needs-improvement", "warning", "high-risk"]),
  evidenceConfidence: z4.enum(["VERIFIED_PRESENT", "UNABLE_TO_VERIFY", "VERIFIED_MISSING"]).optional(),
  description: z4.string(),
  evidence: z4.string().optional(),
  recommendation: z4.string()
});
var EthicsRecommendationSchema = z4.object({
  category: z4.string(),
  priority: z4.enum(["critical", "high", "medium", "low"]),
  items: z4.array(z4.string())
});
var EthicsScoreBreakdownSchema = z4.object({
  aiGovernance: z4.number().min(0).max(100),
  transparency: z4.number().min(0).max(100),
  fairness: z4.number().min(0).max(100),
  accountability: z4.number().min(0).max(100),
  privacyProtection: z4.number().min(0).max(100),
  humanOversight: z4.number().min(0).max(100),
  explainability: z4.number().min(0).max(100),
  riskManagement: z4.number().min(0).max(100)
});
var EthicsDimensionSchema = z4.object({
  dimension: z4.string(),
  score: z4.number().min(0).max(100),
  status: z4.enum(["strong", "adequate", "weak", "absent"]),
  notes: z4.string().optional()
});
var StandardAlignmentSchema = z4.object({
  standard: z4.string(),
  alignment: z4.enum(["strong", "partial", "weak", "absent"]),
  gaps: z4.array(z4.string()).optional()
});
var AIEthicsResultSchema = z4.object({
  overallScore: z4.number().min(0).max(100),
  overallRisk: z4.enum(["low", "medium", "high", "critical"]),
  summary: z4.string(),
  findings: z4.array(EthicsFindingSchema),
  recommendations: z4.array(EthicsRecommendationSchema),
  strengths: z4.array(z4.string()),
  concerns: z4.array(z4.string()),
  scoreBreakdown: EthicsScoreBreakdownSchema,
  ethicsDimensions: z4.array(EthicsDimensionSchema),
  standardAlignment: z4.array(StandardAlignmentSchema).optional()
});
var AI_ETHICS_RETRIEVAL_QUERY = "responsible AI policy AI governance framework ethical principles fairness bias mitigation transparency explainability accountability human oversight AI risk management NIST AI RMF ISO 42001 OECD AI EU AI Act model monitoring data governance AI documentation incident response privacy protection AI lifecycle";
var SYSTEM_PROMPT3 = `You are a senior Responsible AI and AI Ethics Compliance Analyst specialising in AI governance frameworks, ethical AI assessment, and regulatory alignment.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
CRITICAL EPISTEMOLOGICAL RULES \u2014 READ BEFORE ANALYSING
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

Our scanner probes a finite set of well-known URL paths. It does NOT crawl every
page on a website. A policy, framework or page NOT found by the scanner may still
exist at a non-standard URL, in a PDF, in annual reports, or in product documentation.

You MUST apply one of exactly THREE evidence confidence levels to every finding:

  VERIFIED_PRESENT   \u2014 Page/document was found AND content was extracted confirming
                       the practice. Use this when extracted text directly evidences
                       the claim. Cite the specific URL and quote supporting text.

  UNABLE_TO_VERIFY   \u2014 The scanner did not locate this content, OR the scan
                       coverage was partial/low, OR the item may exist elsewhere.
                       This is the CORRECT label when absence of discovery \u2260 absence
                       of policy. Use when: scan coverage is LOW/MEDIUM, when the
                       organisation is a large technology company (who typically do
                       publish such policies), or when you have no extracted content
                       to confirm or deny.

  VERIFIED_MISSING   \u2014 Only use this when you have HIGH confidence the item truly
                       does not exist. Requires: (a) HIGH scan coverage AND (b)
                       extracted page content from related pages that explicitly
                       contradicts existence, AND (c) the company is small/new where
                       absence is plausible. NEVER mark VERIFIED_MISSING for a major
                       AI company unless you have strong direct evidence of absence.

FORBIDDEN INFERENCES:
  \u2717 DO NOT conclude a policy is missing because it was not at a standard URL path.
  \u2717 DO NOT conclude a framework does not exist because a specific page was empty.
  \u2717 DO NOT assign VERIFIED_MISSING when scan coverage is LOW or MEDIUM.
  \u2717 DO NOT use words like "no evidence was found" to justify a "missing" status
    when the scan coverage quality was LOW or VERY LOW.

REQUIRED BEHAVIOUR:
  \u2713 When scan coverage is HIGH and content was extracted: provide evidence-grounded findings.
  \u2713 When scan coverage is MEDIUM: use UNABLE_TO_VERIFY for items without direct text evidence.
  \u2713 When scan coverage is LOW or VERY LOW: default to UNABLE_TO_VERIFY for most findings.
  \u2713 When extracted page content exists: quote it. Be specific. Cite the URL.
  \u2713 Calibrate overallScore conservatively when coverage is limited.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

Perform a comprehensive AI Ethics Review based on the provided context. Evaluate ALL 19 dimensions below:

1. AI Governance Framework (policies, committees, ownership, AI Officer)
2. Responsible AI Policy (formal policy, scope, enforcement)
3. Transparency (model cards, system cards, public documentation)
4. Explainability (XAI mechanisms, user-facing explanations, GDPR Art. 22)
5. Fairness (bias audits, protected attributes, fairness metrics)
6. Bias Mitigation (bias testing pipeline, monitoring, remediation)
7. Human Oversight (review checkpoints, override mechanisms, escalation)
8. Accountability (ownership, audit trails, incident register)
9. Privacy Protection (data minimisation, DPIA, consent, retention)
10. Security (adversarial robustness, red-teaming, model security)
11. Model Monitoring (drift detection, performance monitoring, alerting)
12. Risk Management (risk register, risk classification, impact assessment)
13. Data Governance (data lineage, quality, provenance, consent)
14. AI Documentation (technical docs, model cards, data cards)
15. Regulatory Readiness (GDPR, EU AI Act, sector-specific regs)
16. AI Lifecycle Management (versioning, deprecation, release governance)
17. Incident Response (AI incident plan, severity classification, SLAs)
18. Ethical Principles (published principles, training, culture)
19. Compliance with Responsible AI Standards (NIST AI RMF, ISO/IEC 42001, OECD, EU AI Act, Google RAI, Microsoft RAI Standard)

STANDARDS TO ASSESS:
- NIST AI Risk Management Framework (AI RMF): GOVERN, MAP, MEASURE, MANAGE functions
- ISO/IEC 42001: AI management system requirements, objectives, continual improvement
- OECD AI Principles: inclusive growth, human-centred values, transparency, robustness, accountability
- EU AI Act: risk classification (unacceptable/high/limited/minimal), conformity assessment, transparency obligations
- Google Responsible AI Principles: social benefit, safety, privacy, accountability, scientific excellence
- Microsoft Responsible AI Standard: fairness, reliability & safety, privacy & security, inclusiveness, transparency, accountability

SCORING GUIDANCE:
- When scan coverage is HIGH and evidence is strong: score on full 0\u2013100 range
- When scan coverage is MEDIUM: compress scores toward centre (30\u201370 range) reflecting uncertainty
- When scan coverage is LOW: use 40\u201360 as baseline, adjust only when extracted content is decisive
- overallScore should reflect EVIDENCE QUALITY, not just presence of URL stubs

Return ONLY a valid JSON object \u2014 absolutely no markdown fences, no preamble, no commentary.

The JSON must exactly match this schema:
{
  "overallScore": <integer 0-100>,
  "overallRisk": "low" | "medium" | "high" | "critical",
  "summary": "<3-5 sentence executive summary. MUST state the scan coverage level, how many pages had content extracted, and explicitly note what could not be verified due to scanner limitations>",
  "findings": [
    {
      "id": "finding_1",
      "title": "<Short finding title>",
      "category": "<Category matching one of the 19 dimensions above>",
      "severity": "low" | "medium" | "high" | "critical",
      "status": "passed" | "needs-improvement" | "warning" | "high-risk",
      "evidenceConfidence": "VERIFIED_PRESENT" | "UNABLE_TO_VERIFY" | "VERIFIED_MISSING",
      "description": "<What was found. If VERIFIED_PRESENT: quote specific evidence. If UNABLE_TO_VERIFY: explain why \u2014 scanner limitation, partial coverage, or page not at standard path. If VERIFIED_MISSING: provide strong justification.>",
      "evidence": "<Direct quote or specific reference from extracted content, OR 'No content extracted from this page \u2014 cannot confirm or deny' if UNABLE_TO_VERIFY>",
      "recommendation": "<Concrete actionable recommendation>"
    }
  ],
  "recommendations": [
    {
      "category": "<Category name>",
      "priority": "critical" | "high" | "medium" | "low",
      "items": ["<Actionable item 1>", "<item 2>"]
    }
  ],
  "strengths": ["<Strength 1 \u2014 only list if VERIFIED_PRESENT>"],
  "concerns": ["<Concern 1 \u2014 use careful language; distinguish confirmed gaps from unverified items>"],
  "scoreBreakdown": {
    "aiGovernance":      <0-100>,
    "transparency":      <0-100>,
    "fairness":          <0-100>,
    "accountability":    <0-100>,
    "privacyProtection": <0-100>,
    "humanOversight":    <0-100>,
    "explainability":    <0-100>,
    "riskManagement":    <0-100>
  },
  "ethicsDimensions": [
    {
      "dimension": "<Dimension name>",
      "score": <0-100>,
      "status": "strong" | "adequate" | "weak" | "absent",
      "notes": "<Evidence-based note. State evidence confidence level.>"
    }
  ],
  "standardAlignment": [
    {
      "standard": "NIST AI RMF" | "ISO/IEC 42001" | "OECD AI Principles" | "EU AI Act" | "Google Responsible AI" | "Microsoft Responsible AI Standard",
      "alignment": "strong" | "partial" | "weak" | "absent",
      "gaps": ["<Gap 1 \u2014 only list as gap if VERIFIED_MISSING, otherwise list as 'Not verified by scanner'>"]
    }
  ]
}`;
function summariseWebsiteIntelligence2(scanResult) {
  const lines = [
    `[WEBSITE INTELLIGENCE \u2014 SCAN COVERAGE REPORT]`,
    `Homepage: ${scanResult.homepage}`,
    `Scanned at: ${scanResult.scannedAt}`,
    `Discovered pages via crawl: ${scanResult.discoveredPages.length}`,
    ``,
    `IMPORTANT: This report reflects what our automated scanner found by probing`,
    `well-known URL paths. Pages NOT listed below may still exist at non-standard`,
    `paths. Absence from this report does NOT prove a policy does not exist.`,
    `Always apply the evidence confidence levels defined in the analysis instructions.`
  ];
  if (scanResult.metadata) {
    const m = scanResult.metadata;
    if (m.title) lines.push(``, `Site title: ${m.title}`);
    if (m.description) lines.push(`Meta description: ${m.description}`);
    if (m.language) lines.push(`Language: ${m.language}`);
    const relevantHeaders = [
      "content-security-policy",
      "strict-transport-security",
      "x-frame-options",
      "x-content-type-options",
      "permissions-policy"
    ];
    const foundHeaders = relevantHeaders.filter((h) => h in (m.headers ?? {}));
    lines.push(
      foundHeaders.length > 0 ? `Security headers present: ${foundHeaders.join(", ")}` : `Security headers: none detected by scanner`
    );
  }
  const allPages = {
    "AI Policy": scanResult.aiPolicy,
    "Responsible AI": scanResult.responsibleAI,
    "Safety Page": scanResult.safetyPage,
    "Policies Page": scanResult.policiesPage,
    "Model Spec": scanResult.modelSpec,
    "Transparency": scanResult.transparencyPage,
    "Charter": scanResult.charterPage,
    "Privacy Policy": scanResult.privacyPolicy,
    "Trust Center": scanResult.trustCenter,
    "Security Page": scanResult.securityPage,
    "Legal": scanResult.legal,
    "DPA": scanResult.dpa,
    "Terms": scanResult.terms,
    "Cookie Policy": scanResult.cookiePolicy
  };
  lines.push(``, `[PAGE DISCOVERY RESULTS]`);
  lines.push(`(\u2713 = reachable at standard path | \u2717 = not found at standard path | ? = scan incomplete)`);
  for (const [name, page] of Object.entries(allPages)) {
    if (page?.reachable) {
      lines.push(`\u2713 ${name}: ${page.url} (HTTP ${page.statusCode}) \u2014 EVIDENCE AVAILABLE`);
    } else if (page && !page.reachable) {
      lines.push(`\u2717 ${name}: probed but unreachable at ${page.url} (HTTP ${page.statusCode})`);
    } else {
      lines.push(`\u2717 ${name}: not found at standard paths (may exist elsewhere)`);
    }
  }
  const reachableAIPages = [
    scanResult.aiPolicy,
    scanResult.responsibleAI,
    scanResult.safetyPage,
    scanResult.policiesPage,
    scanResult.modelSpec,
    scanResult.transparencyPage,
    scanResult.charterPage
  ].filter((p) => p?.reachable).length;
  const reachableAllPages = Object.values(allPages).filter((p) => p?.reachable).length;
  lines.push(
    ``,
    `AI governance pages found: ${reachableAIPages} / 7`,
    `All compliance pages found: ${reachableAllPages} / ${Object.keys(allPages).length}`,
    ``,
    `SCAN COVERAGE QUALITY: ${reachableAllPages >= 6 ? "HIGH \u2014 substantial evidence available" : reachableAllPages >= 3 ? "MEDIUM \u2014 partial evidence, apply lower confidence to missing items" : reachableAllPages >= 1 ? "LOW \u2014 limited evidence, treat absences as Unable to Verify" : "VERY LOW \u2014 scanner found minimal pages; most findings should be Unable to Verify"}`
  );
  if (scanResult.extractedPageContents && scanResult.extractedPageContents.length > 0) {
    lines.push(``, `[EXTRACTED PAGE CONTENT]`);
    lines.push(`The following pages were fetched and their content extracted for analysis:`);
    for (const page of scanResult.extractedPageContents) {
      lines.push(
        ``,
        `--- PAGE: ${page.title} ---`,
        `URL: ${page.url}`,
        `Content (${page.fullTextLength} chars total, showing first 3000):`,
        page.textSnippet,
        `--- END PAGE ---`
      );
    }
    lines.push(
      ``,
      `Total pages with extracted content: ${scanResult.extractedPageContents.length}`,
      `Total extracted characters: ${scanResult.extractedPageContents.reduce((s, p) => s + p.fullTextLength, 0)}`
    );
  } else {
    lines.push(
      ``,
      `[EXTRACTED PAGE CONTENT]`,
      `No page content was extracted (content extraction was not available or all pages were empty).`,
      `Analysis must rely solely on URL presence signals above \u2014 apply LOWER confidence to all findings.`
    );
  }
  return lines.join("\n");
}
var AIEthicsAgent = class {
  /**
   * Review an AI company's responsible AI posture.
   *
   * @param params.documentText  Merged plaintext from uploaded documents (may be empty)
   * @param params.websiteScan   Structured website intelligence (may be null)
   * @param params.userId        User ID for scoped RAG retrieval
   * @param params.fileIds       Indexed file IDs for RAG retrieval scope
   */
  async reviewAIEthics(params) {
    const { documentText, websiteScan, userId, fileIds } = params;
    console.log(`[AIEthicsAgent] \u2500\u2500 INPUT DIAGNOSTIC \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    console.log(`[AIEthicsAgent] Received fileIds:      ${JSON.stringify(fileIds ?? [])}`);
    console.log(`[AIEthicsAgent] documentText length:   ${documentText.length} chars`);
    console.log(`[AIEthicsAgent] websiteScan:           ${websiteScan ? "yes" : "no"}`);
    console.log(`[AIEthicsAgent] \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    let ragContext = "";
    const hasFileIds = Array.isArray(fileIds) && fileIds.length > 0;
    console.log(
      `[AIEthicsAgent] RAG: ${hasFileIds ? `attempting with fileIds=${JSON.stringify(fileIds)}` : "SKIPPED \u2014 no fileIds provided (avoids cross-document contamination)"}`
    );
    if (hasFileIds) {
      try {
        const chunks = await searchHybrid(
          AI_ETHICS_RETRIEVAL_QUERY,
          userId,
          fileIds
        );
        const ownChunks = chunks.filter((c) => fileIds.includes(c.file_id));
        const foreignChunks = chunks.filter((c) => !fileIds.includes(c.file_id));
        console.log(
          `[AIEthicsAgent] RAG result \u2014 total: ${chunks.length}, own: ${ownChunks.length}, foreign: ${foreignChunks.length}`
        );
        if (foreignChunks.length > 0) {
          console.warn(
            `[AIEthicsAgent] Discarding ${foreignChunks.length} chunk(s) from unrelated files: ` + foreignChunks.map((c) => c.title ?? c.file_id).join(", ")
          );
        }
        if (ownChunks.length > 0) {
          ragContext = ownChunks.map((c) => `[${c.title ?? "AI Documentation"}]
${c.content}`).join("\n\n");
          console.log(
            `[AIEthicsAgent] Using ${ownChunks.length} RAG chunk(s) from the uploaded file(s)`
          );
        } else {
          console.log(
            `[AIEthicsAgent] No indexed chunks found for provided fileIds \u2014 falling back to raw documentText`
          );
        }
      } catch (ragErr) {
        console.warn(
          "[AIEthicsAgent] RAG retrieval failed, continuing without it:",
          ragErr.message
        );
      }
    }
    const contextParts = [];
    if (websiteScan) {
      const websiteSummary = summariseWebsiteIntelligence2(websiteScan);
      contextParts.push(websiteSummary);
      console.log(
        `[AIEthicsAgent] Website scan \u2014 discoveredPages: ${websiteScan.discoveredPages.length}, aiPolicy: ${websiteScan.aiPolicy?.reachable ? "found" : "not found"}, responsibleAI: ${websiteScan.responsibleAI?.reachable ? "found" : "not found"}, safetyPage: ${websiteScan.safetyPage?.reachable ? "found" : "not found"}, policiesPage: ${websiteScan.policiesPage?.reachable ? "found" : "not found"}, modelSpec: ${websiteScan.modelSpec?.reachable ? "found" : "not found"}, extractedPageContents: ${websiteScan.extractedPageContents?.length ?? 0}`
      );
    }
    const usingRag = ragContext.length > 0;
    const contextSource = usingRag ? "RAG chunks from uploaded file(s)" : documentText.length > 0 ? "raw documentText" : "website-only";
    if (usingRag) {
      contextParts.push(`[DOCUMENT CONTEXT (RAG \u2014 uploaded file)]
${ragContext}`);
    } else if (documentText.length > 0) {
      contextParts.push(
        `[DOCUMENT CONTENT]
${documentText.substring(0, 12e3)}` + (documentText.length > 12e3 ? "\n...[truncated]" : "")
      );
    }
    console.log(
      `[AIEthicsAgent] Context source: ${contextSource} \u2014 ragLen=${ragContext.length}, docTextLen=${documentText.length}`
    );
    const assembledContext = contextParts.join("\n\n");
    console.log(
      `[AIEthicsAgent] Context assembled \u2014 websiteScan=${websiteScan ? "yes" : "no"}, ragChunks=${ragContext.length > 0 ? "yes" : "no"}, rawDocLen=${documentText.length}, extractedPages=${websiteScan?.extractedPageContents?.length ?? 0}, totalContextLen=${assembledContext.length}`
    );
    const hasWebsiteContent = websiteScan !== null && (websiteScan.discoveredPages.length > 0 || Object.values({
      p: websiteScan.privacyPolicy,
      c: websiteScan.cookiePolicy,
      s: websiteScan.securityPage,
      t: websiteScan.trustCenter,
      terms: websiteScan.terms,
      l: websiteScan.legal,
      d: websiteScan.dpa,
      a: websiteScan.aiPolicy,
      r: websiteScan.responsibleAI,
      safety: websiteScan.safetyPage,
      policies: websiteScan.policiesPage,
      modelSpec: websiteScan.modelSpec,
      transparency: websiteScan.transparencyPage,
      charter: websiteScan.charterPage
    }).some((p) => p?.reachable));
    const hasDocumentContent = ragContext.length > 0 || documentText.length > 100;
    if (!hasWebsiteContent && !hasDocumentContent) {
      console.warn(
        "[AIEthicsAgent] No usable content retrieved \u2014 refusing heuristic analysis."
      );
      throw new Error(
        "We couldn't retrieve enough content from this website to perform an analysis. Please try again later or upload supporting documents."
      );
    }
    const userPrompt = `[AI ETHICS ASSESSMENT CONTEXT]
${assembledContext}

Perform a comprehensive AI Ethics Review based on the above context. Evaluate all 19 dimensions and all 6 responsible AI standards specified. Return only the structured JSON.`;
    const extractedCount = params.websiteScan?.extractedPageContents?.length ?? 0;
    const extractedUrls = params.websiteScan?.extractedPageContents?.map((p) => p.url) ?? [];
    const reachablePages = params.websiteScan ? [
      params.websiteScan.aiPolicy,
      params.websiteScan.responsibleAI,
      params.websiteScan.safetyPage,
      params.websiteScan.policiesPage,
      params.websiteScan.modelSpec,
      params.websiteScan.transparencyPage,
      params.websiteScan.charterPage,
      params.websiteScan.privacyPolicy,
      params.websiteScan.trustCenter,
      params.websiteScan.securityPage
    ].filter((p) => p?.reachable === true).map((p) => p.url) : [];
    const allCompliancePageCount = params.websiteScan ? [
      params.websiteScan.aiPolicy,
      params.websiteScan.responsibleAI,
      params.websiteScan.safetyPage,
      params.websiteScan.policiesPage,
      params.websiteScan.modelSpec,
      params.websiteScan.transparencyPage,
      params.websiteScan.charterPage,
      params.websiteScan.privacyPolicy,
      params.websiteScan.trustCenter,
      params.websiteScan.securityPage,
      params.websiteScan.legal,
      params.websiteScan.dpa,
      params.websiteScan.terms,
      params.websiteScan.cookiePolicy
    ].filter((p) => p?.reachable).length : 0;
    const scanCoverageLabel = allCompliancePageCount >= 6 ? "HIGH" : allCompliancePageCount >= 3 ? "MEDIUM" : allCompliancePageCount >= 1 ? "LOW" : "VERY LOW";
    console.log(`[AIEthicsAgent] \u2500\u2500 CONTEXT DEBUG SUMMARY \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    console.log(`[AIEthicsAgent] Received fileIds:           ${JSON.stringify(fileIds ?? [])}`);
    console.log(`[AIEthicsAgent] RAG attempted:              ${hasFileIds ? "yes" : "no (no fileIds)"}`);
    console.log(`[AIEthicsAgent] RAG context source:         ${contextSource}`);
    console.log(`[AIEthicsAgent] Extracted document length:  ${documentText.length} chars`);
    console.log(`[AIEthicsAgent] Final context source:       ${contextSource}`);
    console.log(`[AIEthicsAgent] Total context size:         ${assembledContext.length} chars`);
    console.log(`[AIEthicsAgent] Website:                    ${params.websiteScan?.homepage ?? "none"}`);
    console.log(`[AIEthicsAgent] Discovered pages:           ${params.websiteScan?.discoveredPages.length ?? 0}`);
    console.log(`[AIEthicsAgent] scanCoverage inputs:        reachablePages=${allCompliancePageCount}/14 \u2192 label="${scanCoverageLabel}"`);
    console.log(`[AIEthicsAgent] Reachable compliance pages (${reachablePages.length}):`);
    reachablePages.forEach((u) => console.log(`[AIEthicsAgent]   \u2713 ${u}`));
    console.log(`[AIEthicsAgent] Pages with extracted content (${extractedCount}):`);
    extractedUrls.forEach((u) => console.log(`[AIEthicsAgent]   \u{1F4C4} ${u}`));
    console.log(`[AIEthicsAgent] \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    let responseText;
    try {
      console.log(
        `[AIEthicsAgent] Calling OpenRouter \u2014 prompt length: ${userPrompt.length} chars`
      );
      responseText = await openRouterComplete(SYSTEM_PROMPT3, userPrompt, {
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 4096
      });
    } catch (llmErr) {
      console.error("[AIEthicsAgent] OpenRouter call failed:", llmErr);
      throw llmErr;
    }
    responseText = responseText.trim();
    console.log(
      `[AIEthicsAgent] Raw LLM response (${responseText.length} chars):
` + responseText.substring(0, 3e3) + (responseText.length > 3e3 ? `
...[truncated, total ${responseText.length} chars]` : "")
    );
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    }
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      console.warn(
        "[AIEthicsAgent] JSON parse failed. Falling back to heuristic analysis.\n",
        responseText.substring(0, 500)
      );
      return this.heuristicFallback(documentText, websiteScan);
    }
    parsed.findings = Array.isArray(parsed.findings) ? parsed.findings : [];
    parsed.recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    parsed.strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
    parsed.concerns = Array.isArray(parsed.concerns) ? parsed.concerns : [];
    parsed.ethicsDimensions = Array.isArray(parsed.ethicsDimensions) ? parsed.ethicsDimensions : [];
    parsed.standardAlignment = Array.isArray(parsed.standardAlignment) ? parsed.standardAlignment : [];
    parsed.scoreBreakdown = parsed.scoreBreakdown ?? {
      aiGovernance: 50,
      transparency: 50,
      fairness: 50,
      accountability: 50,
      privacyProtection: 50,
      humanOversight: 50,
      explainability: 50,
      riskManagement: 50
    };
    if (!["low", "medium", "high", "critical"].includes(parsed.overallRisk)) {
      parsed.overallRisk = "medium";
    }
    if (typeof parsed.overallScore !== "number") {
      parsed.overallScore = 50;
    }
    const VALID_SEVERITY = ["low", "medium", "high", "critical"];
    const VALID_STATUS = ["passed", "needs-improvement", "warning", "high-risk"];
    const VALID_CONFIDENCE = ["VERIFIED_PRESENT", "UNABLE_TO_VERIFY", "VERIFIED_MISSING"];
    parsed.findings = parsed.findings.map((f, i) => ({
      ...f,
      id: f.id ?? `finding_${i + 1}`,
      severity: VALID_SEVERITY.includes(f.severity) ? f.severity : "medium",
      status: VALID_STATUS.includes(f.status) ? f.status : "warning",
      // Default to UNABLE_TO_VERIFY if the model omits the field — safer than VERIFIED_MISSING
      evidenceConfidence: VALID_CONFIDENCE.includes(f.evidenceConfidence) ? f.evidenceConfidence : "UNABLE_TO_VERIFY"
    }));
    parsed.recommendations = parsed.recommendations.map((r) => ({
      ...r,
      priority: ["critical", "high", "medium", "low"].includes(r.priority) ? r.priority : "medium",
      items: Array.isArray(r.items) ? r.items : []
    }));
    const VALID_DIM_STATUS = ["strong", "adequate", "weak", "absent"];
    parsed.ethicsDimensions = parsed.ethicsDimensions.map((d) => ({
      ...d,
      score: typeof d.score === "number" ? Math.max(0, Math.min(100, d.score)) : 50,
      status: VALID_DIM_STATUS.includes(d.status) ? d.status : "weak"
    }));
    const VALID_ALIGNMENT = ["strong", "partial", "weak", "absent"];
    parsed.standardAlignment = parsed.standardAlignment.map((s) => ({
      ...s,
      alignment: VALID_ALIGNMENT.includes(s.alignment) ? s.alignment : "partial",
      gaps: Array.isArray(s.gaps) ? s.gaps : []
    }));
    for (const key of Object.keys(parsed.scoreBreakdown)) {
      const val = parsed.scoreBreakdown[key];
      parsed.scoreBreakdown[key] = typeof val === "number" ? Math.max(0, Math.min(100, val)) : 50;
    }
    console.log(
      "[AIEthicsAgent] Parsed+normalised object (pre-Zod):",
      JSON.stringify(parsed, null, 2).substring(0, 3e3)
    );
    try {
      return AIEthicsResultSchema.parse(parsed);
    } catch (validationErr) {
      console.warn(
        "[AIEthicsAgent] Zod validation failed. Falling back to heuristic.\n",
        JSON.stringify(validationErr?.errors ?? validationErr, null, 2)
      );
      return this.heuristicFallback(documentText, websiteScan);
    }
  }
  // ── Heuristic fallback ────────────────────────────────────────────────────
  heuristicFallback(content, websiteScan) {
    const lower = content.toLowerCase();
    const findings = [];
    const hasAIPolicy = websiteScan?.aiPolicy?.reachable || lower.includes("ai policy");
    const hasResponsibleAI = websiteScan?.responsibleAI?.reachable || lower.includes("responsible ai");
    const hasPrivacyPolicy = websiteScan?.privacyPolicy?.reachable || lower.includes("privacy policy");
    const hasTrustCenter = websiteScan?.trustCenter?.reachable || lower.includes("trust center");
    const hasFairnessRef = lower.includes("fairness") || lower.includes("bias");
    const hasTransparency = lower.includes("transparency") || lower.includes("model card");
    const hasHumanOversight = lower.includes("human oversight") || lower.includes("human review");
    const hasGovernance = lower.includes("governance") || lower.includes("ai committee");
    const hasExplainability = lower.includes("explainability") || lower.includes("xai") || lower.includes("shap") || lower.includes("lime");
    const hasRiskMgmt = lower.includes("risk management") || lower.includes("risk register");
    findings.push({
      id: "h_1",
      title: "AI Governance Framework",
      category: "AI Governance Framework",
      severity: hasGovernance ? "low" : "high",
      status: hasGovernance ? "passed" : "high-risk",
      description: hasGovernance ? "AI governance references detected in the provided context." : "No AI governance framework, committee, or AI Officer detected.",
      recommendation: hasGovernance ? "Verify governance structure includes a named AI Officer, ethics committee, and escalation path." : "Establish a formal AI governance framework with a named AI Officer and ethics committee."
    });
    findings.push({
      id: "h_2",
      title: "Responsible AI Policy",
      category: "Responsible AI Policy",
      severity: hasAIPolicy || hasResponsibleAI ? "low" : "high",
      status: hasAIPolicy || hasResponsibleAI ? "passed" : "high-risk",
      description: hasAIPolicy || hasResponsibleAI ? "Responsible AI or AI policy references found." : "No formal Responsible AI policy detected.",
      recommendation: "Publish and enforce a formal Responsible AI policy with scope, principles, and accountability."
    });
    findings.push({
      id: "h_3",
      title: "Transparency & Model Documentation",
      category: "Transparency",
      severity: hasTransparency ? "medium" : "high",
      status: hasTransparency ? "needs-improvement" : "high-risk",
      description: hasTransparency ? "Some transparency references found, but model cards or system cards not confirmed." : "No transparency documentation or model cards detected.",
      recommendation: "Publish model cards covering intended use, limitations, and subgroup performance."
    });
    findings.push({
      id: "h_4",
      title: "Fairness & Bias Mitigation",
      category: "Fairness",
      severity: hasFairnessRef ? "medium" : "high",
      status: hasFairnessRef ? "needs-improvement" : "high-risk",
      description: hasFairnessRef ? "Fairness references found. Formal bias audit results not confirmed." : "No fairness assessment or bias mitigation practices detected.",
      recommendation: "Commission independent bias audits covering all protected attributes and publish results."
    });
    findings.push({
      id: "h_5",
      title: "Human Oversight",
      category: "Human Oversight",
      severity: hasHumanOversight ? "low" : "high",
      status: hasHumanOversight ? "passed" : "warning",
      description: hasHumanOversight ? "Human oversight mechanisms referenced." : "No human oversight or override mechanisms detected.",
      recommendation: "Implement documented human review checkpoints and override mechanisms for high-stakes decisions."
    });
    findings.push({
      id: "h_6",
      title: "Explainability",
      category: "Explainability",
      severity: hasExplainability ? "medium" : "high",
      status: hasExplainability ? "needs-improvement" : "high-risk",
      description: hasExplainability ? "Explainability techniques referenced but user-facing mechanisms not confirmed." : "No explainability mechanisms detected. May conflict with GDPR Article 22.",
      recommendation: "Implement LIME/SHAP or rule-based explanations and provide affected individuals with meaningful decision explanations."
    });
    findings.push({
      id: "h_7",
      title: "Privacy Protection",
      category: "Privacy Protection",
      severity: hasPrivacyPolicy ? "medium" : "high",
      status: hasPrivacyPolicy ? "needs-improvement" : "warning",
      description: hasPrivacyPolicy ? "Privacy policy found. Training data privacy and DPIA status not confirmed." : "No privacy policy detected for AI data processing.",
      recommendation: "Complete a DPIA for AI processing activities and document training data consent and retention policies."
    });
    findings.push({
      id: "h_8",
      title: "Risk Management",
      category: "Risk Management",
      severity: hasRiskMgmt ? "medium" : "high",
      status: hasRiskMgmt ? "needs-improvement" : "warning",
      description: hasRiskMgmt ? "Risk management references found. Formal AI risk register not confirmed." : "No AI risk management framework or risk register detected.",
      recommendation: "Establish a formal AI risk register with severity classifications and link to model release cycle."
    });
    const passedCount = findings.filter((f) => f.status === "passed").length;
    const overallScore = Math.round(passedCount / findings.length * 65) + 10;
    return {
      overallScore,
      overallRisk: overallScore >= 70 ? "low" : overallScore >= 50 ? "medium" : overallScore >= 30 ? "high" : "critical",
      summary: "Heuristic analysis completed. A full AI-powered ethics review could not be generated. The context was scanned for key responsible AI signals. Manual review against NIST AI RMF, ISO/IEC 42001, and EU AI Act is strongly recommended.",
      findings,
      recommendations: [
        {
          category: "Immediate Actions",
          priority: "critical",
          items: [
            "Establish a formal AI governance framework with a named AI Officer.",
            "Publish a Responsible AI policy and model cards for all deployed systems.",
            "Commission an independent bias audit covering all protected attributes.",
            "Conduct a DPIA for all high-risk AI processing activities."
          ]
        },
        {
          category: "Standards Alignment",
          priority: "high",
          items: [
            "Align with NIST AI RMF GOVERN, MAP, MEASURE, MANAGE functions.",
            "Begin ISO/IEC 42001 gap assessment for AI management system certification.",
            "Review EU AI Act risk classification for all deployed AI systems."
          ]
        }
      ],
      strengths: findings.filter((f) => f.status === "passed").map((f) => f.title),
      concerns: findings.filter((f) => f.status !== "passed").map((f) => f.title),
      scoreBreakdown: {
        aiGovernance: hasGovernance ? 55 : 15,
        transparency: hasTransparency ? 50 : 15,
        fairness: hasFairnessRef ? 45 : 10,
        accountability: hasGovernance ? 50 : 20,
        privacyProtection: hasPrivacyPolicy ? 55 : 20,
        humanOversight: hasHumanOversight ? 60 : 15,
        explainability: hasExplainability ? 45 : 10,
        riskManagement: hasRiskMgmt ? 50 : 15
      },
      ethicsDimensions: [
        { dimension: "AI Governance", score: hasGovernance ? 55 : 15, status: hasGovernance ? "adequate" : "absent" },
        { dimension: "Transparency", score: hasTransparency ? 50 : 15, status: hasTransparency ? "adequate" : "absent" },
        { dimension: "Fairness", score: hasFairnessRef ? 45 : 10, status: hasFairnessRef ? "weak" : "absent" },
        { dimension: "Accountability", score: hasGovernance ? 50 : 20, status: hasGovernance ? "adequate" : "weak" },
        { dimension: "Privacy", score: hasPrivacyPolicy ? 55 : 20, status: hasPrivacyPolicy ? "adequate" : "weak" },
        { dimension: "Human Oversight", score: hasHumanOversight ? 60 : 15, status: hasHumanOversight ? "adequate" : "absent" },
        { dimension: "Explainability", score: hasExplainability ? 45 : 10, status: hasExplainability ? "weak" : "absent" },
        { dimension: "Risk Management", score: hasRiskMgmt ? 50 : 15, status: hasRiskMgmt ? "adequate" : "weak" }
      ],
      standardAlignment: [
        { standard: "NIST AI RMF", alignment: "absent", gaps: ["GOVERN function not evidenced", "MAP/MEASURE/MANAGE functions not confirmed"] },
        { standard: "ISO/IEC 42001", alignment: "absent", gaps: ["AI management system not confirmed", "Objectives and continual improvement not documented"] },
        { standard: "OECD AI Principles", alignment: "partial", gaps: ["Human-centred values not explicitly referenced", "Accountability mechanisms not confirmed"] },
        { standard: "EU AI Act", alignment: "absent", gaps: ["Risk classification not performed", "Conformity assessment not evidenced"] },
        { standard: "Google Responsible AI", alignment: "partial", gaps: ["Social benefit assessment not confirmed", "Safety evaluation not evidenced"] },
        { standard: "Microsoft Responsible AI Standard", alignment: "absent", gaps: ["Fairness impact assessment not confirmed", "Reliability & safety not documented"] }
      ]
    };
  }
};

// src/agents/legalAgent.ts
init_database();
var REFERENCE_RETRIEVAL_QUERY = "indemnity liability limitation of liability termination IP confidentiality data protection governing law payment obligations compliance missing clauses";
var AgentOrchestrator = class {
  constructor() {
    this.analysisAgent = new AnalysisAgent();
    this.draftingAgent = new DraftingAgent();
    this.negotiationAgent = new NegotiationAgent();
    this.askLawyerAgent = new AskLawyerAgent();
    this.dpaReviewAgent = new DPAReviewAgent();
    this.vendorReviewAgent = new VendorReviewAgent();
    this.aiEthicsAgent = new AIEthicsAgent();
  }
  // analysis agreement
  async runAnalysis(documentId, content, userId, folderIds, userRole = "USER") {
    let referenceContext;
    if (Array.isArray(folderIds) && folderIds.length > 0) {
      try {
        const chunks = await searchHybrid(
          REFERENCE_RETRIEVAL_QUERY,
          userId,
          void 0,
          // fileIds
          folderIds
        );
        if (chunks.length > 0) {
          referenceContext = chunks.map((c) => `[Reference: ${c.title ?? "Untitled"}]
${c.content}`).join("\n\n");
          console.log(
            `[runAnalysis] Retrieved ${chunks.length} reference chunk(s) from ${folderIds.length} folder(s)`
          );
        }
      } catch (refErr) {
        console.warn(
          "[runAnalysis] Reference context retrieval failed, continuing without it:",
          refErr.message
        );
      }
    }
    const audit = await this.analysisAgent.runAudit({
      content,
      type: "legal",
      referenceContext
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.current_user_id = $1", [userId]);
      await client.query("SET LOCAL app.current_user_role = $2", [userRole]);
      await client.query("UPDATE files SET analysis = $1 WHERE id = $2", [
        JSON.stringify(audit),
        documentId
      ]);
      await client.query(
        `INSERT INTO agent_execution_logs
           (file_id, user_id, agent_name, task_name, decisions, confidence_score)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          documentId,
          userId,
          "AnalysisAgent",
          "Legal Audit",
          JSON.stringify({
            executiveSummary: audit.executiveSummary,
            overallRisk: audit.overallRisk,
            findingsCount: audit.findings.length
          }),
          95
        ]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return audit;
  }
  async runDrafting(params) {
    const prompt = `Mode: ${params.mode}, Level: ${params.detailLevel}, Instructions: ${params.instructions}`;
    return await this.draftingAgent.generateDraft(prompt);
  }
  async runNegotiation(documentContent, playbooks, instructions) {
    return await this.negotiationAgent.negotiate(
      documentContent,
      playbooks,
      instructions
    );
  }
  // analysis document
  async askLawyer(prompt, userId, documentIds, jurisdictions, outputFormat) {
    const context = await searchHybrid(prompt, userId, documentIds);
    const contextText = context.map((c) => `[Source: ${c.title}]
${c.content}`).join("\n\n");
    const result = await this.askLawyerAgent.getAdvice({
      prompt,
      context: contextText,
      jurisdictions,
      outputFormat,
      sources: context.map((c) => ({ title: c.title, file_id: c.file_id, content: c.content }))
    });
    return result;
  }
  async remediate(documentId, content, userId, userRole = "USER") {
    return await this.runAnalysis(
      documentId,
      content,
      userId,
      void 0,
      userRole
    );
  }
  async runDPAReview(documentText, userId, fileId) {
    return await this.dpaReviewAgent.reviewDPA(documentText, userId, fileId);
  }
  async runVendorReview(params) {
    return await this.vendorReviewAgent.reviewVendor(params);
  }
  async runAIEthicsReview(params) {
    return await this.aiEthicsAgent.reviewAIEthics(params);
  }
  // analysis agreement
  async interactAnalyze(folderIds, prompt, userId, documentMode, answerStyle, history, _folderId, _userRole = "USER", draftIds = [], fileIds = []) {
    const LEGAL_SEED_TERMS = "indemnity liability limitation termination confidentiality intellectual property payment governing law compliance data protection liquidated damages audit rights obligations warranties representations";
    const retrievalQuery = `${LEGAL_SEED_TERMS} ${prompt.substring(0, 120)}`.trim();
    console.log(`[interactAnalyze] userId=${userId} folderIds=${JSON.stringify(folderIds)} draftIds=${JSON.stringify(draftIds)} fileIds=${JSON.stringify(fileIds)}`);
    console.log(`[interactAnalyze] userPrompt(100)="${prompt.substring(0, 100)}"`);
    console.log(`[interactAnalyze] retrievalQuery(120)="${retrievalQuery.substring(0, 120)}"`);
    const hasFolders = Array.isArray(folderIds) && folderIds.length > 0;
    const hasDrafts = Array.isArray(draftIds) && draftIds.length > 0;
    const hasFiles = Array.isArray(fileIds) && fileIds.length > 0;
    let context = [];
    if (hasFolders) {
      const folderChunks = await searchHybrid(retrievalQuery, userId, void 0, folderIds);
      context = context.concat(folderChunks);
    }
    if (hasDrafts) {
      const draftChunks = await searchHybrid(retrievalQuery, userId, draftIds, void 0);
      context = context.concat(draftChunks);
    }
    if (hasFiles) {
      const fileChunks = await searchHybrid(retrievalQuery, userId, fileIds, void 0);
      context = context.concat(fileChunks);
    }
    const seen = /* @__PURE__ */ new Set();
    context = context.filter((c) => {
      if (seen.has(c.content)) return false;
      seen.add(c.content);
      return true;
    });
    console.log(
      `[interactAnalyze] Retrieved ${context.length} chunk(s): ` + context.map((c) => `"${c.title ?? c.file_id}"`).join(", ")
    );
    const systemPrompt = `You are a Senior Legal Counsel and Compliance Analyst.

Your task is to review the provided document context and answer the user's query as a structured legal review report, not as a generic essay.

You must ground your answer in the retrieved document context wherever possible. If the context does not support a point, explicitly say that the reviewed material does not clearly show it. Do not invent clauses, parties, or facts.

Answer Style: ${answerStyle}
${history.length > 0 ? `Prior conversation context:
${JSON.stringify(history)}
` : ""}

CRITICAL OUTPUT RULES:
1. Return the answer in exactly the Markdown structure below.
2. Use all section headings below in the same order.
3. If a section has no strong support in the document context, write "Not clearly identified in the reviewed material." under that section instead of omitting it.
4. Do NOT write a generic legal explainer or general best-practices essay.
5. Tie findings to the uploaded/retrieved document context wherever possible.
6. Under "Key Findings", each finding must follow the exact mini-template shown below.
7. If the user's query is broad, still convert it into a document-focused legal review instead of answering abstractly.
8. Do not add a closing question like "Would you like a deeper dive?".
9. Do not add any extra sections outside the required structure.

Return your answer in this exact format:

# Executive Summary
Write a 2-4 sentence summary of the document risk picture relevant to the user's query.

# Overall Risk Assessment
- **Risk Level:** Low / Medium / High
- **Why:** 2-4 bullets explaining the basis for the rating.

# Key Findings
For each finding, use this exact structure:

## Finding 1: <short finding title>
- **Severity:** Low / Medium / High
- **Relevant Clause / Evidence:** Quote or paraphrase the relevant clause, sentence, or retrieved evidence.
- **Issue:** Explain the legal/commercial problem.
- **Why It Matters:** Explain the consequence or risk if unaddressed.
- **Recommendation:** Give a concrete recommended change.
- **Fallback Position:** Give a minimum acceptable negotiation fallback.

Add as many findings as are genuinely supported by the document context.

# Missing or Weak Clauses
For each missing or weak clause:
- **Clause / Protection:** <name>
- **Why It Matters:** <brief explanation>
- **Recommendation:** <what should be added or strengthened>

If nothing specific can be identified, write:
- Not clearly identified in the reviewed material.

# Compliance Gaps
For each compliance gap:
- **Regulation / Framework:** GDPR / CCPA / DPDPA / other
- **Severity:** RED / YELLOW / GREEN
- **Gap:** <issue>
- **Remediation:** <fix>

If no clear compliance gap is visible from the reviewed material, say so explicitly.

# Recommended Redlines
For each clause that should be revised:
- **Clause:** <name>
- **Current Issue:** <problem>
- **Suggested Revision:** <replacement language or revision direction>

If no specific redline can be proposed from the reviewed material, say so explicitly.

# Obligations & Deadlines
List obligations in this format:
- **Party:** <party or "Not specified">
- **Obligation:** <obligation>
- **Trigger:** <trigger event or "Not specified">
- **Deadline:** <deadline or "Not specified">

If none are identifiable, say:
- Not clearly identifiable from the reviewed material.

IMPORTANT:
- Prefer document-grounded analysis over generic legal advice.
- If the context retrieved is weak or incomplete, say that clearly in the relevant sections.
- Do not add any extra sections outside the required structure.`;
    if (documentMode === "individual" && context.length > 0) {
      const chunksByFile = {};
      for (const chunk of context) {
        const fId = chunk.file_id || "unknown";
        if (!chunksByFile[fId]) {
          chunksByFile[fId] = {
            title: chunk.title || "Untitled Document",
            chunks: []
          };
        }
        chunksByFile[fId].chunks.push(chunk);
      }
      const fileAnalyses = await Promise.all(
        Object.entries(chunksByFile).map(async ([fId, fileData]) => {
          const docContextText = fileData.chunks.map((c) => `[File: ${c.title ?? "Untitled"}]
${c.content}`).join("\n\n");
          const docUserPrompt = `[DOCUMENT CONTEXT]
${docContextText}

[USER TASK]
User request: ${prompt}

Convert the request into a document-focused legal review report for "${fileData.title}" using the required structure. If the request asks about specific risks or clauses, analyze those risks against the reviewed material instead of giving a generic how-to explanation.`;
          const response = await openRouterComplete(systemPrompt, docUserPrompt);
          return `---
# Analysis for: ${fileData.title}
---

${response}`;
        })
      );
      return fileAnalyses.join("\n\n");
    }
    const contextText = context.map((c) => `[File: ${c.title ?? "Untitled"}]
${c.content}`).join("\n\n");
    const userPrompt = `[DOCUMENT CONTEXT]
${contextText || "No document chunks were retrieved from the selected folders. You must still use the required report structure, but clearly state where the reviewed material is insufficient."}

[USER TASK]
User request: ${prompt}

Convert the request into a document-focused legal review report using the required structure. If the request asks about specific risks or clauses, analyze those risks against the reviewed material instead of giving a generic how-to explanation.`;
    try {
      return await openRouterComplete(systemPrompt, userPrompt);
    } catch (err) {
      console.error("interactAnalyze error:", err);
      throw err;
    }
  }
};

// src/services/scannerService.ts
init_browserManager();
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
init_urlValidator();

// src/services/websiteScanner/pageCrawler.ts
init_browserManager();
init_urlValidator();
init_logger();
init_httpCrawler();
var TAG2 = "[PageCrawler]";
async function fetchSitemapUrls(rootUrl, domain, limit) {
  const sitemapUrl = new URL("/sitemap.xml", rootUrl).toString();
  if (!validateUrl(sitemapUrl).valid) {
    return { urls: [], found: false };
  }
  try {
    const resp = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(5e3),
      headers: { "User-Agent": "CookieCare-Scanner/1.0" }
    });
    if (!resp.ok) return { urls: [], found: false };
    const text = await resp.text();
    const matches = text.match(/<loc>(.*?)<\/loc>/g) ?? [];
    const urls = [];
    for (const m of matches) {
      if (urls.length >= limit) break;
      const loc = m.replace(/<\/?loc>/g, "").trim();
      try {
        const u = new URL(loc);
        if (u.hostname === domain && validateUrl(loc).valid) {
          urls.push(loc);
        }
      } catch {
      }
    }
    logger.debug(`${TAG2} sitemap found at ${sitemapUrl} \u2014 ${urls.length} URLs`);
    return { urls, found: urls.length > 0 };
  } catch (err) {
    logger.debug(`${TAG2} sitemap fetch failed for ${sitemapUrl}: ${err.message}`);
    return { urls: [], found: false };
  }
}
async function crawlLinksFromPage(rootUrl, domain, limit, existingUrls) {
  const playwrightOk = await browserManager.isAvailable();
  if (!playwrightOk) {
    logger.warn(`${TAG2} [WebsiteScanner] Playwright unavailable. Falling back to HTTP crawler.`);
    return httpCrawlLinks(rootUrl, domain, limit, existingUrls);
  }
  logger.info(`${TAG2} [WebsiteScanner] Using Playwright`);
  let context;
  let added = 0;
  try {
    context = await browserManager.newContext({ optimizeForScanning: true });
    const page = await context.newPage();
    try {
      await page.goto(rootUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
      const links = await page.evaluate((domain2) => {
        const document = globalThis.document;
        return Array.from(document.querySelectorAll("a")).map((a) => a.href).filter((href) => {
          try {
            const u = new URL(href);
            return u.hostname === domain2 && (u.protocol === "http:" || u.protocol === "https:") && !u.hash;
          } catch {
            return false;
          }
        });
      }, domain);
      for (const link of links) {
        if (existingUrls.size >= limit) break;
        if (validateUrl(link).valid && !existingUrls.has(link)) {
          existingUrls.add(link);
          added++;
        }
      }
    } catch (err) {
      logger.warn(
        `${TAG2} Link crawl navigation failed for ${rootUrl}: ${err.message}`
      );
    } finally {
      await page.close().catch(() => {
      });
    }
  } catch (err) {
    logger.warn(
      `${TAG2} Link crawl browser context failed: ${err.message}`
    );
  } finally {
    if (context) await context.close().catch(() => {
    });
  }
  return added;
}
async function discoverUrls(rootUrl, options = {}) {
  const { limit = 20, sitemapOnly = false } = options;
  let domain;
  try {
    domain = new URL(rootUrl).hostname;
  } catch {
    return { urls: [rootUrl], sitemapFound: false, linksCrawled: 0 };
  }
  const urlSet = /* @__PURE__ */ new Set([rootUrl]);
  const { urls: sitemapUrls, found: sitemapFound } = await fetchSitemapUrls(
    rootUrl,
    domain,
    limit
  );
  for (const u of sitemapUrls) {
    if (urlSet.size >= limit) break;
    urlSet.add(u);
  }
  if (urlSet.size >= limit || sitemapOnly) {
    return {
      urls: Array.from(urlSet).slice(0, limit),
      sitemapFound,
      linksCrawled: 0
    };
  }
  const linksCrawled = await crawlLinksFromPage(rootUrl, domain, limit, urlSet);
  return {
    urls: Array.from(urlSet).slice(0, limit),
    sitemapFound,
    linksCrawled
  };
}

// src/services/scannerService.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var ScannerService = class {
  constructor() {
    this.cookieDb = null;
  }
  async loadCookieDb() {
    if (this.cookieDb) return this.cookieDb;
    try {
      const isProd = process.env.NODE_ENV === "production";
      const dbPath = isProd ? path.resolve(process.cwd(), "dist/backend/src/config/open-cookie-database.json") : path.resolve(__dirname, "../config/open-cookie-database.json");
      const data = await fs.readFile(dbPath, "utf-8");
      this.cookieDb = JSON.parse(data);
      return this.cookieDb;
    } catch (err) {
      console.error("Failed to load cookie database:", err);
      return {};
    }
  }
  /**
   * Delegates to the shared urlValidator module.
   * Preserved as a private wrapper so no call-sites inside this class need
   * to change — the Cookie Scanner behaviour is identical to before.
   */
  validateUrl(url) {
    return validateUrl(url);
  }
  async handleConsentBanner(page, action) {
    const acceptSelectors = [
      "#onetrust-accept-btn-handler",
      "#wt-cli-accept-all-btn",
      "#accept-cookies",
      'button:has-text("Accept All")',
      'button:has-text("Allow All")',
      'button:has-text("I Accept")',
      'button:has-text("Agree")',
      '[aria-label*="Accept all"]',
      ".js-accept-all"
    ];
    const rejectSelectors = [
      "#onetrust-reject-all-handler",
      "#wt-cli-reject-all-btn",
      'button:has-text("Reject All")',
      'button:has-text("Decline All")',
      'button:has-text("Only Necessary")',
      'button:has-text("Dismiss")',
      '[aria-label*="Reject all"]',
      ".js-reject-all"
    ];
    const selectors = action === "accept" ? acceptSelectors : rejectSelectors;
    for (const selector of selectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 2e3 })) {
          await button.click();
          await page.waitForLoadState("networkidle", { timeout: 5e3 }).catch(() => {
          });
          return true;
        }
      } catch (e) {
      }
    }
    return false;
  }
  async capturePageState(page) {
    const cdp = await page.context().newCDPSession(page);
    const { cookies } = await cdp.send("Network.getAllCookies");
    await cdp.detach();
    const storage = await page.evaluate(() => {
      return {
        localStorage: { ...localStorage },
        sessionStorage: { ...sessionStorage }
      };
    });
    return { cookies, storage };
  }
  /**
   * Delegates to the shared pageCrawler module.
   * Preserved as a private wrapper so no call-sites inside this class need
   * to change — the Cookie Scanner behaviour is identical to before.
   */
  async discoverUrls(rootUrl, limit = 20) {
    const result = await discoverUrls(rootUrl, { limit });
    return result.urls;
  }
  async analyzeTrackersWithAI(trackers, url) {
    const trackerSummary = trackers.map((t) => ({
      name: t.name,
      domain: t.domain,
      description: t.description,
      currentCategory: t.category
    }));
    const systemPrompt = `You are a Privacy Engineer. Analyze the provided trackers and categorize them into: 'Necessary', 'Functional', 'Analytics', or 'Marketing'.
Also identify potential compliance risks and provide remediation steps.

CRITICAL: Return ONLY a valid JSON object \u2014 no markdown fences, no commentary \u2014 matching this exact schema:
{
  "categorizedTrackers": [
    {
      "name": "string",
      "category": "Necessary | Functional | Analytics | Marketing",
      "riskLevel": "LOW | MEDIUM | HIGH",
      "explanation": "string",
      "remediation": "string"
    }
  ],
  "overallComplianceRating": "A | B | C | D | F",
  "summary": "string"
}`;
    const userPrompt = `Trackers detected on ${url}:
${JSON.stringify(trackerSummary, null, 2)}`;
    try {
      let responseText = await openRouterComplete(systemPrompt, userPrompt, { jsonMode: true });
      responseText = responseText.trim();
      if (responseText.startsWith("```")) {
        responseText = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      }
      return JSON.parse(responseText);
    } catch (err) {
      console.error("[Scanner] AI analysis failed:", err);
      return null;
    }
  }
  async scanCookie(url, userId, scanDepth = "Deep") {
    try {
      const targetUrl = normaliseUrl(url);
      const urlValidation = this.validateUrl(targetUrl);
      if (!urlValidation.valid) {
        return {
          scanSummary: {
            url: targetUrl,
            level: scanDepth,
            overallScore: 0,
            riskLevel: "ERROR",
            error: `URL validation failed: ${urlValidation.reason}`,
            scannedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          cookiesDetected: [],
          complianceGaps: [
            {
              regulation: "SSRF_PROTECTION",
              severity: "RED",
              issue: `Blocked attempt to scan internal/private domain: ${urlValidation.reason}`,
              remediation: "Only scan public URLs (e.g., https://example.com)."
            }
          ]
        };
      }
      const depthLimit = scanDepth === "Lite" ? 1 : scanDepth === "Medium" ? 5 : scanDepth === "Enterprise" ? 15 : 10;
      const urlsToScan = scanDepth === "Lite" ? [targetUrl] : await this.discoverUrls(targetUrl, depthLimit);
      const globalAggregatedCookies = /* @__PURE__ */ new Map();
      const globalAggregatedStorage = { localStorage: {}, sessionStorage: {} };
      let hasConsentBannerGlobal = false;
      const preConsentCookiesGlobal = /* @__PURE__ */ new Map();
      for (const currentUrl of urlsToScan) {
        let preContext;
        try {
          preContext = await browserManager.newContext({ optimizeForScanning: true });
          const prePage = await preContext.newPage();
          try {
            await prePage.goto(currentUrl, { waitUntil: "networkidle", timeout: 3e4 });
            const preState = await this.capturePageState(prePage);
            preState.cookies.forEach((c) => {
              preConsentCookiesGlobal.set(c.name, c);
              globalAggregatedCookies.set(c.name, c);
            });
            Object.assign(globalAggregatedStorage.localStorage, preState.storage.localStorage);
          } catch (e) {
            console.error(`[Scanner] Pre-consent capture failed for ${currentUrl}:`, e.message);
          } finally {
            await prePage.close().catch(() => {
            });
          }
        } catch (e) {
          console.error(`[Scanner] Pre-consent context failed for ${currentUrl}:`, e.message);
        } finally {
          if (preContext) await preContext.close().catch(() => {
          });
        }
      }
      for (let i = 0; i < urlsToScan.length; i++) {
        const currentUrl = urlsToScan[i];
        const isRoot = i === 0;
        let rejectContext;
        try {
          rejectContext = await browserManager.newContext({ optimizeForScanning: true });
          const rejectPage = await rejectContext.newPage();
          try {
            await rejectPage.goto(currentUrl, { waitUntil: "networkidle", timeout: 3e4 });
            if (isRoot) {
              const rejected = await this.handleConsentBanner(rejectPage, "reject");
              if (rejected) hasConsentBannerGlobal = true;
            }
            const postRejectState = await this.capturePageState(rejectPage);
            postRejectState.cookies.forEach((c) => globalAggregatedCookies.set(c.name, c));
          } catch (e) {
            console.error(`[Scanner] Reject flow failed for ${currentUrl}:`, e.message);
          } finally {
            await rejectPage.close().catch(() => {
            });
          }
        } catch (e) {
          console.error(`[Scanner] Reject context failed for ${currentUrl}:`, e.message);
        } finally {
          if (rejectContext) await rejectContext.close().catch(() => {
          });
        }
        let acceptContext;
        try {
          acceptContext = await browserManager.newContext({ optimizeForScanning: true });
          const acceptPage = await acceptContext.newPage();
          try {
            await acceptPage.goto(currentUrl, { waitUntil: "networkidle", timeout: 3e4 });
            if (isRoot) {
              const accepted = await this.handleConsentBanner(acceptPage, "accept");
              if (accepted) hasConsentBannerGlobal = true;
            }
            const postAcceptState = await this.capturePageState(acceptPage);
            postAcceptState.cookies.forEach((c) => globalAggregatedCookies.set(c.name, c));
            Object.assign(globalAggregatedStorage.localStorage, postAcceptState.storage.localStorage);
          } catch (e) {
            console.error(`[Scanner] Accept flow failed for ${currentUrl}:`, e.message);
          } finally {
            await acceptPage.close().catch(() => {
            });
          }
        } catch (e) {
          console.error(`[Scanner] Accept context failed for ${currentUrl}:`, e.message);
        } finally {
          if (acceptContext) await acceptContext.close().catch(() => {
          });
        }
      }
      const allCookies = Array.from(globalAggregatedCookies.values());
      const db = await this.loadCookieDb();
      const detectedCookies = [];
      for (const cookie of allCookies) {
        let matched = false;
        for (const [provider, cookies] of Object.entries(db)) {
          const match = cookies.find((c) => c.cookie?.toLowerCase() === cookie.name.toLowerCase());
          if (match) {
            detectedCookies.push({
              name: cookie.name,
              category: match.category,
              domain: provider,
              description: match.description,
              retention: match.retentionPeriod || "Persistent",
              severity: match.category === "Marketing" || match.category === "Analytics" ? "HIGH" : "LOW"
            });
            matched = true;
            break;
          }
        }
        if (!matched) {
          detectedCookies.push({
            name: cookie.name,
            category: "Unclassified",
            domain: cookie.domain,
            description: "Dynamic JavaScript-set tracker detected via CDP.",
            retention: "Session",
            severity: "MEDIUM"
          });
        }
      }
      const aiAnalysis = await this.analyzeTrackersWithAI(detectedCookies, targetUrl);
      if (aiAnalysis) {
        detectedCookies.forEach((cookie) => {
          const aiMatch = aiAnalysis.categorizedTrackers.find((t) => t.name === cookie.name);
          if (aiMatch) {
            cookie.category = aiMatch.category;
            cookie.severity = aiMatch.riskLevel;
            cookie.description = aiMatch.explanation;
            cookie.remediation = aiMatch.remediation;
          }
        });
      }
      const highRiskCount = detectedCookies.filter((c) => c.severity === "HIGH").length;
      const baseScore = aiAnalysis ? aiAnalysis.overallComplianceRating === "A" ? 95 : aiAnalysis.overallComplianceRating === "B" ? 80 : aiAnalysis.overallComplianceRating === "C" ? 60 : 40 : 100;
      const score = Math.max(0, baseScore - highRiskCount * 5 - detectedCookies.length * 1);
      const risk = score > 75 ? "Low" : score > 45 ? "Medium" : "High";
      const result = {
        scanSummary: {
          url: targetUrl,
          level: scanDepth,
          overallScore: score,
          riskLevel: risk,
          hasConsentBanner: hasConsentBannerGlobal,
          loadsBeforeConsent: preConsentCookiesGlobal.size > 0,
          totalCookiesCount: detectedCookies.length,
          scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
          pagesScanned: urlsToScan.length,
          aiSummary: aiAnalysis?.summary,
          storageDetected: globalAggregatedStorage
        },
        cookiesDetected: detectedCookies,
        complianceGaps: [
          {
            regulation: "GDPR",
            severity: preConsentCookiesGlobal.size > 0 ? "RED" : "GREEN",
            issue: "Trackers firing before user consent across scanned pages.",
            remediation: "Implement a strict 'hold-back' mechanism for all non-essential scripts until explicit consent is given."
          },
          {
            regulation: "Cookie Law",
            severity: !hasConsentBannerGlobal ? "RED" : "GREEN",
            issue: !hasConsentBannerGlobal ? "No visible cookie consent banner detected." : "Consent banner present.",
            remediation: "Deploy a compliant CMP (Consent Management Platform) to manage user preferences."
          }
        ]
      };
      await this.saveScanResult(userId, url, "cookie", score, risk, result);
      return result;
    } catch (err) {
      console.error("3-Stage Cookie scan failed:", err);
      return {
        scanSummary: { url, level: scanDepth, overallScore: 0, riskLevel: "ERROR", error: err.message },
        cookiesDetected: [],
        complianceGaps: [{ regulation: "SCAN_ERROR", severity: "RED", issue: err.message, remediation: "Check destination endpoint." }]
      };
    }
  }
  async scanVulnerability(url, userId) {
    const findings = [];
    try {
      const targetUrl = normaliseUrl(url);
      const urlValidation = this.validateUrl(targetUrl);
      if (!urlValidation.valid) {
        return {
          overallRisk: "HIGH",
          securityScore: 0,
          findings: [
            {
              name: "SSRF Protection",
              vector: `Blocked target: ${urlValidation.reason}`,
              severity: "HIGH",
              remediation: "Scan a publicly accessible HTTP or HTTPS URL."
            }
          ]
        };
      }
      const response = await fetch(targetUrl, { method: "GET" });
      const headers = response.headers;
      if (!headers.get("content-security-policy")) {
        findings.push({
          name: "Missing Content-Security-Policy",
          vector: "HTTP response headers",
          severity: "HIGH",
          remediation: "Add a Content-Security-Policy response header that only permits trusted content sources."
        });
      }
      if (!headers.get("strict-transport-security")) {
        findings.push({
          name: "Missing Strict-Transport-Security",
          vector: "HTTPS response headers",
          severity: "MEDIUM",
          remediation: "Add Strict-Transport-Security with an appropriate max-age and includeSubDomains policy."
        });
      }
      if (!headers.get("x-content-type-options") || headers.get("x-content-type-options")?.toLowerCase() !== "nosniff") {
        findings.push({
          name: "Missing X-Content-Type-Options",
          vector: "HTTP response headers",
          severity: "LOW",
          remediation: "Set the X-Content-Type-Options response header to nosniff."
        });
      }
      const score = Math.max(0, 100 - findings.length * 20);
      const risk = score > 80 ? "LOW" : score > 50 ? "MEDIUM" : "HIGH";
      const result = {
        overallRisk: risk,
        securityScore: score,
        findings
      };
      await this.saveScanResult(userId, url, "vulnerability", score, risk, result);
      return result;
    } catch (err) {
      console.error("Vulnerability endpoint scan failed:", err);
      throw err;
    }
  }
  async saveScanResult(userId, url, type, score, risk, payload) {
    await withTransaction(userId, "USER", async (client) => {
      await client.query(
        "INSERT INTO website_scans (user_id, url, scan_type, overall_score, risk_level, payload) VALUES ($1, $2, $3, $4, $5, $6)",
        [userId, url, type, score, risk, JSON.stringify(payload)]
      );
    });
  }
};

// src/services/websiteScanner/index.ts
init_contentExtractor();

// src/services/websiteScanner/metadataExtractor.ts
init_browserManager();
init_urlValidator();
init_logger();
init_httpCrawler();
var TAG4 = "[MetadataExtractor]";
var RELEVANT_HEADERS2 = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "permissions-policy",
  "referrer-policy",
  "x-xss-protection",
  "server",
  "x-powered-by",
  "content-language"
];
async function fetchRelevantHeaders(url) {
  const captured = {};
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8e3),
      headers: { "User-Agent": "CookieCare-Scanner/1.0" }
    });
    for (const name of RELEVANT_HEADERS2) {
      const value = resp.headers.get(name);
      if (value) captured[name] = value;
    }
  } catch (err) {
    try {
      const resp = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(8e3),
        headers: { "User-Agent": "CookieCare-Scanner/1.0" }
      });
      for (const name of RELEVANT_HEADERS2) {
        const value = resp.headers.get(name);
        if (value) captured[name] = value;
      }
    } catch (fallbackErr) {
      logger.debug(
        `${TAG4} Header fetch failed for ${url}: ${fallbackErr.message}`
      );
    }
  }
  return captured;
}
async function extractDomMetadata(url) {
  let context;
  try {
    context = await browserManager.newContext({ optimizeForScanning: true });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15e3 });
    } catch (navErr) {
      logger.debug(`${TAG4} DOM metadata nav failed for ${url}: ${navErr.message}`);
      return { title: null, description: null, openGraph: {}, language: null, canonical: null };
    }
    const meta = await page.evaluate(() => {
      const document = globalThis.document;
      const title = document.title || null;
      const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;
      const canonical = document.querySelector('link[rel="canonical"]')?.href ?? null;
      const language = document.documentElement.getAttribute("lang") ?? document.documentElement.getAttribute("xml:lang") ?? null;
      const openGraph = {};
      document.querySelectorAll("meta[property], meta[name]").forEach((el) => {
        const key = el.getAttribute("property") || el.getAttribute("name") || "";
        const value = el.getAttribute("content") || "";
        if (value && (key.startsWith("og:") || key.startsWith("twitter:") || key.startsWith("article:"))) {
          openGraph[key] = value;
        }
      });
      return { title, description, canonical, language, openGraph };
    });
    return meta;
  } catch (err) {
    logger.warn(`${TAG4} DOM metadata extraction failed for ${url}: ${err.message}`);
    return { title: null, description: null, openGraph: {}, language: null, canonical: null };
  } finally {
    if (context) await context.close().catch(() => {
    });
  }
}
async function extractPageMetadata(url) {
  const validation = validateUrl(url);
  if (!validation.valid) {
    logger.warn(`${TAG4} Blocked metadata extraction for invalid URL: ${url}`);
    return {
      url,
      title: null,
      description: null,
      openGraph: {},
      headers: {},
      language: null,
      canonical: null,
      capturedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  const playwrightOk = await browserManager.isAvailable();
  if (!playwrightOk) {
    logger.warn(`${TAG4} [WebsiteScanner] Playwright unavailable. Falling back to HTTP crawler.`);
    return httpExtractPageMetadata(url);
  }
  logger.info(`${TAG4} [WebsiteScanner] Using Playwright`);
  const [headers, domMeta] = await Promise.all([
    fetchRelevantHeaders(url),
    extractDomMetadata(url)
  ]);
  logger.debug(`${TAG4} Metadata captured for ${url}`);
  return {
    url,
    title: domMeta.title,
    description: domMeta.description,
    openGraph: domMeta.openGraph,
    headers,
    language: domMeta.language,
    canonical: domMeta.canonical,
    capturedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/services/websiteScanner/complianceDiscovery.ts
init_urlValidator();

// src/services/websiteScanner/types.ts
var COMPLIANCE_PATHS = [
  "/privacy",
  "/privacy-policy",
  "/cookie-policy",
  "/cookies",
  "/security",
  "/security-policy",
  "/trust",
  "/trust-center",
  "/legal",
  "/terms",
  "/terms-of-service",
  "/terms-and-conditions",
  "/dpa",
  "/responsible-ai",
  "/responsible-ai-practices",
  "/ai",
  "/ai-policy",
  "/ai-principles",
  "/ai-safety",
  "/ethics",
  "/governance",
  "/safety",
  "/policies",
  "/model-spec",
  "/model-cards",
  "/transparency",
  "/charter",
  "/research",
  "/research/overview",
  "/about/safety",
  "/blog/tags/safety",
  "/product/core-views"
];

// src/services/websiteScanner/complianceDiscovery.ts
init_logger();
var TAG5 = "[ComplianceDiscovery]";
var PROBE_TIMEOUT_MS = 8e3;
async function probePage(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const resp = await fetch(url, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        headers: { "User-Agent": "CookieCare-Scanner/1.0" }
      });
      const reachable = resp.status >= 200 && resp.status < 400;
      return { statusCode: resp.status, reachable };
    } catch {
      if (method === "HEAD") continue;
    }
  }
  return { statusCode: 0, reachable: false };
}
async function discoverCompliancePages(homepageUrl, options = {}) {
  const { includeUnreachable = false, concurrency = 5 } = options;
  let origin;
  try {
    origin = new URL(homepageUrl).origin;
  } catch {
    logger.warn(`${TAG5} Cannot parse origin from: ${homepageUrl}`);
    return [];
  }
  const results = [];
  for (let i = 0; i < COMPLIANCE_PATHS.length; i += concurrency) {
    const batch = COMPLIANCE_PATHS.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (path3) => {
        const url = `${origin}${path3}`;
        if (!validateUrl(url).valid) {
          return null;
        }
        const { statusCode, reachable } = await probePage(url);
        logger.debug(`${TAG5} ${url} \u2192 ${statusCode} (reachable: ${reachable})`);
        return {
          path: path3,
          url,
          statusCode,
          reachable
        };
      })
    );
    for (const entry of batchResults) {
      if (entry && (entry.reachable || includeUnreachable)) {
        results.push(entry);
      }
    }
  }
  logger.debug(
    `${TAG5} ${results.filter((r) => r.reachable).length} compliance pages found for ${homepageUrl}`
  );
  return results;
}
function findFirst(pages, ...paths) {
  return pages.find((p) => paths.includes(p.path) && p.reachable) ?? null;
}

// src/services/websiteScanner/pageClassifier.ts
init_logger();
var TAG6 = "[PageClassifier]";
var URL_RULES = [
  {
    patterns: [/\/privacy[-_]?policy/i, /\/privacy$/i, /\/datenschutz/i],
    type: "privacy_policy",
    confidence: 0.95
  },
  {
    patterns: [/\/cookie[-_]?policy/i, /\/cookies$/i, /\/cookie-notice/i],
    type: "cookie_policy",
    confidence: 0.95
  },
  {
    patterns: [
      /\/terms[-_]?(of[-_]?service|and[-_]?conditions)?$/i,
      /\/tos$/i,
      /\/nutzungsbedingungen/i
    ],
    type: "terms",
    confidence: 0.9
  },
  {
    patterns: [/\/legal$/i, /\/legal[-_]?notice/i, /\/impressum/i],
    type: "legal",
    confidence: 0.9
  },
  {
    patterns: [/\/security$/i, /\/security[-_]?policy/i, /\/vulnerability/i],
    type: "security",
    confidence: 0.85
  },
  {
    patterns: [/\/trust$/i, /\/trust[-_]?center/i, /\/trustcenter/i],
    type: "trust_center",
    confidence: 0.9
  },
  {
    patterns: [/\/dpa$/i, /\/data[-_]?processing[-_]?agreement/i],
    type: "dpa",
    confidence: 0.92
  },
  {
    patterns: [
      /\/responsible[-_]?ai/i,
      /\/ai[-_]?principles/i,
      /\/ai[-_]?policy/i
    ],
    type: "responsible_ai",
    confidence: 0.88
  },
  {
    patterns: [/\/ai$/i, /\/artificial[-_]?intelligence/i, /\/ai[-_]?safety/i],
    type: "ai_policy",
    confidence: 0.7
  },
  {
    patterns: [/\/ethics$/i, /\/ethical[-_]?ai/i, /\/ai[-_]?ethics/i],
    type: "ethics",
    confidence: 0.85
  },
  {
    patterns: [/\/governance$/i, /\/data[-_]?governance/i],
    type: "governance",
    confidence: 0.82
  },
  {
    patterns: [/\/safety$/i, /\/ai[-_]?safety/i, /\/about\/safety/i, /\/safety[-_]?research/i],
    type: "responsible_ai",
    confidence: 0.9
  },
  {
    patterns: [/\/policies$/i, /\/usage[-_]?policies/i, /\/use[-_]?policies/i],
    type: "responsible_ai",
    confidence: 0.82
  },
  {
    patterns: [/\/model[-_]?spec$/i, /\/model[-_]?card/i, /\/system[-_]?card/i],
    type: "responsible_ai",
    confidence: 0.88
  },
  {
    patterns: [/\/transparency$/i, /\/transparency[-_]?report/i],
    type: "trust_center",
    confidence: 0.85
  },
  {
    patterns: [/\/charter$/i, /\/ai[-_]?charter/i],
    type: "responsible_ai",
    confidence: 0.85
  }
];
var TEXT_RULES = [
  {
    keywords: [/privacy\s+policy/i, /data\s+privacy/i, /personal\s+data/i],
    type: "privacy_policy",
    confidence: 0.8
  },
  {
    keywords: [/cookie\s+policy/i, /use\s+of\s+cookies/i, /cookie\s+preferences/i],
    type: "cookie_policy",
    confidence: 0.8
  },
  {
    keywords: [/terms\s+of\s+service/i, /terms\s+and\s+conditions/i, /terms\s+of\s+use/i],
    type: "terms",
    confidence: 0.75
  },
  {
    keywords: [/legal\s+notice/i, /legal\s+information/i, /legal\s+disclaimer/i],
    type: "legal",
    confidence: 0.75
  },
  {
    keywords: [/security\s+policy/i, /responsible\s+disclosure/i, /vulnerability\s+report/i],
    type: "security",
    confidence: 0.75
  },
  {
    keywords: [/trust\s+center/i, /security\s+compliance/i, /data\s+protection\s+compliance/i],
    type: "trust_center",
    confidence: 0.75
  },
  {
    keywords: [/data\s+processing\s+agreement/i, /data\s+processor/i, /controller.*processor/i],
    type: "dpa",
    confidence: 0.8
  },
  {
    keywords: [
      /responsible\s+(use\s+of\s+)?ai/i,
      /ethical\s+ai/i,
      /ai\s+principles/i,
      /ai\s+governance/i
    ],
    type: "responsible_ai",
    confidence: 0.78
  }
];
function classifyByUrl(url) {
  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch {
    return { url, pageType: "other", confidence: 0 };
  }
  for (const rule of URL_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(pathname)) {
        logger.debug(`${TAG6} URL match: ${url} \u2192 ${rule.type} (${rule.confidence})`);
        return { url, pageType: rule.type, confidence: rule.confidence };
      }
    }
  }
  return { url, pageType: "other", confidence: 0 };
}
function classifyByContent(url, title, text) {
  const combined = `${title} ${text.slice(0, 2e3)}`;
  let bestType = "other";
  let bestConfidence = 0;
  for (const rule of TEXT_RULES) {
    const matchCount = rule.keywords.filter((kw) => kw.test(combined)).length;
    if (matchCount > 0) {
      const confidence = Math.min(
        rule.confidence * (1 + (matchCount - 1) * 0.05),
        0.97
      );
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestType = rule.type;
      }
    }
  }
  if (bestType !== "other") {
    logger.debug(`${TAG6} Content match: ${url} \u2192 ${bestType} (${bestConfidence.toFixed(2)})`);
  }
  return { url, pageType: bestType, confidence: bestConfidence };
}
function classifyPage(url, title, text) {
  const urlResult = classifyByUrl(url);
  if (urlResult.confidence >= 0.85) {
    return urlResult;
  }
  if (title || text) {
    const contentResult = classifyByContent(url, title ?? "", text ?? "");
    if (contentResult.confidence > urlResult.confidence) {
      return contentResult;
    }
  }
  return urlResult;
}

// src/services/websiteScanner/index.ts
init_urlValidator();
init_logger();
init_contentExtractor();
init_urlValidator();
var TAG7 = "[WebsiteScannerService]";
var WebsiteScannerService = class {
  constructor() {
    /**
     * Extract clean, AI-ready text from a single page.
     * Thin wrapper around the contentExtractor module.
     */
    this.extractContent = extractPageContent;
    /**
     * Classify the type of a page (privacy policy, cookie policy, etc.)
     * using URL patterns and optional title/text signals.
     */
    this.classifyPage = classifyPage;
    /**
     * Probe a set of compliance paths for the given homepage.
     * Useful when only the compliance discovery step is needed.
     */
    this.discoverCompliancePages = discoverCompliancePages;
  }
  /**
   * Perform a full website scan.
   *
   * Steps:
   *   1. Validate + normalise the URL
   *   2. Discover internal pages (sitemap + Playwright link crawl)
   *   3. Probe well-known compliance pages
   *   4. Extract homepage metadata (optional)
   *
   * Returns a structured WebsiteScanResult.  Only fields for pages that were
   * actually found are populated; missing pages are null.
   */
  async scan(rawUrl, options = {}) {
    const { crawlLimit = 20, sitemapOnly = false, skipMetadata = false } = options;
    const homepageUrl = normaliseUrl(rawUrl);
    logger.info(`${TAG7} Starting scan for ${homepageUrl}`);
    const validation = validateUrl(homepageUrl);
    if (!validation.valid) {
      logger.warn(`${TAG7} URL blocked: ${validation.reason}`);
      return this.emptyResult(homepageUrl, `URL blocked: ${validation.reason}`);
    }
    const [crawlResult, compliancePages, metadata] = await Promise.all([
      discoverUrls(homepageUrl, { limit: crawlLimit, sitemapOnly }),
      discoverCompliancePages(homepageUrl),
      skipMetadata ? Promise.resolve(null) : extractPageMetadata(homepageUrl)
    ]);
    logger.info(
      `${TAG7} Scan complete \u2014 ${crawlResult.urls.length} pages discovered, ${compliancePages.length} compliance pages found`
    );
    return {
      homepage: homepageUrl,
      discoveredPages: crawlResult.urls,
      privacyPolicy: findFirst(compliancePages, "/privacy", "/privacy-policy") ?? null,
      cookiePolicy: findFirst(compliancePages, "/cookie-policy", "/cookies") ?? null,
      securityPage: findFirst(compliancePages, "/security", "/security-policy") ?? null,
      trustCenter: findFirst(compliancePages, "/trust", "/trust-center") ?? null,
      terms: findFirst(
        compliancePages,
        "/terms",
        "/terms-of-service",
        "/terms-and-conditions"
      ) ?? null,
      legal: findFirst(compliancePages, "/legal") ?? null,
      dpa: findFirst(compliancePages, "/dpa") ?? null,
      aiPolicy: findFirst(
        compliancePages,
        "/ai-policy",
        "/ai-principles",
        "/ai-safety",
        "/ai"
      ) ?? null,
      responsibleAI: findFirst(
        compliancePages,
        "/responsible-ai",
        "/responsible-ai-practices",
        "/ethics",
        "/governance"
      ) ?? null,
      safetyPage: findFirst(
        compliancePages,
        "/safety",
        "/about/safety"
      ) ?? null,
      policiesPage: findFirst(compliancePages, "/policies") ?? null,
      modelSpec: findFirst(compliancePages, "/model-spec", "/model-cards") ?? null,
      transparencyPage: findFirst(compliancePages, "/transparency") ?? null,
      charterPage: findFirst(compliancePages, "/charter") ?? null,
      metadata,
      scannedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  // ─── Private helpers ──────────────────────────────────────────────────────
  emptyResult(homepage, _reason) {
    return {
      homepage,
      discoveredPages: [homepage],
      privacyPolicy: null,
      cookiePolicy: null,
      securityPage: null,
      trustCenter: null,
      terms: null,
      legal: null,
      dpa: null,
      aiPolicy: null,
      responsibleAI: null,
      safetyPage: null,
      policiesPage: null,
      modelSpec: null,
      transparencyPage: null,
      charterPage: null,
      metadata: null,
      scannedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};

// src/services/jobQueue.ts
init_crypto();
import crypto6 from "crypto";
import pdf2 from "pdf-parse-fork";
import mammoth from "mammoth";

// src/services/jobs/handlers/drafting-handler.ts
init_database();
init_crypto();
import crypto5 from "crypto";
import pdf from "pdf-parse-fork";

// src/modules/drafting/steps/requirement-extraction.ts
init_config();
init_database();

// src/modules/drafting/retrieval/ClauseCatalogRetriever.ts
var ClauseCatalogRetriever = class {
  constructor(db) {
    this.db = db;
  }
  async fetchBaselineClauseTypes(filters) {
    if (filters.clauseIds && filters.clauseIds.length > 0) {
      return this.fetchByClauseIds(filters.clauseIds, filters.organizationId);
    }
    if (filters.templateId) {
      const templateClauses = await this.fetchByTemplateId(
        filters.templateId,
        filters.organizationId
      );
      if (templateClauses.length > 0) {
        return templateClauses;
      }
    }
    return this.fetchByMetadata(filters);
  }
  async fetchByClauseIds(clauseIds, organizationId) {
    const { rows } = await this.db.query(
      `
        SELECT DISTINCT clause_type
        FROM clause_catalog
        WHERE status = 'active'
          AND id = ANY($1::text[])
          AND ($2::text IS NULL OR organization_id = $2)
        ORDER BY clause_type
      `,
      [clauseIds, organizationId ?? null]
    );
    return rows.map((row) => row.clause_type);
  }
  async fetchByTemplateId(templateId, organizationId) {
    const { rows } = await this.db.query(
      `
        SELECT DISTINCT cc.clause_type
        FROM template_clause_mappings tcm
        INNER JOIN clause_catalog cc ON cc.id = tcm.clause_id
        WHERE tcm.template_id = $1
          AND cc.status = 'active'
          AND ($2::text IS NULL OR cc.organization_id = $2)
        ORDER BY cc.clause_type
      `,
      [templateId, organizationId ?? null]
    );
    return rows.map((row) => row.clause_type);
  }
  async fetchByMetadata(filters) {
    const { rows } = await this.db.query(
      `
        SELECT DISTINCT clause_type
        FROM clause_catalog
        WHERE status = 'active'
          AND ($1::text IS NULL OR contract_type = $1)
          AND ($2::text IS NULL OR jurisdiction = $2)
          AND ($3::text IS NULL OR industry = $3)
          AND ($4::text IS NULL OR organization_id = $4)
        ORDER BY clause_type
      `,
      [
        filters.contractType ?? null,
        filters.jurisdiction ?? null,
        filters.industry ?? null,
        filters.organizationId ?? null
      ]
    );
    return rows.map((row) => row.clause_type);
  }
};

// src/modules/drafting/steps/requirement-extraction.ts
var REQUIREMENT_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "contractType",
    "jurisdiction",
    "industry",
    "parties",
    "excludedClauses",
    "additionalRequiredClauses",
    "optionalClauses",
    "language",
    "instructions",
    "uploadDocSummary"
  ],
  properties: {
    contractType: { type: "string" },
    jurisdiction: { type: "string" },
    industry: { type: "string" },
    parties: { type: "array", items: { type: "string" } },
    excludedClauses: { type: "array", items: { type: "string" } },
    additionalRequiredClauses: { type: "array", items: { type: "string" } },
    optionalClauses: { type: "array", items: { type: "string" } },
    language: { type: "string" },
    instructions: { type: "string" },
    uploadDocSummary: { type: "string" }
  }
};
function appendValidationWarning(state, description) {
  const issue = {
    type: "formatting",
    severity: "warning",
    description,
    targetSection: "requirement-extraction"
  };
  const existingIssues = state.validation?.issues ?? [];
  return {
    ...state,
    validation: {
      isValid: false,
      issues: [...existingIssues, issue]
    }
  };
}
function readStringField(source, key) {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function readStringArrayField(source, key) {
  const value = source?.[key];
  if (!Array.isArray(value)) {
    return void 0;
  }
  return value.filter((item) => typeof item === "string");
}
function resolveCatalogFilters(state) {
  const formFields = state.request.formFields;
  return {
    contractType: readStringField(formFields, "contractType"),
    jurisdiction: readStringField(formFields, "jurisdiction"),
    industry: readStringField(formFields, "industry"),
    templateId: state.request.templateId,
    clauseIds: readStringArrayField(formFields, "clauseIds"),
    organizationId: readStringField(
      state.metadata,
      "organizationId"
    )
  };
}
function normalizeClauseName(name) {
  return name.trim().toLowerCase();
}
function mergeRequiredClauses(baselineClauses, excludedClauses, additionalRequiredClauses) {
  const excluded = new Set(excludedClauses.map(normalizeClauseName));
  const baselineNormalized = new Set(baselineClauses.map(normalizeClauseName));
  const retainedBaseline = baselineClauses.filter(
    (clause) => !excluded.has(normalizeClauseName(clause))
  );
  const additions = additionalRequiredClauses.filter((clause) => {
    const normalized = normalizeClauseName(clause);
    return !baselineNormalized.has(normalized) && !excluded.has(normalized);
  });
  return [...retainedBaseline, ...additions];
}
function buildExtractionPrompt(state, baselineRequiredClauses) {
  const formFields = state.request.formFields && Object.keys(state.request.formFields).length > 0 ? JSON.stringify(state.request.formFields) : "";
  const sourceText = typeof state.request.sourceText === "string" && state.request.sourceText.trim() ? state.request.sourceText : "";
  const sourceTextSnippet = sourceText.length > 12e3 ? `${sourceText.slice(0, 12e3)}\u2026` : sourceText;
  if (state.request.intent === "REACTIVE" && sourceTextSnippet) {
    return [
      "You are analyzing an incoming hostile legal notice, claim letter, or court petition document.",
      "Your goal is to extract the adversary's claims and synthesize a clean tactical instructions playbook.",
      "",
      "INCOMING HOSTILE DOCUMENT DETECTED:",
      sourceTextSnippet,
      "",
      "User defensive instructions strategy notes:",
      state.request.rawInstructions ?? "(none provided)",
      "",
      "FIELD EXTRACTION INSTRUCTIONS FOR REACTIVE DEFENSE:",
      "- `contractType`: Classify the specific response format needed (e.g., 'Breach Response Letter', 'Cease & Desist Rebuttal').",
      "- `parties`: Array where index 0 is [The Hostile Sender/Adversary] and index 1 is [Our Company/Target Name].",
      "- `jurisdiction`: The governing law or court location specified in the hostile claim text.",
      // TODO: We can improve this to an array of object where it store the configurations of the uploaded document
      "- `uploadedDocSummary`: Write a clear, 2-to-3 sentence summary explaining exactly what the adversary is alleging or demanding in the uploaded text.",
      "- `instructions`: Synthesize a comprehensive structural payload string. Format it EXACTLY like this: 'ADVERSARY ACCUSATIONS CLAIMS SUMMARY: [Write a 2-sentence structural summary of what they are alleging or demanding] | TARGET DEFENSE STRATEGY DIRECTIVES: [Summarize the user instructions strategy notes]'.",
      "- `excludedClauses` & `additionalRequiredClauses` & `optionalClauses`: Keep these empty [] unless the user notes explicitly request specific clause changes."
    ].filter(Boolean).join("\n");
  }
  const baselineClauseList = baselineRequiredClauses.length > 0 ? baselineRequiredClauses.map((clause) => `- ${clause}`).join("\n") : "- (none loaded from catalog)";
  return [
    "Extract structured drafting requirements from the inputs below.",
    "",
    "User instructions:",
    state.request.rawInstructions ?? "",
    "",
    formFields ? `Form fields (JSON):
${formFields}
` : "",
    sourceTextSnippet ? `Source text (snippet):
${sourceTextSnippet}
` : "",
    "Baseline required clauses (already loaded from the clause catalog \u2014 do NOT re-guess these):",
    baselineClauseList,
    "",
    "Clause handling rules:",
    "- `excludedClauses`: clause types the user explicitly asked to omit or exclude from the baseline list above.",
    "- `additionalRequiredClauses`: ONLY clause types that are NOT already in the baseline list but are required based on user instructions or obvious contract gaps.",
    "- Do NOT repeat baseline clauses inside `additionalRequiredClauses`.",
    "- Do NOT invent baseline clauses from scratch; the platform already loaded them from the database.",
    "- If the user requests a specific new clause (e.g. 'add a non-compete'), put it in `additionalRequiredClauses`.",
    "- If the user says to skip/remove a baseline clause (e.g. 'no indemnity clause'), put it in `excludedClauses`.",
    "",
    "Other field rules:",
    "- Produce concrete strings (no nulls).",
    "- If a value is unknown, infer a safe default consistent with the instructions.",
    "- `parties` must be an array of party names (strings).",
    "- `optionalClauses` must be clause/topic names that are nice-to-have but not mandatory.",
    "- `instructions` should be a cleaned, consolidated instruction string."
  ].filter(Boolean).join("\n");
}
async function fetchBaselineClauses(state) {
  if (state.request.intent === "REACTIVE") {
    return { clauses: [] };
  }
  try {
    const filters = resolveCatalogFilters(state);
    const retriever = new ClauseCatalogRetriever(pool);
    const clauses = await retriever.fetchBaselineClauseTypes(filters);
    return { clauses };
  } catch (err) {
    return {
      clauses: [],
      warning: `Clause catalog lookup failed; continuing without baseline clauses. ${err.message}`
    };
  }
}
function toRequirementContext(extracted, baselineRequiredClauses) {
  return {
    contractType: extracted.contractType,
    jurisdiction: extracted.jurisdiction,
    industry: extracted.industry,
    parties: extracted.parties,
    requiredClauses: mergeRequiredClauses(
      baselineRequiredClauses,
      extracted.excludedClauses,
      extracted.additionalRequiredClauses
    ),
    optionalClauses: extracted.optionalClauses,
    language: extracted.language,
    instructions: extracted.instructions,
    uploadDocSummary: extracted.uploadDocSummary.trim() ? extracted.uploadDocSummary : void 0
  };
}
async function requirementExtractionStep(state, provider = "GEMINI" /* GEMINI */) {
  const isReactive = state.request.intent === "REACTIVE";
  const systemInstruction2 = isReactive ? "You are a deterministic requirements extraction engine analyzing an adversarial legal document. Focus on extracting the claim facts and defense targets. Return ONLY valid JSON matching the provided JSON Schema. Do not include markdown or commentary." : "You are a deterministic requirements extraction engine. Baseline required clauses are already provided by the platform from the database. Your clause task is limited to identifying exclusions and additional required clauses only. Return ONLY valid JSON matching the provided JSON Schema. Do not include markdown or commentary.";
  const { clauses: baselineRequiredClauses, warning: catalogWarning } = await fetchBaselineClauses(state);
  let workingState = state;
  if (catalogWarning) {
    workingState = appendValidationWarning(workingState, catalogWarning);
  }
  const prompt = buildExtractionPrompt(workingState, baselineRequiredClauses);
  try {
    if (!config.openRouterApiKey || !config.openRouterApiKey.trim()) {
      const fallbackRequirements = {
        contractType: readStringField(state.request.formFields, "contractType") ?? "General",
        jurisdiction: readStringField(state.request.formFields, "jurisdiction") ?? "Unspecified",
        industry: readStringField(state.request.formFields, "industry") ?? "General",
        parties: [],
        requiredClauses: baselineRequiredClauses,
        optionalClauses: [],
        language: "English",
        instructions: state.request.rawInstructions ?? ""
      };
      return appendValidationWarning(
        {
          ...workingState,
          requirements: fallbackRequirements
        },
        "Requirement extraction skipped: OPENROUTER_API_KEY is not configured."
      );
    }
    const extracted = await executeJsonCompletion(
      prompt,
      systemInstruction2,
      REQUIREMENT_EXTRACTION_JSON_SCHEMA,
      "STRUCTURAL_JSON" /* STRUCTURAL_JSON */,
      provider
    );
    return {
      ...workingState,
      requirements: toRequirementContext(extracted, baselineRequiredClauses),
      metadata: {
        ...workingState.metadata,
        requirementExtraction: {
          baselineRequiredClauses,
          excludedClauses: extracted.excludedClauses,
          additionalRequiredClauses: extracted.additionalRequiredClauses
        }
      }
    };
  } catch (err) {
    const fallbackRequirements = {
      contractType: readStringField(state.request.formFields, "contractType") ?? "General",
      jurisdiction: readStringField(state.request.formFields, "jurisdiction") ?? "Unspecified",
      industry: readStringField(state.request.formFields, "industry") ?? "General",
      parties: [],
      requiredClauses: baselineRequiredClauses,
      optionalClauses: [],
      language: "English",
      instructions: state.request.rawInstructions ?? ""
    };
    return appendValidationWarning(
      {
        ...workingState,
        requirements: fallbackRequirements
      },
      `Requirement extraction failed; continuing with catalog baseline clauses. ${err.message}`
    );
  }
}

// src/modules/drafting/steps/retrieval.ts
init_database();
var retrievalStep = async (state) => {
  if (!state.requirements) {
    throw new Error("Cannot execute retrieval step: state.requirements is null");
  }
  const requirements = state.requirements;
  const buildFallbackClauses = (clauseTypes) => {
    const fallbackLibrary = {
      Confidentiality: "Each Party shall keep Confidential Information strictly confidential, use it only for performance under this Agreement, and apply reasonable safeguards no less protective than those used for its own confidential materials.",
      Liability: "Neither Party shall be liable for indirect, incidental, special, or consequential damages. Aggregate liability under this Agreement shall not exceed the total fees paid in the twelve (12) months preceding the event giving rise to liability.",
      Indemnity: "Each Party shall defend, indemnify, and hold harmless the other Party from third-party claims arising from its breach of law, gross negligence, or willful misconduct, subject to prompt notice and cooperation.",
      Termination: "Either Party may terminate this Agreement for material breach not cured within thirty (30) days after written notice. Upon termination, accrued payment obligations and clauses intended to survive shall remain in effect.",
      DataProtection: "Where personal data is processed, the Parties shall comply with applicable data protection laws, process data only on documented instructions, and implement appropriate technical and organizational security measures.",
      GoverningLaw: `This Agreement shall be governed by the laws of ${requirements.jurisdiction}, excluding conflict-of-law rules, and disputes shall be resolved in the competent courts of that jurisdiction.`,
      General: "This clause is a temporary approved placeholder and should be replaced by a clause from the managed clause library once vector and keyword retrievers are integrated."
    };
    return clauseTypes.map((rawType, index) => {
      const cleanType = String(rawType || "General").trim() || "General";
      const normalized = cleanType.replace(/\s+/g, "");
      const text = fallbackLibrary[normalized] || fallbackLibrary[cleanType] || fallbackLibrary.General;
      return {
        id: `fallback_clause_${index + 1}`,
        clauseType: cleanType,
        jurisdiction: requirements.jurisdiction,
        riskLevel: index < 2 ? "Low" : "Medium",
        isApproved: true,
        text
      };
    });
  };
  const retrieveClauses = async () => {
    const requestedTypes = [
      ...requirements.requiredClauses || [],
      ...requirements.optionalClauses || []
    ];
    const normalizedTypes = (requestedTypes.length ? requestedTypes : ["General"]).slice(0, 6);
    try {
      const { rows } = await pool.query(
        `SELECT id, name, details, tags
         FROM library_items
         WHERE type = 'clauses'
         ORDER BY created_at DESC
         LIMIT 50`
      );
      if (!rows.length) {
        return buildFallbackClauses(normalizedTypes);
      }
      const ranked = [];
      const loweredNeedles = normalizedTypes.map((t) => t.toLowerCase());
      for (const row of rows) {
        const detailsText = typeof row.details === "string" ? row.details : JSON.stringify(row.details || {});
        const tagsText = typeof row.tags === "string" ? row.tags : JSON.stringify(row.tags || []);
        const haystack = `${row.name || ""} ${detailsText} ${tagsText}`.toLowerCase();
        const matchingType = loweredNeedles.find((t) => haystack.includes(t));
        if (!matchingType) continue;
        ranked.push({
          id: String(row.id),
          clauseType: matchingType,
          jurisdiction: requirements.jurisdiction,
          riskLevel: "Medium",
          isApproved: true,
          text: detailsText
        });
        if (ranked.length >= 8) break;
      }
      if (ranked.length > 0) {
        return ranked;
      }
      return buildFallbackClauses(normalizedTypes);
    } catch {
      return buildFallbackClauses(normalizedTypes);
    }
  };
  const readPlaybookRulesFromDb = async () => {
    try {
      const { rows } = await pool.query(
        `SELECT id, topic, standard_position, fallback_positions, walk_away_condition
         FROM playbook_rules
         WHERE contract_type = $1
         ORDER BY created_at DESC
         LIMIT 25`,
        [requirements.contractType]
      );
      return rows.map((row) => ({
        id: String(row.id),
        topic: String(row.topic ?? "General"),
        standardPosition: String(row.standard_position ?? ""),
        fallbackPositions: Array.isArray(row.fallback_positions) ? row.fallback_positions : [],
        walkAwayCondition: String(row.walk_away_condition ?? "")
      }));
    } catch {
      return [];
    }
  };
  const readTemplateFromDb = async () => {
    try {
      const inputTemplateId = state.request?.templateId;
      if (inputTemplateId && inputTemplateId.trim()) {
        const targetQuery = inputTemplateId.length === 36 || inputTemplateId.includes("-") ? "SELECT content FROM contract_templates WHERE id = $1 AND status = 'active' LIMIT 1" : "SELECT content FROM contract_templates WHERE name ILIKE $1 AND status = 'active' LIMIT 1";
        const res = await pool.query(targetQuery, [inputTemplateId]);
        if (res.rows.length > 0 && res.rows[0]?.content) {
          return String(res.rows[0].content);
        }
      }
      const fallbackSql = `
      SELECT content FROM contract_templates 
      WHERE contract_type = $1 AND jurisdiction = $2 AND status = 'active' 
      LIMIT 1;
    `;
      const fallbackRes = await pool.query(fallbackSql, [requirements.contractType, requirements.jurisdiction]);
      return fallbackRes.rows.length > 0 ? String(fallbackRes.rows[0].content) : null;
    } catch (err) {
      console.error("Template retrieval error:", err);
      return null;
    }
  };
  const [dbRules, matchedTemplate] = await Promise.all([
    readPlaybookRulesFromDb(),
    readTemplateFromDb()
  ]);
  const clauses = await retrieveClauses();
  return {
    ...state,
    retrieval: {
      matchedTemplate,
      applicablePlaybookRules: dbRules,
      // Keep playbook retrieval on DB output only
      fallbackClauses: clauses,
      // Top ranked primary/fallbacks preserved
      historicalReferences: []
    },
    metadata: {
      ...state.metadata,
      retrievedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
};

// src/modules/drafting/prompts/system-templates.ts
var SYSTEM_CORE_GUARDRAILS = `
# SYSTEM INSTRUCTIONS & OPERATIONAL GUARDRAILS
You are a precise legal drafting engine. Your task is to generate the final contract text.
You must merge the provided BASELINE TEMPLATE TEXT into the compulsory DOCUMENT SKELETON headers, while strictly enforcing the MANDATORY PLAYBOOK RULES.

CRITICAL GUARDRAILS:
1. Do not invent your own document layout. Use the headers provided in the SKELETON.
2. Adopt the phrasing, tone, and standard boilerplate from the BASELINE TEMPLATE TEXT where applicable, but override it if it conflicts with a Playbook Rule.
3. Replace all bracketed placeholders (e.g., [\u25CF DATE], [\u25CF PARTY A NAME]) using the data found in the RUNTIME REQUIREMENTS.
`.trim();
var SYSTEM_REACTIVE_GUARDRAILS = `
You are an elite corporate defense attorney specializing in alternative dispute resolution. 
Your sole task is to draft a formal legal response, answer, or rebuttal letter to an incoming hostile claim, notice, or petition.

CRITICAL DEFENSIVE GUARDRAILS:
1. FACTUAL COUNTER: Methodically address the allegations found in the claim text using the provided marching orders.
2. DISPUTE LIABILITY: Protect the target company's interests. Do not waive corporate rights or concede any fault or financial breach unless explicitly commanded.
3. PRESERVE STRUCTURE: Format the output document cleanly matching the headings provided in the response skeleton.
`.trim();
var SYSTEM_TRANSACTIONAL_GUARDRAILS = `
You are a corporate transactional attorney and contract draftsman.
Your sole task is to draft the agreement immediately in clean, production-ready legal prose.

CRITICAL TRANSACTIONAL GUARDRAILS:
1. Start directly with the agreement text and the required contract sections.
2. Do not add administrative headers, cover memos, litigation labels, or commentary.
3. Use a neutral deal-drafting tone that prioritizes clarity, enforceability, and practical clause construction.
`.trim();
function buildPlaybookSection(rules) {
  let block = "# MANDATORY CORPORATE PLAYBOOK RULES\n";
  if (rules.length === 0) {
    return block + "No specific company compliance restrictions found.\n";
  }
  rules.forEach((rule) => {
    block += `- Topic: ${rule.topic}
  * Standard Position: ${rule.standardPosition}
  * Fallbacks: ${rule.fallbackPositions.join(" | ")}
  * Walk-away: ${rule.walkAwayCondition}

`;
  });
  return block.trim();
}
function buildClauseSection(clauses) {
  let block = "# RETRIEVED APPROVED REFERENCE CLAUSES\n";
  if (clauses.length === 0) {
    return block + "No custom clause library matches found.\n";
  }
  clauses.forEach((clause) => {
    block += `[Clause ID: ${clause.id} | Type: ${clause.clauseType}]
"${clause.text}"

`;
  });
  return block.trim();
}
function buildSkeletonSection(skeleton) {
  let block = "# COMPULSORY DOCUMENT SKELETON STRUCTURAL SPINE\n";
  skeleton.forEach((heading, idx) => {
    block += `${idx + 1}. ${heading}
`;
  });
  return block.trim();
}
function buildVariablesSection(requirements, intent) {
  const currentIntent = typeof intent === "string" ? intent.toLowerCase() : "";
  if (currentIntent === "REACTIVE") {
    const adversaryName = requirements.parties[0] || "Hostile Claimant";
    const targetName = requirements.parties[1] || "Our Company (Respondent)";
    return `
# REACTIVE DISPUTE VARIABLES & LITIGATION CONTEXT
- Dispute Response Category: ${requirements.contractType}
- Adversarial Forum / Jurisdiction: ${requirements.jurisdiction}
- Target Industry Domain: ${requirements.industry}
- Involved Entities: ${adversaryName} (Claimant/Adversary) VS. ${targetName} (Our Company/Respondent)
- Operational Intent: REACTIVE

# COMPREHENDED ADVERSARIAL CLAIMS SUMMARY
${requirements.uploadDocSummary || "Review raw text fields for explicit claim allegations."}

# DEFENSE STRATEGY & MARCHING ORDERS
${requirements.instructions || "Draft a firm, professional legal rebuttal denying liability based on standard guidelines."}
`.trim();
  }
  return `
# DYNAMIC VARIABLES & EXTRACTED RUNTIME REQUIREMENTS
- Contract Type: ${requirements.contractType}
- Governing Law/Jurisdiction: ${requirements.jurisdiction}
- Target Industry Segment: ${requirements.industry}
- Identified Parties: ${requirements.parties.join(" AND ")}
- Operational Mode: ${intent}

# SPECIAL USER EXTRA EXECUTION INSTRUCTIONS
${requirements.instructions || "Draft a clean, balanced agreement following the guidelines above."}
`.trim();
}
var REFINEMENT_CORE_GUARDRAILS = `
# SYSTEM INSTRUCTIONS & REVISION GUARDRAILS
You are an expert legal editor. Your sole task is to revise an existing draft contract based on a provided checklist of target corrections.

CRITICAL REFINEMENT GUARDRAILS:
1. PRESERVE INTEGRITY: Do not rewrite parts of the contract that are unaffected by the correction checklist. Retain the tone, layout, and style of the existing draft.
2. SURROUNDING TEXT SAFETIES: Ensure that any modified sections seamlessly integrate with the surrounding text. Do not break section numbering or internal cross-references.
3. SPECIFIC SCOPE: If a highlighted text target is provided, focus your edits strictly within that targeted boundary block.
`.trim();
function buildUnifiedCorrectionList(issues, highlightedText, userNotes) {
  let block = "# REVISION TARGETS AND CORRECTION CRITERIA\n";
  let counter = 1;
  if (issues && issues.length > 0) {
    block += `## AUTOMATED CRITICAL COMPLIANCE FIXES:
`;
    issues.forEach((issue) => {
      block += `${counter}. [${issue.severity.toUpperCase()} - ${issue.type}] In section '${issue.targetSection || "General"}': ${issue.description}
`;
      counter++;
    });
  }
  if (highlightedText || userNotes && userNotes.trim() !== "") {
    block += `
## HUMAN USER DIRECTIVES & ADJUSTMENTS:
`;
    if (highlightedText) {
      block += `${counter}. TARGET TEXT AREA TO PATCH: "${highlightedText}"
`;
      counter++;
    }
    if (userNotes) {
      block += `${counter}. USER EDITING INSTRUCTION: ${userNotes}
`;
      counter++;
    }
  }
  if (counter === 1) {
    block += "No revision targets specified. Return the document unchanged.\n";
  }
  return block.trim();
}

// src/modules/drafting/steps/context-assembly.ts
var PROACTIVE_CONTRACT_SKELETON = [
  "Definitions",
  "Parties & Preamble",
  "Confidentiality & Non-Disclosure Obligations",
  "Limitation of Liability & Indemnification",
  "Termination & Survival Mechanics",
  "Intellectual Property (IP) Ownership Rights",
  "Governing Law & Dispute Resolution",
  "Signatures & Execution Blocks"
];
var REACTIVE_RESPONSE_SKELETON = [
  "Preamble & Notice Identification",
  "Factual Recitals & Core Disputes",
  "Affirmative Defense & Policy Arguments",
  "Formal Demand, Remedy Requests & Closure",
  "Signatures & Legal Representation Blocks"
];
var contextAssemblyStep = async (state) => {
  if (!state.requirements) {
    throw new Error("Context Assembly aborted: state.requirements data block missing.");
  }
  const { retrieval, requirements, request } = state;
  let SYSTEM_PROMPT4;
  let fullCompiledPrompt;
  let ACTIVE_SKELETON;
  const isReactive = state.request.intent === "REACTIVE";
  const isTransactionalDraft = state.request.intent === "PROACTIVE" || state.requirements.contractType === "NDA";
  if (isReactive) {
    SYSTEM_PROMPT4 = SYSTEM_REACTIVE_GUARDRAILS;
    ACTIVE_SKELETON = REACTIVE_RESPONSE_SKELETON;
  } else if (isTransactionalDraft) {
    SYSTEM_PROMPT4 = SYSTEM_TRANSACTIONAL_GUARDRAILS;
    ACTIVE_SKELETON = PROACTIVE_CONTRACT_SKELETON;
  } else {
    SYSTEM_PROMPT4 = SYSTEM_TRANSACTIONAL_GUARDRAILS;
    ACTIVE_SKELETON = PROACTIVE_CONTRACT_SKELETON;
  }
  fullCompiledPrompt = [
    SYSTEM_PROMPT4,
    buildPlaybookSection(retrieval.applicablePlaybookRules),
    buildClauseSection(retrieval.fallbackClauses),
    `# BASELINE TEMPLATE TEXT
${retrieval.matchedTemplate || "No baseline text provided."}`,
    buildSkeletonSection(ACTIVE_SKELETON),
    buildVariablesSection(requirements, request.intent)
  ].join("\n\n");
  return {
    ...state,
    context: {
      systemPrompt: SYSTEM_PROMPT4,
      assembledPrompt: fullCompiledPrompt,
      documentSkeleton: ACTIVE_SKELETON
    }
  };
};

// src/modules/drafting/steps/generation.ts
import dotenv2 from "dotenv";
dotenv2.config();
function cleanMarkdownArtifacts(rawText) {
  let cleanedText = rawText.trim();
  if (cleanedText.startsWith("```markdown")) {
    cleanedText = cleanedText.replace(/^```markdown\s*/i, "");
  } else if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.replace(/^```\s*/, "");
  }
  if (cleanedText.endsWith("```")) {
    cleanedText = cleanedText.replace(/\s*```$/, "");
  }
  return cleanedText.trim();
}
var generationStep = async (state, provider = "GEMINI" /* GEMINI */) => {
  if (!state.context || !state.context.assembledPrompt) {
    throw new Error("Generation Step Aborted: Context has not been assembled. state.context.assembledPrompt is null.");
  }
  try {
    const runtimeConfig = PROVIDER_TASK_PRESETS[provider]["COMPLEX_DRAFT" /* COMPLEX_DRAFT */];
    const modelUsed = typeof state.metadata.generationParameters?.model === "string" ? state.metadata.generationParameters.model : runtimeConfig.model;
    const rawModelOutput = await executeCompletion(
      state.context.assembledPrompt,
      state.context.systemPrompt,
      "COMPLEX_DRAFT" /* COMPLEX_DRAFT */,
      provider
    );
    const cleanedDocumentText = cleanMarkdownArtifacts(rawModelOutput);
    const currentVersion = state.draft ? state.draft.version + 1 : 1;
    return {
      ...state,
      draft: {
        rawOutput: rawModelOutput,
        formattedDocument: cleanedDocumentText,
        version: currentVersion,
        parentVersionId: state.draft ? `v${state.draft.version}` : void 0
      },
      metadata: {
        ...state.metadata,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        generationParameters: {
          ...state.metadata.generationParameters,
          provider,
          task: "COMPLEX_DRAFT" /* COMPLEX_DRAFT */,
          model: modelUsed,
          runtimeConfig
        },
        modelUsed
      }
    };
  } catch (error) {
    console.error("Fatal execution exception within generation step component:", error);
    throw new Error(`Generation Layer Failure: ${error.message}`);
  }
};

// src/modules/drafting/prompts/validation-template.ts
var systemInstruction = `
You are a meticulous enterprise legal auditor. Your task is to review the generated contract text against a provided list of strict corporate playbook policies and reference cross-links.
Flag any direct violations, broken internal article references (e.g., Section 4 referencing Section 9 when Section 9 doesn't exist), or jurisdiction compliance failures.
Your output must conform strictly to the requested JSON array schema. Do not include conversational preambles.
  `;
var builderAuditPrompt = (state) => {
  return `
  # DRAFT CONTRACT TO AUDIT
  ${state.draft.formattedDocument}
  
  # CORPORATE COMPLIANCE PLAYBOOK RULES TO VERIFY AGAINST
  ${JSON.stringify(state.retrieval.applicablePlaybookRules, null, 2)}
  
  # EXPECTED JURISDICTION BOUNDARY
  ${state.requirements?.jurisdiction || "Not specified"}
  
  Perform the audit and return all found errors. If the document is flawless and complies completely, return an empty issues array.
    `;
};

// src/modules/drafting/schemas/validation-schema.ts
var LLM_VALIDATION_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      description: "List of compliance, legal, or reference issues found in the draft.",
      items: {
        type: "object",
        required: ["type", "severity", "description"],
        properties: {
          type: {
            type: "string",
            enum: ["omission", "reference_broken", "playbook_violation", "formatting", "jurisdiction"]
          },
          severity: {
            type: "string",
            enum: ["warning", "critical"]
          },
          description: {
            type: "string",
            description: "Detailed explanation of the exact issue and why it fails compliance."
          },
          targetSection: {
            type: "string",
            description: "The name of the header or section where this issue occurs."
          }
        }
      }
    }
  },
  required: ["issues"]
};

// src/modules/drafting/steps/validation.ts
var validationStep = async (state, provider = "GEMINI" /* GEMINI */) => {
  if (!state.draft || !state.draft.formattedDocument) {
    throw new Error("Validation Step Aborted: No generated draft content available to validate.");
  }
  const documentText = state.draft.formattedDocument;
  const issues = [];
  if (state.context?.documentSkeleton) {
    state.context.documentSkeleton.forEach((heading) => {
      if (!documentText.includes(heading)) {
        issues.push({
          type: "omission",
          severity: "critical",
          description: `Compulsory structural header matching '${heading}' is entirely missing from the document output.`,
          targetSection: heading
        });
      }
    });
  }
  const placeholderRegex = /\[●.*?\]|\[Insert.*?\]|__+/gi;
  let match;
  while ((match = placeholderRegex.exec(documentText)) !== null) {
    issues.push({
      type: "formatting",
      severity: "warning",
      description: `Unresolved structural placeholder token remaining at index location ${match.index}: "${match[0]}"`
    });
  }
  const auditPrompt = builderAuditPrompt(state);
  try {
    const llmResult = await executeJsonCompletion(
      auditPrompt.trim(),
      systemInstruction.trim(),
      LLM_VALIDATION_SCHEMA,
      "STRUCTURAL_JSON" /* STRUCTURAL_JSON */,
      provider
    );
    if (llmResult && Array.isArray(llmResult.issues)) {
      issues.push(...llmResult.issues);
    }
  } catch (error) {
    console.error("Non-blocking validation warning: Semantic audit engine failed.", error);
    issues.push({
      type: "formatting",
      severity: "warning",
      description: `Semantic analysis step partially timed out or failed to parse: ${error.message}`
    });
  }
  const isValid = !issues.some((issue) => issue.severity === "critical");
  return {
    ...state,
    validation: {
      isValid,
      issues
    },
    metadata: {
      ...state.metadata,
      validatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      totalIssuesFound: issues.length,
      criticalCount: issues.filter((i) => i.severity === "critical").length
    }
  };
};

// src/modules/drafting/prompts/risk-review-template.ts
var builderReviewPrompt = (state) => {
  return `
# CONTRACT DRAFT FOR RISK EVALUATION
${state.draft.formattedDocument}

# CLIENT COMPANY BUSINESS CONTEXT & REQ_CONTEXT
- Target Industry Segment: ${state.requirements?.industry || "Standard"}
- Operational Mode: ${state.request.mode}

Analyze the text and populate the array with any identified substantive risk exposures, along with clear explanations and suggested mitigation clause updates.
  `;
};

// src/modules/drafting/schemas/risk-review-schema.ts
var LLM_RISK_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    risks: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "explanation"],
        properties: {
          severity: { type: "string", enum: ["Low", "Medium", "High"] },
          explanation: { type: "string" },
          suggestedReplacementClause: { type: "string" }
        }
      }
    }
  },
  required: ["risks"]
};

// src/modules/drafting/steps/risk-review.ts
var riskReviewStep = async (state, provider = "GEMINI" /* GEMINI */) => {
  if (!state.draft || !state.draft.formattedDocument) {
    throw new Error("Risk Review Aborted: Cannot perform risk analysis on an empty contract draft.");
  }
  const reviewPrompt = builderReviewPrompt(state);
  try {
    const llmResult = await executeJsonCompletion(
      reviewPrompt.trim(),
      systemInstruction.trim(),
      LLM_RISK_REVIEW_SCHEMA,
      "STRUCTURAL_JSON_LITE" /* STRUCTURAL_JSON_LITE */
    );
    const activeRisks = llmResult?.risks ?? [];
    return {
      ...state,
      riskReview: {
        analyzed: true,
        risks: activeRisks
      },
      metadata: {
        ...state.metadata,
        riskReviewExecutedAt: (/* @__PURE__ */ new Date()).toISOString(),
        totalRisksIdentified: activeRisks.length,
        highSeverityRisksCount: activeRisks.filter((r) => r.severity === "High").length
      }
    };
  } catch (error) {
    console.error("Non-blocking execution warning: Risk Review processing failed.", error);
    return {
      ...state,
      riskReview: {
        analyzed: false,
        risks: []
      },
      metadata: {
        ...state.metadata,
        riskReviewError: error.message,
        riskReviewExecutedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  }
};

// src/modules/drafting/steps/refinement-assembly.ts
var contextAssemblyRefinementStep = async (state) => {
  if (!state.draft || !state.draft.formattedDocument) {
    throw new Error("Refinement Assembly Aborted: No existing draft document found in state to refine.");
  }
  const existingDraftText = state.draft.formattedDocument;
  const playbookRules = state.retrieval.applicablePlaybookRules || [];
  const activeSkeleton = state.context?.documentSkeleton || [];
  const unifiedCorrections = buildUnifiedCorrectionList(
    state.validation?.issues,
    state.request.highlightedText,
    state.request.rawInstructions
  );
  const fullRefinementPrompt = [
    REFINEMENT_CORE_GUARDRAILS,
    buildPlaybookSection(playbookRules),
    `# CURRENT DOCUMENT DRAFT SNAPSHOT (CURRENTLY UNSTABLE)
Use this text as your base copy. Apply revisions directly onto it:

${existingDraftText}`,
    buildSkeletonSection(activeSkeleton),
    unifiedCorrections
    // Highly dynamic instructions sit right at the bottom!
  ].join("\n\n");
  return {
    ...state,
    context: {
      ...state.context,
      systemPrompt: REFINEMENT_CORE_GUARDRAILS,
      assembledPrompt: fullRefinementPrompt,
      documentSkeleton: activeSkeleton
    },
    metadata: {
      ...state.metadata,
      refinementPromptAssembledAt: (/* @__PURE__ */ new Date()).toISOString(),
      currentRefinementVersionLoop: state.draft.version
    }
  };
};

// src/modules/drafting/steps/save.ts
init_database();
var saveStep = async (state) => {
  if (!state.draft) {
    throw new Error("Save Step Aborted: Cannot execute state persistence layer on an empty draft artifact.");
  }
  try {
    const snapshotMatrix = structuredClone({
      requirements: state.requirements,
      retrieval: state.retrieval,
      context: state.context,
      draft: state.draft,
      validation: state.validation,
      riskReview: state.riskReview,
      metadata: state.metadata
    });
    const documentId = state.request.payloadFields?.documentId || `doc_${crypto.randomUUID()}`;
    const currentVersion = state.draft.version;
    await pool.query(
      `INSERT INTO draft_state_ledger (
        document_id, 
        version, 
        state_snapshot_json, 
        formatted_text, 
        updated_at
      ) 
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (document_id, version) 
      DO UPDATE SET 
        state_snapshot_json = EXCLUDED.state_snapshot_json,
        formatted_text = EXCLUDED.formatted_text,
        updated_at = NOW()`,
      [
        documentId,
        currentVersion,
        JSON.stringify(snapshotMatrix),
        // Stores the cloned state object
        state.draft.formattedDocument
        // Stores the actual text for quick index lookups
      ]
    );
    console.log(`[Ledger] Successfully committed Snapshot V${currentVersion} for document ${documentId}`);
    return {
      ...state,
      metadata: {
        ...state.metadata,
        persistedDocumentId: documentId,
        isFullySaved: true,
        finalSavedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  } catch (error) {
    console.error("Fatal database exception encountered during pipeline ledger save operations:", error);
    throw new Error(`Persistence Layer Failure: ${error.message}`);
  }
};

// src/modules/drafting/workflows/draft-workflow.ts
var DraftWorkflowOrchestrator = class {
  /**
   * Pipeline 1: Generation from Scratch / Template
   */
  async executeInitialWorkflow(initialState) {
    let state = { ...initialState };
    try {
      state = await requirementExtractionStep(state);
      state = await retrievalStep(state);
      state = await contextAssemblyStep(state);
      state = await generationStep(state);
      console.log(state);
      console.log("Executing Validation and Risk Review pipelines concurrently...");
      const validationState = { validation: [], metadata: "" };
      const riskReviewState = { riskReview: [], metadata: "" };
      console.log("Pipeline complete. Committing final state snapshot to database ledger...");
      state = await saveStep(state);
      return state;
    } catch (error) {
      throw new Error(
        `Initial drafting orchestrator failed: ${error.message}`
      );
    }
  }
  /**
   * Pipeline 2: Targeted Document Refinement Cycle
   */
  async executeHumanRefinementPipeline(initialState1) {
    try {
      let attempts = 0;
      const MAX_RETRY_ATTEMPTS = 1;
      let initialState = initialState1;
      while (attempts < MAX_RETRY_ATTEMPTS) {
        const updateState = await contextAssemblyRefinementStep(initialState);
        const generateState = await generationStep(updateState);
        initialState = await validationStep(generateState);
        const hasStucturalProblems = initialState.validation?.issues.some((issue) => issue.type === "omission" && issue.severity === "critical") ?? false;
        if (!hasStucturalProblems) {
          break;
        }
        attempts++;
      }
      const stillHasGlitches = initialState.validation?.issues.some(
        (issue) => (issue.type === "formatting" || issue.type === "omission") && issue.severity === "critical"
      ) ?? false;
      if (stillHasGlitches) {
        return {
          ...initialState,
          draft: initialState.draft,
          // Rollback text to the stable v1 document copy
          validation: {
            isValid: false,
            issues: [
              {
                type: "omission",
                severity: "critical",
                description: "Refinement aborted: The generation engine corrupted the document structure. Restored prior version."
              }
            ]
          }
        };
      }
      const riskEvaluatedState = await riskReviewStep(initialState);
      const finalizedState = await saveStep(riskEvaluatedState);
      return finalizedState;
    } catch (error) {
      throw new Error(
        `Refinement cycle orchestrator failed: ${error.message}`
      );
    }
  }
  // async executeRefinementWorkflow(initialState: DraftState): Promise<DraftState> {
  //   let state: DraftState = { ...initialState };
  //   try {
  //     // Skip extraction; load historical generation context + playbook directly from past state
  //     state = await retrievalStep(state);
  //     // Specialized assembly combining context + summary + highlights + instructions
  //     state = await refinementAssemblyStep(state);
  //     // Execution, validation, and saving as an incremented version
  //     state = await generationStep(state);
  //     state = await validationStep(state);
  //     state = await riskReviewStep(state);
  //     state = await saveStep(state);
  //     return state;
  //   } catch (error) {
  //     throw new Error(
  //       `Refinement cycle orchestrator failed: ${(error as Error).message}`
  //     );
  //   }
  // }
};

// src/services/jobs/handlers/drafting-handler.ts
async function handleInitialDraftingJob(jobId, userId, payload) {
  const { mode, instructions, contractType, formFields, templateId, sourceDocumentId, extractedFields } = payload;
  console.log("Entered main handleInitialDraftingJob with mode:", mode);
  await updateJobProgress(jobId, userId, 20, "Extracting compliance parameters and routing tracking slots...");
  const targetDocId = "doc_" + crypto5.randomUUID();
  let resolvedSourceText = void 0;
  if (mode === "REACTIVE" && sourceDocumentId) {
    try {
      const fileLookup = await pool.query(
        "SELECT content, is_encrypted FROM files WHERE id = $1 LIMIT 1",
        [sourceDocumentId]
      );
      if (fileLookup.rows.length > 0) {
        const fileRow = fileLookup.rows[0];
        resolvedSourceText = fileRow.is_encrypted ? decryptData(fileRow.content) : fileRow.content;
      }
    } catch (err) {
      console.error("Failed to resolve reactive source text from sourceDocumentId:", err);
    }
  }
  const evaluatedIntent = mode || "BASIC";
  await updateJobProgress(jobId, userId, 25, "Structuring tracking context state blocks...");
  const initialStateContainer = {
    request: {
      intent: evaluatedIntent,
      mode: mode === "BASIC" ? "Basic" : mode === "PROACTIVE" ? "Standard Template" : "Advanced Proactive",
      rawInstructions: instructions || "",
      sourceText: resolvedSourceText,
      templateId: templateId || void 0,
      formFields: formFields || {},
      payloadFields: { documentId: targetDocId }
    },
    requirements: {
      contractType: contractType || formFields?.contractType || "General",
      jurisdiction: formFields?.jurisdiction || "Unspecified",
      industry: "General",
      parties: [],
      requiredClauses: [],
      optionalClauses: [],
      language: "English",
      instructions: instructions || ""
    },
    retrieval: {
      matchedTemplate: null,
      applicablePlaybookRules: [],
      fallbackClauses: [],
      historicalReferences: []
    },
    context: null,
    draft: null,
    validation: null,
    riskReview: null,
    metadata: {
      generationParameters: {},
      playbookVersion: "1.0.0",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
  await updateJobProgress(jobId, userId, 50, "Invoking AI model core engine and validation checkpoints...");
  const orchestrator3 = new DraftWorkflowOrchestrator();
  const finalizedState = await orchestrator3.executeInitialWorkflow(initialStateContainer);
  if (!finalizedState.draft?.formattedDocument) {
    throw new Error("Pipeline Execution Failure: Final document text block emerged empty from workflow engine.");
  }
  const documentContentResult = finalizedState.draft.formattedDocument;
  const title = `${contractType || "AI"} Agreement - ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`;
  const { email: creatorEmail } = await withTransaction(userId, "USER", async (client) => {
    const { rows } = await client.query("SELECT email FROM users WHERE id = $1", [userId]);
    return { email: rows[0]?.email || "" };
  });
  const encryptedContent = encryptData(documentContentResult);
  await withTransaction(userId, "USER", async (client) => {
    await client.query(
      `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [targetDocId, title, "draft", encryptedContent, userId, creatorEmail, true, JSON.stringify([]), JSON.stringify([])]
    );
    const versionId = "ver_" + crypto5.randomUUID();
    await client.query(
      `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
      [versionId, targetDocId, encryptedContent]
    );
  });
  return { content: documentContentResult, file_id: targetDocId, version: 1 };
}
async function handleRefinementJob(jobId, userId, payload) {
  const {
    documentId,
    instructions,
    highlightedText,
    text,
    refineType,
    param,
    currentVersion
  } = payload;
  await updateJobProgress(jobId, userId, 15, "Reconstituting pipeline memory context logs...");
  if (!documentId) {
    throw new Error("Refinement requires a documentId to restore draft state memory.");
  }
  let functionalInstruction = instructions || "";
  if (!functionalInstruction && refineType) {
    if (refineType === "tone") functionalInstruction = `Rewrite the following legal text in a ${param} tone.`;
    else if (refineType === "grammar") functionalInstruction = "Fix the spelling and grammar in the following legal text while preserving legal meaning.";
    else if (refineType === "extend") functionalInstruction = "Expand the following legal clause with more comprehensive protections.";
    else if (refineType === "reduce") functionalInstruction = "Shorten the following legal clause to its core obligation.";
    else if (refineType === "simplify") functionalInstruction = "Rewrite the following legal text in plain English for a non-lawyer.";
    else if (refineType === "complete") functionalInstruction = "Complete the following sentence or clause in a professional legal manner.";
    else if (refineType === "ask") functionalInstruction = param;
  }
  if (!functionalInstruction) {
    throw new Error("Refinement requires instructions.");
  }
  const targetDocId = documentId;
  let historicalStateSnapshot = null;
  let resolvedVersion = currentVersion || 1;
  try {
    const snapshotLookup = await pool.query(
      `SELECT state_snapshot_json, version
             FROM draft_state_ledger
             WHERE document_id = $1
             ORDER BY version DESC
             LIMIT 1`,
      [targetDocId]
    );
    if (snapshotLookup.rows.length > 0) {
      historicalStateSnapshot = snapshotLookup.rows[0].state_snapshot_json;
      resolvedVersion = snapshotLookup.rows[0].version;
    }
  } catch (dbErr) {
    console.warn(`[DraftingHandler/Refine] Snapshot trace lookup bypassed for database row ${targetDocId}:`, dbErr);
  }
  let documentText = highlightedText || text || "";
  if (historicalStateSnapshot) {
    documentText = highlightedText || historicalStateSnapshot.draft?.formattedDocument || text || "";
  } else {
    try {
      const fileLookup = await withTransaction(userId, "USER", async (client) => {
        const { rows } = await client.query(
          "SELECT content, is_encrypted FROM files WHERE id = $1",
          [targetDocId]
        );
        return rows[0];
      });
      if (fileLookup?.content) {
        const fileContent = fileLookup.is_encrypted ? decryptData(fileLookup.content) : fileLookup.content;
        documentText = highlightedText || fileContent || text || "";
      }
    } catch (fileErr) {
      console.warn(`[DraftingHandler/Refine] File content lookup bypassed for ${targetDocId}:`, fileErr);
    }
  }
  if (!documentText) {
    throw new Error(`No draft content found for document ${targetDocId}.`);
  }
  const nextVersionNumber = resolvedVersion + 1;
  const previousRequest = historicalStateSnapshot?.request;
  const previousPayloadFields = previousRequest?.payloadFields ?? {};
  const inputStateContainer = historicalStateSnapshot ? {
    ...historicalStateSnapshot,
    request: {
      ...previousRequest ?? {},
      intent: "REFINEMENT",
      rawInstructions: functionalInstruction,
      highlightedText,
      payloadFields: {
        ...previousPayloadFields,
        documentId: targetDocId
      }
    },
    retrieval: historicalStateSnapshot.retrieval,
    draft: {
      rawOutput: historicalStateSnapshot.draft?.rawOutput ?? documentText,
      formattedDocument: documentText,
      version: nextVersionNumber,
      parentVersionId: historicalStateSnapshot.draft?.parentVersionId
    },
    validation: null,
    riskReview: null
  } : {
    request: {
      intent: "REFINEMENT",
      mode: "Standard Template",
      rawInstructions: functionalInstruction,
      highlightedText,
      sourceText: documentText,
      payloadFields: { documentId: targetDocId }
    },
    requirements: {
      contractType: "General",
      jurisdiction: "Unspecified",
      industry: "General",
      parties: [],
      requiredClauses: [],
      optionalClauses: [],
      language: "English",
      instructions: functionalInstruction
    },
    retrieval: {
      matchedTemplate: null,
      applicablePlaybookRules: [],
      fallbackClauses: [],
      historicalReferences: []
    },
    context: null,
    draft: {
      rawOutput: documentText,
      version: nextVersionNumber,
      formattedDocument: documentText
    },
    validation: null,
    riskReview: null,
    metadata: {
      generationParameters: {},
      playbookVersion: "1.0.0",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
  await updateJobProgress(jobId, userId, 45, "Executing adjustments and evaluating risk variables...");
  const orchestrator3 = new DraftWorkflowOrchestrator();
  const finalizedRefinedState = await orchestrator3.executeHumanRefinementPipeline(inputStateContainer);
  const refinedTextOutputResult = finalizedRefinedState.draft?.formattedDocument || documentText;
  const title = `Refined Text - ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`;
  const { email: creatorEmail } = await withTransaction(userId, "USER", async (client) => {
    const { rows } = await client.query("SELECT email FROM users WHERE id = $1", [userId]);
    return { email: rows[0]?.email || "" };
  });
  const encryptedContent = encryptData(refinedTextOutputResult);
  await withTransaction(userId, "USER", async (client) => {
    if (!documentId) {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [targetDocId, title, "draft", encryptedContent, userId, creatorEmail, true, JSON.stringify([]), JSON.stringify([])]
      );
    } else {
      await client.query(
        "UPDATE files SET content = $1, title = $2, updated_at = NOW() WHERE id = $3",
        [encryptedContent, title, targetDocId]
      );
    }
    const versionId = "ver_" + crypto5.randomUUID();
    await client.query(
      `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
      [versionId, targetDocId, encryptedContent]
    );
  });
  chunkAndIndexDocument(targetDocId, refinedTextOutputResult, userId).catch(
    (err) => console.warn(`[DraftingHandler/Refine] Vector matrix indexing failed for document ${targetDocId}:`, err)
  );
  return { data: refinedTextOutputResult, file_id: targetDocId, version: nextVersionNumber };
}
async function executeTemplateDrafting(jobId, userId, payload) {
  if (payload.intent === "REFINEMENT" || payload.type === "REFINEMENT" || payload.type === "refine") {
    return await handleRefinementJob(jobId, userId, payload);
  }
  return await handleInitialDraftingJob(jobId, userId, payload);
}

// src/services/jobs/handlers/playbook-handler.ts
init_database();

// src/modules/drafting/services/playbook-ingester.ts
init_database();

// src/modules/drafting/prompts/playbook-ingest-template.ts
var STAGE_1_STITCH_PROMPT = `
You are an elite legal playbook stitching assistant.
Read the entire multi-page legal playbook text block and reconstruct fragmented tables into a single consolidated Markdown document.
Rules may be split across pages, with IDs on one page, clause text on another, and remediation logic on a third.
Match each fragment to its correct Rule ID and preserve every clause, note, and remediation instruction without truncation.
Output only Markdown.
Group every rule entirely under its own heading in the form "## R-IP-001".
Do not summarize, omit, or shorten long contractual text.
Keep the output deterministic and structurally consistent.
`.trim();
var STAGE_2_EXTRACT_PROMPT = `
You are an elite legal parsing assistant.
Extract exactly one playbook rule from the provided Markdown block and return strict JSON that matches the supplied schema.
Do not add commentary, markdown, or extra keys.
Preserve the full text of each clause and remediation instruction.
If the block contains a rule heading, use it as the rule id.
`.trim();

// src/modules/drafting/services/playbook-ingester.ts
var SINGLE_RULE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "contractType",
    "topic",
    "riskLevel",
    "standardPosition",
    "fallbackPositions",
    "walkAwayCondition",
    "triggerPatterns",
    "remediationStrategy"
  ],
  properties: {
    id: { type: "string" },
    contractType: { type: "string" },
    topic: { type: "string" },
    riskLevel: { type: "string" },
    standardPosition: { type: "string" },
    fallbackPositions: { type: "array", items: { type: "string" } },
    walkAwayCondition: { type: "string" },
    triggerPatterns: { type: "array", items: { type: "string" } },
    remediationStrategy: { type: "string" }
  }
};
function cleanMarkdownArtifacts2(rawText) {
  let cleanedText = rawText.trim();
  if (cleanedText.startsWith("```markdown")) {
    cleanedText = cleanedText.replace(/^```markdown\s*/i, "");
  } else if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.replace(/^```\s*/, "");
  }
  if (cleanedText.endsWith("```")) {
    cleanedText = cleanedText.replace(/\s*```$/, "");
  }
  return cleanedText.trim();
}
function splitStitchedMarkdownIntoRuleBlocks(stitchedMarkdown) {
  return stitchedMarkdown.split(/##?\s*(?=R-[A-Z]+-\d+)/g).map((block) => block.trim()).filter((block) => block.length > 0).filter((block) => /R-[A-Z]+-\d+/.test(block));
}
var PlaybookIngester = class {
  constructor(provider = "GEMINI" /* GEMINI */) {
    this.deafultProvider = provider;
  }
  /**
   * Orchestrates the parsing and database persistence chain
   */
  async ingestPlaybookText(rawPdfText) {
    console.log("[PlaybookIngester] Initiating structured AI parsing extraction loop...");
    const stitchedMarkdown = cleanMarkdownArtifacts2(
      await executeCompletion(rawPdfText, STAGE_1_STITCH_PROMPT, "FAST_STITCH" /* FAST_STITCH */, this.deafultProvider)
    );
    const ruleBlocks = splitStitchedMarkdownIntoRuleBlocks(stitchedMarkdown);
    let successfullySavedCount = 0;
    for (const block of ruleBlocks) {
      try {
        const ruleMatch = block.match(/R-[A-Z]+-\d+/);
        const ruleId = ruleMatch?.[0] ?? "unknown";
        const parsedRule = await executeJsonCompletion(
          block,
          STAGE_2_EXTRACT_PROMPT,
          SINGLE_RULE_SCHEMA,
          "STRUCTURAL_JSON" /* STRUCTURAL_JSON */,
          this.deafultProvider
        );
        if (!parsedRule || typeof parsedRule.id !== "string" || typeof parsedRule.contractType !== "string" || typeof parsedRule.topic !== "string" || typeof parsedRule.riskLevel !== "string" || typeof parsedRule.standardPosition !== "string" || !Array.isArray(parsedRule.fallbackPositions) || typeof parsedRule.walkAwayCondition !== "string" || !Array.isArray(parsedRule.triggerPatterns) || typeof parsedRule.remediationStrategy !== "string") {
          throw new Error(`Invalid parsed rule payload for ${ruleId}.`);
        }
        console.log("This is the understanding of gemini form the playbook pdf\n\n\n\n\n", parsedRule, "\n\n\n");
        const sql = `
          INSERT INTO playbook_rules (
            id,
            contract_type,
            topic,
            risk_level,
            standard_position,
            fallback_positions,
            walk_away_condition,
            trigger_patterns,
            remediation_strategy
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            contract_type = EXCLUDED.contract_type,
            topic = EXCLUDED.topic,
            risk_level = EXCLUDED.risk_level,
            standard_position = EXCLUDED.standard_position,
            fallback_positions = EXCLUDED.fallback_positions,
            walk_away_condition = EXCLUDED.walk_away_condition,
            trigger_patterns = EXCLUDED.trigger_patterns,
            remediation_strategy = EXCLUDED.remediation_strategy;
        `;
        const params = [
          parsedRule.id,
          // $1 -> id (e.g., 'R-IP-001')
          parsedRule.contractType,
          // $2 -> contract_type
          parsedRule.topic,
          // $3 -> topic
          parsedRule.riskLevel,
          // $4 -> risk_level
          parsedRule.standardPosition,
          // $5 -> standard_position
          JSON.stringify(parsedRule.fallbackPositions),
          // $6 -> fallback_positions
          parsedRule.walkAwayCondition,
          // $7 -> walk_away_condition
          JSON.stringify(parsedRule.triggerPatterns),
          // $8 -> trigger_patterns
          parsedRule.remediationStrategy
          // $9 -> remediation_strategy
        ];
        await pool.query(sql, params);
        successfullySavedCount += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const ruleMatch = block.match(/R-[A-Z]+-\d+/);
        console.warn(
          `[PlaybookIngester] Skipping rule block ${ruleMatch?.[0] ?? "unknown"}: ${errorMessage}`
        );
      }
    }
    return { processedRulesCount: successfullySavedCount };
  }
};

// src/services/jobs/handlers/playbook-handler.ts
async function updateJobProgress2(jobId, percentage, message) {
  await pool.query(
    "UPDATE jobs SET progress = $1, message = $2, status = 'PROCESSING', updated_at = NOW() WHERE id = $3;",
    [percentage, message, jobId]
  );
}
async function executePlaybookIngestionJob(jobId, userId, payload) {
  const { fileUrl, contractType } = payload ?? {};
  try {
    if (!fileUrl) {
      throw new Error("Playbook ingestion requires a fileUrl payload value.");
    }
    await updateJobProgress2(jobId, 10, "Downloading file payload...");
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`File download failed with status ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const binaryBuffer = Buffer.from(arrayBuffer);
    const parser = new PDFParse({
      data: binaryBuffer
    });
    const parsedPdf = await parser.getText();
    const extractedTextString = parsedPdf.text ?? "";
    await parser.destroy();
    await updateJobProgress2(jobId, 30, "PDF text extraction pass completed successfully...");
    await updateJobProgress2(jobId, 50, "Passing text arrays to the AI Ingester engine...");
    const ingester = new PlaybookIngester();
    const ingestionResult = await ingester.ingestPlaybookText(extractedTextString);
    await pool.query(
      `UPDATE jobs
			 SET status = $1,
					 progress = $2,
					 message = $3,
					 result = $4,
					 updated_at = NOW()
			 WHERE id = $5;`,
      [
        "COMPLETED",
        100,
        "Successfully structured and stored playbook guidelines!",
        JSON.stringify({
          contractType,
          processedRulesCount: ingestionResult.processedRulesCount
        }),
        jobId
      ]
    );
    return ingestionResult;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE jobs
			 SET status = $1,
					 message = $2,
					 error = $3,
					 updated_at = NOW()
			 WHERE id = $4;`,
      [
        "FAILED",
        "Playbook ingestion failed while downloading, extracting, or structuring the PDF payload.",
        errorMessage,
        jobId
      ]
    );
    throw err;
  }
}

// src/services/jobQueue.ts
async function updateJobProgress(jobId, userId, progress, message) {
  await withTransaction(userId, "USER", async (client) => {
    await client.query(
      "UPDATE jobs SET progress = $1, message = $2 WHERE id = $3",
      [progress, message, jobId]
    );
  });
  jobRegistry2.broadcast(userId, { id: jobId, progress, message });
}
async function updateJobState(jobId, userId, updates) {
  const columnMap = {
    userId: "user_id",
    createdAt: "created_at",
    completedAt: "completed_at"
    // result, error, status, progress, message, type all match DB column names directly
  };
  const fields = Object.keys(updates).map((k, i) => `${columnMap[k] ?? k} = $${i + 1}`).join(", ");
  const values = Object.values(updates).map(
    (v) => v !== null && typeof v === "object" ? JSON.stringify(v) : v
  );
  await withTransaction(userId, "USER", async (client) => {
    await client.query(
      `UPDATE jobs SET ${fields} WHERE id = $${values.length + 1}`,
      [...values, jobId]
    );
  });
}
async function addJobToQueue(userId, type, payload) {
  const jobId = crypto6.randomUUID();
  await withTransaction(userId, "USER", async (client) => {
    await client.query(
      `INSERT INTO jobs (id, user_id, type, status, progress, payload)
       VALUES ($1, $2, $3, 'queued', 0, $4)`,
      [jobId, userId, type, JSON.stringify(payload)]
    );
  });
  (async () => {
    try {
      await updateJobState(jobId, userId, { status: "processing", progress: 5 });
      jobRegistry2.broadcast(userId, { id: jobId, status: "processing", progress: 5 });
      let result;
      switch (type) {
        case "file_processing":
          result = await executeFileProcessing(jobId, userId, payload);
          break;
        case "document_analysis":
          result = await executeDocumentAnalysis(jobId, userId, payload);
          break;
        case "privacy_scanning":
          result = await executePrivacyScanning(jobId, userId, payload);
          break;
        case "vulnerability_scanning":
          result = await executeVulnerabilityScanning(jobId, userId, payload);
          break;
        case "template_drafting":
          result = await executeTemplateDrafting(jobId, userId, payload);
          break;
        case "dpa_review":
          result = await executeDPAReview(jobId, userId, payload);
          break;
        case "vendor_review":
          result = await executeVendorReview(jobId, userId, payload);
          break;
        case "ai_ethics_review":
          result = await executeAIEthicsReview(jobId, userId, payload);
          break;
        case "PLAYBOOK_INGEST":
          result = await executePlaybookIngestionJob(jobId, userId, payload);
          break;
        default:
          throw new Error(`Unhandled job type: ${type}`);
      }
      await updateJobState(jobId, userId, {
        status: "completed",
        progress: 100,
        result: JSON.stringify(result)
      });
      jobRegistry2.broadcast(userId, {
        id: jobId,
        userId,
        status: "completed",
        progress: 100,
        result
      });
    } catch (err) {
      console.error(`[JobRunner] Job ${jobId} failed:`, err);
      jobRegistry2.broadcast(userId, {
        id: jobId,
        userId,
        status: "failed",
        error: err.message
      });
      await updateJobState(jobId, userId, {
        status: "failed",
        error: err.message
      }).catch((dbErr) => console.error(`[JobRunner] Failed to persist error state for job ${jobId}:`, dbErr));
    }
  })();
  return { id: jobId };
}
var BackgroundJobRegistry = class {
  constructor() {
    this.clients = /* @__PURE__ */ new Set();
    this.orchestrator = new AgentOrchestrator();
    this.scanner = new ScannerService();
  }
  broadcast(userId, job) {
    const payloadStr = JSON.stringify({ event: "job_update", job });
    for (const client of this.clients) {
      if (client.userId === userId) {
        client.send(`data: ${payloadStr}

`);
      }
    }
  }
  addClient(userId, res) {
    const id = "client_" + crypto6.randomUUID();
    res.write(`data: ${JSON.stringify({ event: "ping", timestamp: (/* @__PURE__ */ new Date()).toISOString() })}

`);
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`:ping

`);
      } catch (err) {
        clearInterval(heartbeatInterval);
      }
    }, 15e3);
    const client = {
      id,
      userId,
      send: (data) => {
        try {
          res.write(data);
        } catch (err) {
          console.warn("[JobRegistry SSE] Failed to push data for client:", id);
        }
      }
    };
    this.clients.add(client);
    return id;
  }
  removeClient(id) {
    for (const client of this.clients) {
      if (client.id === id) {
        this.clients.delete(client);
        break;
      }
    }
  }
  async getJob(id) {
    const { rows } = await pool.query("SELECT * FROM jobs WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    return this.mapDbJobToJob(rows[0]);
  }
  async getUserJobs(userId) {
    const { rows } = await pool.query(
      "SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return rows.map((r) => this.mapDbJobToJob(r));
  }
  mapDbJobToJob(row) {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      status: row.status,
      progress: row.progress,
      message: row.message,
      payload: row.payload,
      result: row.result,
      error: row.error,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at ? row.completed_at.toISOString() : void 0
    };
  }
};
var jobRegistry2 = new BackgroundJobRegistry();
async function executeFileProcessing(jobId, userId, payload) {
  const { fileId, fileBufferBase64, mimeType } = payload;
  await updateJobProgress(jobId, userId, 15, "Extracting text from document...");
  const buffer = Buffer.from(fileBufferBase64, "base64");
  let content = "";
  if (mimeType === "application/pdf") {
    const data = await pdf2(buffer);
    content = data.text;
  } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const data = await mammoth.extractRawText({ buffer });
    content = data.value;
  } else if (mimeType.startsWith("text/")) {
    content = buffer.toString("utf-8");
  } else {
    content = buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
  }
  content = content.replace(/\0/g, "");
  const encryptedContent = encryptData(content);
  await updateJobProgress(jobId, userId, 50, "Updating database and indexing for search...");
  const rowCount = await withTransaction(userId, "USER", async (client) => {
    const result = await client.query(
      `UPDATE files SET content = $1, is_encrypted = $2 WHERE id = $3`,
      [encryptedContent, true, fileId]
    );
    const versionId = "ver_" + crypto6.randomUUID();
    await client.query(
      `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
      [versionId, fileId, encryptedContent]
    );
    return result.rowCount;
  });
  if (rowCount === 0) throw new Error(`File record ${fileId} not found.`);
  await chunkAndIndexDocument(fileId, content, userId);
  return { fileId, content };
}
async function executeDocumentAnalysis(jobId, userId, payload) {
  const userRole = await withTransaction(userId, "USER", async (client) => {
    const { rows } = await client.query("SELECT role FROM users WHERE id = $1", [userId]);
    return rows[0]?.role || "USER";
  });
  if (payload.type === "legal_ask") {
    const { prompt, documents, jurisdiction, outputFormat } = payload;
    await updateJobProgress(jobId, userId, 30, "Searching knowledge base and synthesizing advice...");
    console.log(`[JobRunner/legal_ask] Calling askLawyer via OpenRouter`);
    console.log(`  prompt: "${String(prompt).substring(0, 80)}..."`);
    console.log(`  jurisdictions: ${JSON.stringify(jurisdiction || [])}`);
    console.log(`  outputFormat: ${outputFormat || "Full IRAC"}`);
    const result2 = await jobRegistry2.orchestrator.askLawyer(
      prompt,
      userId,
      documents,
      jurisdiction,
      outputFormat
    );
    return {
      text: result2.text || result2,
      sources: result2.sources || []
    };
  }
  if (payload.prompt && (payload.folderIds || payload.fileIds || payload.draftIds)) {
    const { folderIds: folderIds2, fileIds, draftIds, prompt, documentMode, answerStyle, history } = payload;
    await updateJobProgress(jobId, userId, 30, "Analyzing documents in selected folders...");
    const result2 = await jobRegistry2.orchestrator.interactAnalyze(
      Array.isArray(folderIds2) ? folderIds2 : [],
      prompt,
      userId,
      documentMode,
      answerStyle,
      history,
      void 0,
      userRole,
      Array.isArray(draftIds) ? draftIds : [],
      Array.isArray(fileIds) ? fileIds : []
    );
    return { analysis: result2, clauses: [] };
  }
  const { documentId, content, folderIds } = payload;
  await updateJobProgress(jobId, userId, 30, "AI agents performing legal audit...");
  const result = await jobRegistry2.orchestrator.runAnalysis(
    documentId,
    content,
    userId,
    Array.isArray(folderIds) ? folderIds : void 0,
    userRole
  );
  return result;
}
async function executePrivacyScanning(jobId, userId, payload) {
  await updateJobProgress(jobId, userId, 20, "Scanning website for privacy compliance...");
  const result = await jobRegistry2.scanner.scanCookie(payload.url, userId, payload.scanDepth);
  return result;
}
async function executeVulnerabilityScanning(jobId, userId, payload) {
  await updateJobProgress(jobId, userId, 20, "Performing vulnerability assessment...");
  const result = await jobRegistry2.scanner.scanVulnerability(payload.url, userId);
  return result;
}
async function executeDPAReview(jobId, userId, payload) {
  const {
    documentText,
    fileId
  } = payload;
  await updateJobProgress(jobId, userId, 8, "Reading document structure...");
  await updateJobProgress(jobId, userId, 16, "Extracting text and identifying parties...");
  await updateJobProgress(jobId, userId, 24, "Checking GDPR Article 28 compliance...");
  await updateJobProgress(jobId, userId, 32, "Reviewing processor obligations...");
  await updateJobProgress(jobId, userId, 42, "Reviewing security controls and TOMs...");
  await updateJobProgress(jobId, userId, 52, "Checking international transfer clauses...");
  await updateJobProgress(jobId, userId, 62, "Checking sub-processor controls...");
  await updateJobProgress(jobId, userId, 72, "Finding compliance gaps...");
  await updateJobProgress(jobId, userId, 82, "Calculating compliance score...");
  const result = await jobRegistry2.orchestrator.runDPAReview(documentText, userId, fileId);
  await updateJobProgress(jobId, userId, 92, "Generating recommendations...");
  await updateJobProgress(jobId, userId, 97, "Preparing compliance report...");
  return result;
}
async function executeVendorReview(jobId, userId, payload) {
  const {
    documentText = "",
    vendorUrl,
    fileNames = [],
    fileIds = []
  } = payload;
  await updateJobProgress(jobId, userId, 5, "Receiving request...");
  if (documentText.length > 0) {
    await updateJobProgress(jobId, userId, 10, "Extracting uploaded documents...");
    console.log(
      `[executeVendorReview] Merged document text: ${documentText.length} chars from [${fileNames.join(", ")}]`
    );
  }
  let websiteScan = null;
  let websiteScanAttempted = false;
  let websiteScanFailed = false;
  if (vendorUrl) {
    websiteScanAttempted = true;
    await updateJobProgress(jobId, userId, 18, "Scanning vendor website...");
    console.log(`[executeVendorReview] Starting website scan for: ${vendorUrl}`);
    const websiteScanner = new WebsiteScannerService();
    try {
      await updateJobProgress(jobId, userId, 24, "Discovering compliance pages...");
      websiteScan = await websiteScanner.scan(vendorUrl, { crawlLimit: 20 });
      const reachableCount = [
        websiteScan.privacyPolicy,
        websiteScan.cookiePolicy,
        websiteScan.securityPage,
        websiteScan.trustCenter,
        websiteScan.terms,
        websiteScan.legal,
        websiteScan.dpa,
        websiteScan.aiPolicy,
        websiteScan.responsibleAI
      ].filter((p) => p?.reachable).length;
      console.log(
        `[executeVendorReview] Website scan complete \u2014 discoveredPages: ${websiteScan.discoveredPages.length}, compliancePages: ${reachableCount}`
      );
      await updateJobProgress(jobId, userId, 34, "Extracting website intelligence...");
    } catch (scanErr) {
      websiteScanFailed = true;
      console.warn(
        `[executeVendorReview] Website scan failed for ${vendorUrl}: ${scanErr.message}. Continuing with document-only analysis.`
      );
    }
  }
  if (websiteScanAttempted && websiteScanFailed && websiteScan === null && documentText.length <= 100) {
    throw new Error(
      "We couldn't retrieve enough content from this website to perform an analysis. Please try again later or upload supporting documents."
    );
  }
  await updateJobProgress(jobId, userId, 42, "Searching knowledge base...");
  await updateJobProgress(jobId, userId, 50, "Reviewing privacy posture...");
  await updateJobProgress(jobId, userId, 58, "Reviewing security posture...");
  await updateJobProgress(jobId, userId, 65, "Reviewing compliance status...");
  await updateJobProgress(jobId, userId, 72, "Evaluating contractual risks...");
  await updateJobProgress(jobId, userId, 80, "Calculating vendor score...");
  const result = await jobRegistry2.orchestrator.runVendorReview({
    documentText,
    websiteScan,
    userId,
    fileIds: fileIds.length > 0 ? fileIds : void 0
  });
  await updateJobProgress(jobId, userId, 90, "Generating recommendations...");
  await updateJobProgress(jobId, userId, 97, "Preparing report...");
  console.log(
    `[executeVendorReview] Complete \u2014 overallScore: ${result.overallScore}, overallRisk: ${result.overallRisk}, findings: ${result.findings.length}`
  );
  return result;
}
async function executeAIEthicsReview(jobId, userId, payload) {
  const {
    documentText = "",
    websiteUrl,
    fileNames = [],
    fileIds = []
  } = payload;
  console.log(
    `[executeAIEthicsReview] Received payload \u2014 fileIds=${JSON.stringify(fileIds)}, documentTextLen=${documentText.length}, websiteUrl=${websiteUrl ?? "none"}`
  );
  await updateJobProgress(jobId, userId, 5, "Receiving request...");
  if (documentText.length > 0) {
    await updateJobProgress(jobId, userId, 10, "Extracting uploaded documents...");
    console.log(
      `[executeAIEthicsReview] Merged document text: ${documentText.length} chars from [${fileNames.join(", ")}]`
    );
  }
  let websiteScan = null;
  let websiteScanAttempted = false;
  let websiteScanFailed = false;
  if (websiteUrl) {
    websiteScanAttempted = true;
    await updateJobProgress(jobId, userId, 18, "Scanning website...");
    console.log(`[executeAIEthicsReview] Starting website scan for: ${websiteUrl}`);
    const websiteScanner = new WebsiteScannerService();
    try {
      await updateJobProgress(jobId, userId, 24, "Discovering AI governance pages...");
      websiteScan = await websiteScanner.scan(websiteUrl, { crawlLimit: 30 });
      const aiGovernancePages = [
        websiteScan.aiPolicy,
        websiteScan.responsibleAI,
        websiteScan.safetyPage,
        websiteScan.policiesPage,
        websiteScan.modelSpec,
        websiteScan.transparencyPage,
        websiteScan.charterPage
      ].filter((p) => p?.reachable).length;
      const allCompliancePages = [
        websiteScan.privacyPolicy,
        websiteScan.cookiePolicy,
        websiteScan.securityPage,
        websiteScan.trustCenter,
        websiteScan.terms,
        websiteScan.legal,
        websiteScan.dpa,
        websiteScan.aiPolicy,
        websiteScan.responsibleAI,
        websiteScan.safetyPage,
        websiteScan.policiesPage,
        websiteScan.modelSpec,
        websiteScan.transparencyPage,
        websiteScan.charterPage
      ].filter((p) => p?.reachable).length;
      console.log(
        `[executeAIEthicsReview] Website scan complete \u2014 discoveredPages: ${websiteScan.discoveredPages.length}, aiGovernancePages: ${aiGovernancePages}, allCompliancePages: ${allCompliancePages}`
      );
      await updateJobProgress(jobId, userId, 34, "Extracting website intelligence...");
      const AI_ETHICS_PAGES_TO_EXTRACT = [
        websiteScan.safetyPage,
        websiteScan.responsibleAI,
        websiteScan.aiPolicy,
        websiteScan.policiesPage,
        websiteScan.modelSpec,
        websiteScan.transparencyPage,
        websiteScan.charterPage,
        websiteScan.trustCenter,
        websiteScan.securityPage,
        websiteScan.privacyPolicy
      ].filter((p) => p?.reachable === true);
      const pagesToFetch = AI_ETHICS_PAGES_TO_EXTRACT.slice(0, 6);
      if (pagesToFetch.length > 0) {
        console.log(
          `[executeAIEthicsReview] Extracting content from ${pagesToFetch.length} AI governance page(s): ` + pagesToFetch.map((p) => p.url).join(", ")
        );
        const { extractPageContent: extractPageContent2 } = await Promise.resolve().then(() => (init_contentExtractor(), contentExtractor_exports));
        const extractedContents = [];
        for (const page of pagesToFetch) {
          try {
            const extracted = await extractPageContent2(page.url);
            if (extracted.ok && extracted.text.length > 100) {
              const snippet = extracted.text.substring(0, 3e3);
              extractedContents.push({
                url: page.url,
                title: extracted.title || page.url,
                textSnippet: snippet,
                fullTextLength: extracted.text.length
              });
              console.log(
                `[executeAIEthicsReview] Extracted ${extracted.text.length} chars from: ${page.url}`
              );
            } else {
              console.warn(
                `[executeAIEthicsReview] Page extraction insufficient for ${page.url} (ok=${extracted.ok}, len=${extracted.text.length})`
              );
            }
          } catch (extractErr) {
            console.warn(
              `[executeAIEthicsReview] Content extraction failed for ${page.url}: ${extractErr.message}`
            );
          }
        }
        if (extractedContents.length > 0) {
          websiteScan.extractedPageContents = extractedContents;
          console.log(
            `[executeAIEthicsReview] Page content extraction complete \u2014 ${extractedContents.length} pages with content, total chars: ${extractedContents.reduce((s, p) => s + p.fullTextLength, 0)}`
          );
        }
      }
    } catch (scanErr) {
      websiteScanFailed = true;
      console.warn(
        `[executeAIEthicsReview] Website scan failed for ${websiteUrl}: ${scanErr.message}. Continuing with document-only analysis.`
      );
    }
  }
  if (websiteScanAttempted && websiteScanFailed && websiteScan === null && documentText.length <= 100) {
    throw new Error(
      "We couldn't retrieve enough content from this website to perform an analysis. Please try again later or upload supporting documents."
    );
  }
  await updateJobProgress(jobId, userId, 40, "Searching knowledge base...");
  await updateJobProgress(jobId, userId, 46, "Reviewing AI governance...");
  await updateJobProgress(jobId, userId, 52, "Reviewing transparency...");
  await updateJobProgress(jobId, userId, 58, "Reviewing fairness...");
  await updateJobProgress(jobId, userId, 64, "Reviewing accountability...");
  await updateJobProgress(jobId, userId, 68, "Reviewing privacy...");
  await updateJobProgress(jobId, userId, 72, "Reviewing human oversight...");
  await updateJobProgress(jobId, userId, 76, "Reviewing explainability...");
  const result = await jobRegistry2.orchestrator.runAIEthicsReview({
    documentText,
    websiteScan,
    userId,
    fileIds: fileIds.length > 0 ? fileIds : void 0
  });
  await updateJobProgress(jobId, userId, 85, "Calculating AI ethics score...");
  await updateJobProgress(jobId, userId, 92, "Generating recommendations...");
  await updateJobProgress(jobId, userId, 97, "Preparing report...");
  console.log(
    `[executeAIEthicsReview] Complete \u2014 overallScore: ${result.overallScore}, overallRisk: ${result.overallRisk}, findings: ${result.findings.length}`
  );
  return result;
}

// src/services/exportService.ts
init_browserManager();
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TableRow,
  TableCell,
  Table,
  WidthType,
  BorderStyle
} from "docx";
import MarkdownIt from "markdown-it";
var md = new MarkdownIt({ html: false, linkify: true, typographer: true });
function isHtmlContent(content) {
  return /<[a-z][\s\S]*>/i.test(content.trim());
}
function contentToHtml(content) {
  return isHtmlContent(content) ? content : md.render(content);
}
function contentToTokens(content) {
  if (isHtmlContent(content)) {
    const asMarkdown = content.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, inner) => `# ${stripTags2(inner)}

`).replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, inner) => `## ${stripTags2(inner)}

`).replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, inner) => `### ${stripTags2(inner)}

`).replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_m, inner) => `#### ${stripTags2(inner)}

`).replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_m, inner) => `##### ${stripTags2(inner)}

`).replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_m, inner) => `###### ${stripTags2(inner)}

`).replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_m, inner) => `**${inner}**`).replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_m, inner) => `_${inner}_`).replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, (_m, inner) => inner).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<p[^>]*>/gi, "").replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => `- ${stripTags2(inner)}
`).replace(/<\/?[uo]l[^>]*>/gi, "\n").replace(/<hr\s*\/?>/gi, "\n---\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return md.parse(asMarkdown, {});
  }
  return md.parse(content, {});
}
function stripTags2(html) {
  return html.replace(/<[^>]+>/g, "").trim();
}
var buildPdfBuffer = async (title, contentType, content) => {
  const page = await browserManager.newPage();
  const context = page.context();
  try {
    const renderedContent = contentToHtml(content);
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #111827; line-height: 1.6; }
    h1 { font-size: 24px; color: #000; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-transform: uppercase; }
    h2 { font-size: 18px; margin-top: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
    h3 { font-size: 16px; margin-top: 20px; font-weight: bold; }
    p  { margin-bottom: 15px; text-align: justify; }
    ul, ol { margin-bottom: 15px; padding-left: 20px; }
    li { margin-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 12px; }
    th { background-color: #f9fafb; font-weight: bold; }
    .header { color: #6b7280; font-size: 12px; margin-bottom: 40px; }
    .footer { margin-top: 50px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    .content-area { font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    Lexify Digital Asset Vault \u2022 ${contentType.toUpperCase().replace("_", " ")}
    <br>Generated on ${(/* @__PURE__ */ new Date()).toLocaleString()}
  </div>
  <h1>${title}</h1>
  <div class="content-area">${renderedContent}</div>
  <div class="footer">Confidential Document \u2022 Powered by Lexify Multi-Agent Legal Engine</div>
</body>
</html>`;
    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
      printBackground: true
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
    await context.close();
  }
};
function inlineTokensToRuns(tokens) {
  const runs = [];
  let bold = false;
  let italic = false;
  let underline = false;
  for (const token of tokens) {
    if (token.type === "strong_open") {
      bold = true;
      continue;
    }
    if (token.type === "strong_close") {
      bold = false;
      continue;
    }
    if (token.type === "em_open") {
      italic = true;
      continue;
    }
    if (token.type === "em_close") {
      italic = false;
      continue;
    }
    if (token.type === "s_open") {
      underline = true;
      continue;
    }
    if (token.type === "s_close") {
      underline = false;
      continue;
    }
    if (token.type === "softbreak" || token.type === "hardbreak") {
      runs.push(new TextRun({ text: " " }));
      continue;
    }
    if (token.type === "text" || token.type === "code_inline") {
      const text = token.content ?? "";
      if (text) {
        runs.push(
          new TextRun({
            text,
            bold: bold || void 0,
            italics: italic || void 0,
            underline: underline ? { type: "single" } : void 0
          })
        );
      }
      continue;
    }
    if (token.type === "link_open") continue;
    if (token.type === "link_close") continue;
    if (token.content) {
      runs.push(new TextRun({ text: token.content, bold: bold || void 0, italics: italic || void 0 }));
    }
  }
  if (runs.length === 0) runs.push(new TextRun({ text: "" }));
  return runs;
}
function tokensToDocxChildren(tokens) {
  const children = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.type === "heading_open") {
      const level = parseInt(token.tag.replace("h", ""), 10);
      const inlineToken = tokens[i + 1];
      const headingMap = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6
      };
      const runs = inlineToken?.children ? inlineTokensToRuns(inlineToken.children) : [new TextRun({ text: inlineToken?.content ?? "" })];
      children.push(
        new Paragraph({
          heading: headingMap[level] ?? HeadingLevel.HEADING_1,
          children: runs,
          spacing: { before: 240, after: 120 }
        })
      );
      i += 3;
      continue;
    }
    if (token.type === "paragraph_open") {
      const inlineToken = tokens[i + 1];
      const runs = inlineToken?.children ? inlineTokensToRuns(inlineToken.children) : [new TextRun({ text: inlineToken?.content ?? "" })];
      children.push(
        new Paragraph({
          children: runs,
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 80, after: 120 }
        })
      );
      i += 3;
      continue;
    }
    if (token.type === "bullet_list_open") {
      i++;
      while (i < tokens.length && tokens[i].type !== "bullet_list_close") {
        if (tokens[i].type === "list_item_open") {
          i++;
          while (i < tokens.length && tokens[i].type !== "list_item_close") {
            if (tokens[i].type === "paragraph_open" || tokens[i].type === "inline") {
              const inlineTok = tokens[i].type === "inline" ? tokens[i] : tokens[i + 1];
              const runs = inlineTok?.children ? inlineTokensToRuns(inlineTok.children) : [new TextRun({ text: inlineTok?.content ?? "" })];
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: "\u2022 " }), ...runs],
                  indent: { left: 360 },
                  spacing: { before: 40, after: 40 }
                })
              );
              if (tokens[i].type === "paragraph_open") i += 3;
              else i++;
              continue;
            }
            i++;
          }
        }
        i++;
      }
      i++;
      continue;
    }
    if (token.type === "ordered_list_open") {
      let listCounter = parseInt(token.attrGet("start") ?? "1", 10);
      i++;
      while (i < tokens.length && tokens[i].type !== "ordered_list_close") {
        if (tokens[i].type === "list_item_open") {
          const num = listCounter++;
          i++;
          while (i < tokens.length && tokens[i].type !== "list_item_close") {
            if (tokens[i].type === "paragraph_open" || tokens[i].type === "inline") {
              const inlineTok = tokens[i].type === "inline" ? tokens[i] : tokens[i + 1];
              const runs = inlineTok?.children ? inlineTokensToRuns(inlineTok.children) : [new TextRun({ text: inlineTok?.content ?? "" })];
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: `${num}. ` }), ...runs],
                  indent: { left: 360 },
                  spacing: { before: 40, after: 40 }
                })
              );
              if (tokens[i].type === "paragraph_open") i += 3;
              else i++;
              continue;
            }
            i++;
          }
        }
        i++;
      }
      i++;
      continue;
    }
    if (token.type === "code_block" || token.type === "fence") {
      const lines = (token.content ?? "").split("\n");
      for (const line of lines) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, font: "Courier New", size: 18 })],
            spacing: { before: 40, after: 40 },
            indent: { left: 360 }
          })
        );
      }
      i++;
      continue;
    }
    if (token.type === "hr") {
      children.push(new Paragraph({ text: "", spacing: { before: 120, after: 120 } }));
      i++;
      continue;
    }
    if (token.type === "table_open") {
      const rows = [];
      i++;
      while (i < tokens.length && tokens[i].type !== "table_close") {
        if (tokens[i].type === "tr_open") {
          const cells = [];
          i++;
          while (i < tokens.length && tokens[i].type !== "tr_close") {
            if (tokens[i].type === "th_open" || tokens[i].type === "td_open") {
              const isHeader = tokens[i].type === "th_open";
              i++;
              const inlineTok = tokens[i];
              const runs = inlineTok?.children ? inlineTokensToRuns(inlineTok.children) : [new TextRun({ text: inlineTok?.content ?? "" })];
              if (isHeader) runs.forEach((r) => {
                r._data.bold = true;
              });
              cells.push(
                new TableCell({
                  children: [new Paragraph({ children: runs })],
                  width: { size: 20, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1 },
                    bottom: { style: BorderStyle.SINGLE, size: 1 },
                    left: { style: BorderStyle.SINGLE, size: 1 },
                    right: { style: BorderStyle.SINGLE, size: 1 }
                  }
                })
              );
              i += 2;
              continue;
            }
            i++;
          }
          if (cells.length > 0) rows.push(new TableRow({ children: cells }));
        }
        i++;
      }
      if (rows.length > 0) {
        children.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
      }
      i++;
      continue;
    }
    if (token.type === "blockquote_open") {
      i++;
      while (i < tokens.length && tokens[i].type !== "blockquote_close") {
        if (tokens[i].type === "inline") {
          const runs = inlineTokensToRuns(tokens[i].children ?? []);
          children.push(
            new Paragraph({
              children: runs,
              indent: { left: 720 },
              spacing: { before: 80, after: 80 }
            })
          );
        }
        i++;
      }
      i++;
      continue;
    }
    i++;
  }
  return children;
}
var buildDocxBuffer = async (title, _contentType, content) => {
  const tokens = contentToTokens(content);
  const bodyChildren = tokensToDocxChildren(tokens);
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 24 },
          paragraph: { spacing: { line: 276 } }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }
            // ~2cm
          }
        },
        children: [
          // Document title
          new Paragraph({
            text: title,
            heading: HeadingLevel.TITLE,
            spacing: { before: 0, after: 480 }
          }),
          // Separator
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated by Lexify \u2022 ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`,
                size: 18,
                color: "888888"
              })
            ],
            spacing: { before: 0, after: 480 }
          }),
          // Body
          ...bodyChildren,
          // Footer paragraph
          new Paragraph({
            children: [
              new TextRun({
                text: "Confidential Document \u2022 Powered by Lexify Multi-Agent Legal Engine",
                size: 16,
                color: "9CA3AF"
              })
            ],
            spacing: { before: 480, after: 0 }
          })
        ]
      }
    ]
  });
  return await Packer.toBuffer(doc);
};

// src/controllers/documents.ts
init_crypto();
import crypto7 from "crypto";
import { fileTypeFromBuffer } from "file-type";
var getDocuments = async (req, res) => {
  const userEmail = req.user.email.toLowerCase();
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const docs = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM files WHERE creator_id = current_setting('app.current_user_id', true) OR shared_with::jsonb @> $1::jsonb OR shared_with::jsonb @> $2::jsonb ORDER BY created_at DESC",
        [JSON.stringify([userEmail]), JSON.stringify([{ email: userEmail }])]
      );
      return rows;
    }).catch((e) => {
      console.error("Failed to fetch documents from DB:", e);
      throw new Error("DB_FETCH_FAILED");
    });
    const formattedDocs = docs.map((r) => ({
      ...r,
      content: r.is_encrypted ? decrypt(r.content) : r.content,
      isEncrypted: r.is_encrypted,
      signatures: r.signatures || [],
      redlines: r.redlines || [],
      sharedWith: r.shared_with || [],
      auditLogs: r.audit_logs || []
    }));
    return res.json(formattedDocs);
  } catch (err) {
    const message = err.message === "DB_FETCH_FAILED" ? "Security enclave database unreachable." : "Internal error fetching document repository.";
    res.status(500).json({ error: message });
  }
};
var getDocumentById = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const doc = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT * FROM files WHERE id = $1", [req.params.id]);
      if (rows.length === 0) return null;
      const { rows: versionRows } = await client.query(
        "SELECT * FROM document_versions WHERE file_id = $1 ORDER BY created_at DESC",
        [req.params.id]
      );
      const r = rows[0];
      return {
        ...r,
        content: r.is_encrypted ? decrypt(r.content) : r.content,
        versions: versionRows.map((v) => ({
          id: v.id,
          content: decrypt(v.content),
          createdAt: v.created_at
        })),
        signatures: r.signatures || [],
        redlines: r.redlines || [],
        sharedWith: r.shared_with || [],
        auditLogs: r.audit_logs || []
      };
    });
    if (doc) {
      return res.json(doc);
    }
    res.status(404).json({ error: "Document not found." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var createDocument = async (req, res) => {
  const { title, type, content } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  const email = req.user.email;
  const id = "doc_" + crypto7.randomUUID();
  const encryptedContent = encrypt(content || "");
  try {
    await withTransaction(userId, userRole, async (client) => {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, title, type, encryptedContent, userId, email, true, JSON.stringify([]), JSON.stringify([])]
      );
      const versionId = "ver_" + crypto7.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, id, encryptedContent]
      );
    });
    if (content && content.trim().length > 0) {
      chunkAndIndexDocument(id, content, userId).catch(
        (err) => console.warn(`[createDocument] Chunk indexing failed for ${id}:`, err)
      );
    }
    res.status(201).json({ id, title, type });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var uploadDocument = async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded. Verify multipart/form-data boundary." });
  const allowedMimeTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "application/msword",
    "application/octet-stream",
    "text/csv",
    "application/json"
  ];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return res.status(400).json({ error: "Unsupported file type. Only PDF, DOCX, TXT, CSV, JSON, and Markdown are permitted for legal indexing." });
  }
  if (file.size > 25 * 1024 * 1024) {
    return res.status(400).json({ error: "File size exceeds 25MB security threshold." });
  }
  const type = await fileTypeFromBuffer(file.buffer);
  const detectedMime = type?.mime || file.mimetype;
  const strictAllowedMimeTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "application/msword",
    "text/csv",
    "application/json"
  ];
  if (!strictAllowedMimeTypes.includes(detectedMime)) {
    return res.status(400).json({ error: "File signature mismatch. Extension does not match content magic bytes." });
  }
  const { title, folder_id, contractType } = req.body;
  const systemFileType = req.body.category?.trim().toLowerCase() || "upload";
  if (systemFileType === "playbook" && (!contractType || !contractType.trim())) {
    return res.status(400).json({ error: "Playbook ingestion requires an explicit 'contractType' parameter." });
  }
  const fileId = "doc_" + crypto7.randomUUID();
  const fileTitle = title || file.originalname;
  const userId = req.user.id;
  const userRole = req.user.role;
  let resolvedFolderId;
  try {
    resolvedFolderId = folder_id && folder_id.trim() ? folder_id.trim() : await getOrCreateDefaultFolder(userId, userRole);
  } catch (folderErr) {
    console.error("[uploadDocument] Failed to resolve default folder:", folderErr);
    return res.status(500).json({ error: "Failed to resolve upload destination folder." });
  }
  try {
    await withTransaction(userId, userRole, async (client) => {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, mime_type, folder_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [fileId, fileTitle, "upload", "", req.user.id, req.user.email, file.mimetype, resolvedFolderId]
      );
    }).catch((e) => {
      console.error("Database insert failed during upload:", e);
      throw new Error("DB_UPLOAD_FAILED");
    });
    let job;
    if (systemFileType === "playbook" || contractType) {
      const fileDataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      job = await addJobToQueue(req.user.id, "PLAYBOOK_INGEST", {
        fileId,
        contractType: contractType.trim(),
        fileTitle,
        fileUrl: fileDataUrl,
        fileBufferBase64: file.buffer.toString("base64"),
        mimeType: file.mimetype
      });
    }
    job = await addJobToQueue(req.user.id, "file_processing", {
      fileId,
      fileTitle,
      fileBufferBase64: file.buffer.toString("base64"),
      mimeType: file.mimetype,
      folder_id: resolvedFolderId,
      creatorEmail: req.user.email
    });
    res.status(202).json({ success: true, job_id: job.id, file_id: fileId });
  } catch (err) {
    console.error("Document upload route crash:", err);
    const message = err.message === "DB_UPLOAD_FAILED" ? "Failed to register upload in security log." : "Internal error during background job queueing.";
    res.status(500).json({ error: message });
  }
};
var updateDocument = async (req, res) => {
  const { id } = req.params;
  const { title, content, folder_id } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT * FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      const doc = rows[0];
      const encryptedContent = content ? encrypt(content) : doc.content;
      await client.query(
        `UPDATE files SET title = COALESCE($1, title), content = $2, folder_id = COALESCE($3, folder_id), updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [title || null, encryptedContent, folder_id || null, id]
      );
      const versionId = "ver_" + crypto7.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, id, encryptedContent]
      );
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "document_update", JSON.stringify({ documentId: id, title })]);
    });
    if (content && content.trim().length > 0) {
      pool.query(
        "DELETE FROM legal_document_chunks WHERE file_id = $1 AND user_id = $2",
        [id, userId]
      ).then(() => chunkAndIndexDocument(id, content, userId)).catch((err) => console.warn(`[updateDocument] Re-indexing failed for ${id}:`, err));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
var deleteDocument = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rowCount } = await client.query("DELETE FROM files WHERE id = $1", [id]);
      if (rowCount === 0) throw new Error("Document not found");
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "document_delete", JSON.stringify({ documentId: id })]);
    });
    res.json({ success: true });
  } catch (err) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
var shareDocument = async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const sharedWith = await withTransaction(userId, userRole, async (client) => {
      const { rows: userRows } = await client.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
      if (userRows.length === 0) throw new Error("USER_NOT_FOUND");
      const { rows } = await client.query("SELECT shared_with FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      const sharedWith2 = rows[0].shared_with || [];
      if (!sharedWith2.includes(email.toLowerCase())) {
        sharedWith2.push(email.toLowerCase());
      }
      await client.query("UPDATE files SET shared_with = $1 WHERE id = $2", [JSON.stringify(sharedWith2), id]);
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "document_share", JSON.stringify({ documentId: id, sharedWith: email })]);
      return sharedWith2;
    });
    res.json({ success: true, sharedWith });
  } catch (err) {
    if (err.message === "USER_NOT_FOUND") return res.status(404).json({ error: "User with this email not found." });
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
var requestSignature = async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const signatures = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT signatures FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "signature_request", JSON.stringify({ documentId: id, requestedFrom: email })]);
      return rows[0].signatures || [];
    });
    res.json({ success: true, signatures });
  } catch (err) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
var signDocument = async (req, res) => {
  const { id } = req.params;
  const signatureData = req.body.signatureData ?? req.body.fullName;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT signatures, content, is_encrypted FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      const signatures = rows[0].signatures || [];
      const plaintext = rows[0].is_encrypted ? decrypt(rows[0].content) : rows[0].content;
      const contentHash = crypto7.createHash("sha256").update(plaintext, "utf8").digest("hex");
      const newSignature = {
        id: crypto7.randomUUID(),
        userId,
        userEmail: req.user.email,
        signedAt: (/* @__PURE__ */ new Date()).toISOString(),
        contentHash,
        signatureData
      };
      signatures.push(newSignature);
      await client.query("UPDATE files SET signatures = $1 WHERE id = $2", [JSON.stringify(signatures), id]);
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "document_sign", JSON.stringify({ documentId: id, signatureId: newSignature.id })]);
    });
    res.json({ success: true });
  } catch (err) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
function parseRedlines(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
    }
  }
  return [];
}
var createRedline = async (req, res) => {
  const { id } = req.params;
  const { originalText, proposedText, comment } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const newRedline = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT redlines FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("Document not found");
      const redlines = parseRedlines(rows[0].redlines);
      const redline = { id: crypto7.randomUUID(), originalText, proposedText, comment, proposedByEmail: req.user.email, proposedAt: (/* @__PURE__ */ new Date()).toISOString(), status: "pending" };
      redlines.push(redline);
      await client.query("UPDATE files SET redlines = $1 WHERE id = $2", [JSON.stringify(redlines), id]);
      console.log("[createRedline] persisted redline", {
        documentId: id,
        createdRedlineId: redline.id,
        redlineIdsAfterSave: redlines.map((r) => r.id),
        rawType: typeof rows[0].redlines
      });
      return redline;
    });
    res.status(201).json(newRedline);
  } catch (err) {
    res.status(err.message === "Document not found" ? 404 : 500).json({ error: err.message });
  }
};
var acceptRedline = async (req, res) => {
  const { id, redlineId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT * FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("DOCUMENT_NOT_FOUND");
      const doc = rows[0];
      const redlines = parseRedlines(doc.redlines);
      console.log("[acceptRedline] lookup", {
        documentId: id,
        requestedRedlineId: redlineId,
        storedRedlineIds: redlines.map((r) => r.id),
        redlineCount: redlines.length
      });
      const index = redlines.findIndex((r) => r.id === redlineId);
      if (index === -1) throw new Error("REDLINE_NOT_FOUND");
      const proposal = redlines[index];
      if (proposal.status === "accepted") {
        throw new Error("ALREADY_ACCEPTED");
      }
      const currentContent = doc.is_encrypted ? decrypt(doc.content) : doc.content;
      const finalContent = applyClauseReplacement(
        currentContent,
        proposal.originalText,
        proposal.proposedText
      );
      redlines[index].status = "accepted";
      redlines[index].acceptedAt = (/* @__PURE__ */ new Date()).toISOString();
      redlines[index].acceptedBy = req.user.email;
      const encryptedFinal = encrypt(finalContent);
      await client.query(
        "UPDATE files SET content = $1, redlines = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [encryptedFinal, JSON.stringify(redlines), id]
      );
      const versionId = "ver_" + crypto7.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, id, encryptedFinal]
      );
      await client.query(
        `INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
         VALUES ($1, $2, $3)`,
        [userId, "redline_accept", JSON.stringify({
          documentId: id,
          redlineId,
          originalText: proposal.originalText.substring(0, 100),
          proposedText: proposal.proposedText.substring(0, 100)
        })]
      );
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to accept redline:", err);
    if (err.message === "DOCUMENT_NOT_FOUND") {
      return res.status(404).json({ error: "Document not found" });
    }
    if (err.message === "REDLINE_NOT_FOUND") {
      return res.status(404).json({ error: "Redline not found" });
    }
    if (err.message === "ALREADY_ACCEPTED") {
      return res.status(400).json({ error: "This redline has already been accepted" });
    }
    if (err.message && err.message.startsWith("CLAUSE_")) {
      return res.status(400).json({ error: err.message.replace("CLAUSE_", "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) });
    }
    res.status(500).json({ error: "Internal error processing redline acceptance" });
  }
};
var rejectRedline = async (req, res) => {
  const { id, redlineId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query("SELECT redlines FROM files WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error("DOCUMENT_NOT_FOUND");
      const redlines = parseRedlines(rows[0].redlines);
      const index = redlines.findIndex((r) => r.id === redlineId);
      if (index === -1) throw new Error("REDLINE_NOT_FOUND");
      redlines[index].status = "rejected";
      redlines[index].rejectedAt = (/* @__PURE__ */ new Date()).toISOString();
      redlines[index].rejectedBy = req.user.email;
      await client.query("UPDATE files SET redlines = $1 WHERE id = $2", [JSON.stringify(redlines), id]);
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "redline_reject", JSON.stringify({ documentId: id, redlineId })]);
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to reject redline:", err);
    if (err.message === "DOCUMENT_NOT_FOUND") {
      return res.status(404).json({ error: "Document not found" });
    }
    if (err.message === "REDLINE_NOT_FOUND") {
      return res.status(404).json({ error: "Redline not found" });
    }
    res.status(500).json({ error: "Internal error processing redline rejection" });
  }
};
function applyClauseReplacement(documentContent, originalText, proposedText) {
  const firstExact = documentContent.indexOf(originalText);
  if (firstExact !== -1) {
    const secondExact = documentContent.indexOf(originalText, firstExact + 1);
    if (secondExact !== -1) {
      throw new Error(
        "CLAUSE_Clause matched multiple locations in the current document. Redline cannot be safely applied."
      );
    }
    return documentContent.substring(0, firstExact) + proposedText + documentContent.substring(firstExact + originalText.length);
  }
  const normalizedTarget = originalText.replace(/\s+/g, " ").trim();
  if (normalizedTarget.length === 0) {
    throw new Error("CLAUSE_Could not locate the original clause in the current document state.");
  }
  const normChars = [];
  const normToOrig = [];
  let prevWasSpace = false;
  for (let i = 0; i < documentContent.length; i++) {
    const ch = documentContent[i];
    if (/\s/.test(ch)) {
      if (!prevWasSpace) {
        normChars.push(" ");
        normToOrig.push(i);
        prevWasSpace = true;
      }
    } else {
      normChars.push(ch);
      normToOrig.push(i);
      prevWasSpace = false;
    }
  }
  const normalizedDoc = normChars.join("");
  const lowerDoc = normalizedDoc.toLowerCase();
  const lowerTarget = normalizedTarget.toLowerCase();
  const firstNorm = lowerDoc.indexOf(lowerTarget);
  if (firstNorm === -1) {
    throw new Error(
      "CLAUSE_Could not locate the original clause in the current document state."
    );
  }
  const secondNorm = lowerDoc.indexOf(lowerTarget, firstNorm + 1);
  if (secondNorm !== -1) {
    throw new Error(
      "CLAUSE_Clause matched multiple locations in the current document. Redline cannot be safely applied."
    );
  }
  const origStart = normToOrig[firstNorm];
  const origEnd = normToOrig[firstNorm + normalizedTarget.length - 1] + 1;
  return documentContent.substring(0, origStart) + proposedText + documentContent.substring(origEnd);
}
var exportDocument = async (req, res) => {
  const { title, format, contentType, content, documentId } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    if (documentId) {
      await withTransaction(userId, userRole, async (client) => {
        await client.query(`
          INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
          VALUES ($1, $2, $3)
        `, [userId, "document_export", JSON.stringify({ documentId, format, title })]);
      });
    }
    let buffer;
    let mimeType;
    let filename;
    if (format === "pdf") {
      buffer = await buildPdfBuffer(title, contentType, content);
      mimeType = "application/pdf";
      filename = `${title}.pdf`;
    } else {
      buffer = await buildDocxBuffer(title, contentType, content);
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      filename = `${title}.docx`;
    }
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// src/routes/documents.ts
import multer from "multer";
var router3 = Router3();
var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 75 * 1024 * 1024 } });
router3.get("/", authenticateToken, getDocuments);
router3.get("/:id", authenticateToken, getDocumentById);
router3.post("/", authenticateToken, createDocument);
router3.put("/:id", authenticateToken, updateDocument);
router3.delete("/:id", authenticateToken, deleteDocument);
router3.post("/upload", authenticateToken, upload.single("file"), uploadDocument);
router3.post("/export", authenticateToken, exportDocument);
router3.post("/:id/share", authenticateToken, shareDocument);
router3.post("/:id/request-signature", authenticateToken, requestSignature);
router3.post("/:id/sign", authenticateToken, signDocument);
router3.post("/:id/redline", authenticateToken, createRedline);
router3.post("/:id/redline/:redlineId/accept", authenticateToken, acceptRedline);
router3.post("/:id/redline/:redlineId/reject", authenticateToken, rejectRedline);
var documents_default = router3;

// src/routes/folders.ts
import { Router as Router4 } from "express";
var router4 = Router4();
router4.get("/", authenticateToken, getFolders);
router4.post("/", authenticateToken, createFolder);
router4.delete("/:id", authenticateToken, deleteFolder);
var folders_default = router4;

// src/routes/libraryItems.ts
import { Router as Router5 } from "express";

// src/controllers/libraryItems.ts
import crypto8 from "crypto";
var getLibraryItems = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows: rows2 } = await client.query(
        "SELECT * FROM library_items WHERE user_id = current_setting('app.current_user_id', true) ORDER BY created_at DESC"
      );
      return rows2;
    }).catch((e) => {
      console.error("Vault retrieval failed:", e);
      throw new Error("VAULT_READ_ERROR");
    });
    res.json(rows);
  } catch (err) {
    const message = err.message === "VAULT_READ_ERROR" ? "Cryptographic vault index unreachable." : "Internal vault error.";
    res.status(500).json({ error: message });
  }
};
var createLibraryItem = async (req, res) => {
  const { type, name, description, tags, details } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  const id = "lib_" + crypto8.randomUUID();
  try {
    const row = await withTransaction(userId, userRole, async (client) => {
      const { rows } = await client.query(
        "INSERT INTO library_items (id, user_id, type, name, description, tags, details) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [id, userId, type, name, description, tags, details]
      );
      return rows[0];
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var deleteLibraryItem = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    await withTransaction(userId, userRole, async (client) => {
      const result = await client.query(
        "DELETE FROM library_items WHERE id = $1",
        [req.params.id]
      );
      if (result.rowCount === 0) throw new Error("Item not found.");
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [userId, "library_item_delete", JSON.stringify({ itemId: req.params.id })]);
    });
    res.json({ success: true });
  } catch (err) {
    res.status(err.message === "Item not found." ? 404 : 500).json({ error: err.message });
  }
};

// src/routes/libraryItems.ts
var router5 = Router5();
router5.get("/", authenticateToken, getLibraryItems);
router5.post("/", authenticateToken, createLibraryItem);
router5.delete("/:id", authenticateToken, deleteLibraryItem);
var libraryItems_default = router5;

// src/routes/jobs.ts
import { Router as Router6 } from "express";

// src/controllers/jobs.ts
var getJobs = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows: rows2 } = await client.query(
        "SELECT * FROM jobs WHERE user_id = current_setting('app.current_user_id', true) ORDER BY created_at DESC"
      );
      return rows2;
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};
var getJobById = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const rows = await withTransaction(userId, userRole, async (client) => {
      const { rows: rows2 } = await client.query("SELECT * FROM jobs WHERE id = $1", [req.params.id]);
      return rows2;
    });
    if (rows.length === 0) {
      return res.status(404).json({ error: "Background task not found." });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch job details" });
  }
};
var streamJobs = (req, res) => {
  const userId = req.user.id;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const clientId = jobRegistry2.addClient(userId, res);
  req.on("close", () => {
    jobRegistry2.removeClient(clientId);
  });
  res.write(`data: ${JSON.stringify({ event: "handshake", status: "online" })}

`);
};

// src/routes/jobs.ts
var router6 = Router6();
router6.get("/", authenticateToken, getJobs);
router6.get("/stream", authenticateToken, streamJobs);
router6.get("/sse", authenticateToken, streamJobs);
router6.get("/:id", authenticateToken, getJobById);
var jobs_default = router6;

// src/routes/analyze.ts
import { Router as Router7 } from "express";
var router7 = Router7();
var orchestrator = new AgentOrchestrator();
router7.post("/interact", authenticateToken, async (req, res) => {
  try {
    const { folderIds, fileIds, draftIds, prompt, documentMode, answerStyle, history } = req.body;
    const job = await addJobToQueue(req.user.id, "document_analysis", {
      folderIds: Array.isArray(folderIds) ? folderIds : [],
      fileIds: Array.isArray(fileIds) ? fileIds : [],
      draftIds: Array.isArray(draftIds) ? draftIds : [],
      prompt,
      documentMode,
      answerStyle,
      history: Array.isArray(history) ? history : []
    });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router7.post("/remediate", authenticateToken, async (req, res) => {
  try {
    const { documentId, content } = req.body;
    const result = await orchestrator.remediate(documentId, content, req.user.id, req.user.role);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var analyze_default = router7;

// src/modules/drafting/api/route.ts
import express from "express";
import multer2 from "multer";

// src/modules/drafting/api/schema.ts
import { z as z5 } from "zod";
var BasicDraftSchema = z5.object({
  mode: z5.literal("BASIC"),
  instructions: z5.string(),
  contractType: z5.string(),
  formFields: z5.record(z5.string(), z5.string())
});
var ProactiveDraftSchema = z5.object({
  mode: z5.literal("PROACTIVE"),
  instructions: z5.string(),
  templateId: z5.string(),
  playbookId: z5.string().optional(),
  clauseIds: z5.array(z5.string()).optional()
});
var ReactiveDraftSchema = z5.object({
  mode: z5.literal("REACTIVE"),
  sourceDocumentId: z5.string(),
  extractedFields: z5.record(z5.string(), z5.string()),
  instructions: z5.string()
});
var DraftRequestSchema = z5.discriminatedUnion("mode", [
  BasicDraftSchema,
  ProactiveDraftSchema,
  ReactiveDraftSchema
]);
var RefineRequestSchema = z5.object({
  documentId: z5.string().min(1),
  instructions: z5.string().min(1),
  highlightedText: z5.string().optional()
});

// src/modules/drafting/api/controller.ts
init_crypto();
import crypto9 from "crypto";
import pdf3 from "pdf-parse-fork";
import mammoth2 from "mammoth";
async function extractTextFromFileBuffer(buffer, mimeType) {
  if (mimeType === "application/pdf") {
    const data = await pdf3(buffer);
    return data.text;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const data = await mammoth2.extractRawText({ buffer });
    return data.value;
  }
  if (mimeType.startsWith("text/")) {
    return buffer.toString("utf-8");
  }
  return buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
}
var draftRouteController = async (req, res) => {
  try {
    const request = DraftRequestSchema.safeParse(req.body);
    if (!request.success) {
      res.status(400).json({
        error: "Invalid request payload",
        details: request.error.flatten()
      });
      return;
    }
    const job = await addJobToQueue(req.user.id, "template_drafting", request.data);
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var refineRouteController = async (req, res) => {
  try {
    const request = RefineRequestSchema.safeParse(req.body);
    if (!request.success) {
      res.status(400).json({
        error: "Invalid refinement payload",
        details: request.error.flatten()
      });
      return;
    }
    const { documentId, instructions, highlightedText } = request.data;
    const job = await addJobToQueue(req.user.id, "template_drafting", {
      intent: "REFINEMENT",
      documentId,
      instructions,
      highlightedText
    });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
var processUploadedTemplateController = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded. Send multipart/form-data with a 'file' field." });
      return;
    }
    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown"
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      res.status(400).json({ error: "Unsupported file type. Only PDF, DOCX, and TXT are permitted." });
      return;
    }
    const rawText = (await extractTextFromFileBuffer(file.buffer, file.mimetype)).replace(/\0/g, "").trim();
    if (!rawText) {
      res.status(400).json({ error: "Could not extract readable text from the uploaded file." });
      return;
    }
    const sourceDocumentId = "doc_" + crypto9.randomUUID();
    const title = file.originalname || `Reactive Source - ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`;
    const userId = req.user.id;
    const encryptedContent = encryptData(rawText);
    await withTransaction(userId, "USER", async (client) => {
      await client.query(
        `INSERT INTO files (id, title, type, content, creator_id, creator_email, is_encrypted, shared_with, audit_logs)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          sourceDocumentId,
          title,
          "source_template",
          encryptedContent,
          userId,
          req.user.email,
          true,
          JSON.stringify([]),
          JSON.stringify([])
        ]
      );
      const versionId = "ver_" + crypto9.randomUUID();
      await client.query(
        `INSERT INTO document_versions (id, file_id, content) VALUES ($1, $2, $3)`,
        [versionId, sourceDocumentId, encryptedContent]
      );
    });
    res.status(201).json({ success: true, sourceDocumentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// src/modules/drafting/api/route.ts
var route = express.Router();
var upload2 = multer2({
  storage: multer2.memoryStorage(),
  limits: { fileSize: 75 * 1024 * 1024 }
});
route.post("/generate-stream", authenticateToken, draftRouteController);
route.post("/refine", authenticateToken, refineRouteController);
route.post(
  "/process-uploaded-template",
  authenticateToken,
  upload2.single("file"),
  processUploadedTemplateController
);
route.get("/health", (req, res) => {
  res.json({ message: "everything is working fine in draft template api" });
});
var route_default = route;

// src/routes/lawyer.ts
import { Router as Router8 } from "express";
var router8 = Router8();
router8.post("/ask", authenticateToken, async (req, res) => {
  try {
    const { prompt, jurisdiction, outputFormat, webContext, documentIds, documents } = req.body;
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "prompt is required." });
    }
    const resolvedDocumentIds = documentIds || documents || [];
    console.log(`[lawyer/ask] Queuing legal_ask job for user ${req.user.id}, prompt length: ${prompt.length}, documentIds count: ${resolvedDocumentIds.length}`);
    const job = await addJobToQueue(req.user.id, "document_analysis", {
      type: "legal_ask",
      prompt,
      jurisdiction,
      outputFormat,
      webContext,
      documents: resolvedDocumentIds
    });
    return res.status(202).json({ success: true, job_id: job.id });
  } catch (err) {
    console.error("[lawyer/ask] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
var lawyer_default = router8;

// src/routes/negotiate.ts
import { Router as Router9 } from "express";
var router9 = Router9();
var orchestrator2 = new AgentOrchestrator();
router9.post("/run", authenticateToken, async (req, res) => {
  try {
    const { documentContent, playbooks, instructions } = req.body;
    if (!documentContent) {
      return res.status(400).json({ error: "Document content is required for a negotiation run." });
    }
    const result = await orchestrator2.runNegotiation(
      documentContent,
      playbooks || [],
      instructions || ""
    );
    res.json({ redlines: result });
  } catch (err) {
    console.error("[negotiate/run] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
router9.post("/evaluate", authenticateToken, async (req, res) => {
  const { content, documentTitle = "Contract", documentType = "Agreement" } = req.body;
  if (!content || typeof content !== "string" || content.trim().length < 20) {
    return res.status(400).json({ error: "Document content is required for evaluation." });
  }
  const systemPrompt = `You are an elite Corporate Counsel and Multi-Agent Contract Risk Evaluator.
Your goal is to scan the contract, identify the highest-risk provisions, and recommend commercially realistic replacements.

CRITICAL EXTRACTION DIRECTIVES:
1. "original" MUST match character-for-character, verbatim text pulled directly from the [CONTRACT CONTENT] block. Do not modify, truncate, or paraphrase this text.
2. Focus strictly on key transaction vectors: Indemnity, Intellectual Property, Limitation of Liability Caps, Termination, and Governing Law.
3. Categorize "riskLevel" using these criteria:
   - RED: Uncapped liability, unilateral indemnities, broad IP transfers, non-domestic governing law.
   - YELLOW: Unbalanced terms, overly broad audit rights, long payment cycles, lack of mutual termination.
   - GREEN: Fair, balanced, or market-standard provisions requiring no modification.
4. Return EXACTLY valid JSON matching the schema provided. Do not include markdown wraps (like \`\`\`json), comments, or conversational text.`;
  const userPrompt = `Document Title: ${documentTitle}
Document Type: ${documentType}

[CONTRACT CONTENT]
${content.substring(0, 12e3)}`;
  const evaluationSchema = {
    type: "object",
    properties: {
      markups: {
        type: "array",
        items: {
          type: "object",
          properties: {
            clauseId: { type: "string" },
            original: {
              type: "string",
              description: "The exact, verbatim clause text extracted from the document."
            },
            replacement: {
              type: "string",
              description: "A commercially balanced, protective alternative clause."
            },
            reasoning: {
              type: "string",
              description: "The strategic reason why this clause presents operational risk."
            },
            riskLevel: {
              type: "string",
              enum: ["RED", "YELLOW", "GREEN"]
            }
          },
          required: ["clauseId", "original", "replacement", "reasoning", "riskLevel"],
          additionalProperties: false
        }
      }
    },
    required: ["markups"],
    additionalProperties: false
  };
  try {
    console.log(`[negotiate/evaluate] Running AI evaluation for "${documentTitle}" via Gemini`);
    const parsed = await executeJsonCompletion(
      userPrompt,
      systemPrompt,
      evaluationSchema,
      "STRUCTURAL_JSON" /* STRUCTURAL_JSON */,
      "GEMINI" /* GEMINI */
    );
    const markups = Array.isArray(parsed.markups) ? parsed.markups : [];
    console.log(`[negotiate/evaluate] Returned ${markups.length} markup(s)`);
    return res.json({ data: { markups } });
  } catch (err) {
    console.error("[negotiate/evaluate] AI error:", err.message);
    return res.json({ data: { markups: [] }, warning: err.message });
  }
});
router9.post("/compromise", authenticateToken, async (req, res) => {
  const { originalText, riskExplanation, userPrompt: customPrompt, playbookPreferred } = req.body;
  if (!originalText || typeof originalText !== "string") {
    return res.status(400).json({ error: "originalText is required." });
  }
  const systemPrompt = `You are Lumi, a brilliant legal negotiation agent. Your objective is to draft a protective, commercially viable replacement for a risky contract clause.

DRAFTING STRATEGY:
${playbookPreferred ? "Maximize client protection. Draft strong, defensive, client-favorable language that holds the line on critical exposures." : "Draft a balanced, market-standard compromise that mitigates risk while facilitating a fast deal sign-off."}

STRICT OUTPUT RULE:
- Return ONLY the final raw contractual text of the replacement clause.
- Do NOT wrap your output in markdown code blocks (e.g. no \`\`\`), quotation marks, introduction/explanatory preambles, or postscript notes. Begin immediately with the clause text.`;
  const userPrompt = `Original risky clause:
"${originalText}"

Risk Analysis: ${riskExplanation || "General legal risk detected."}
${customPrompt ? `Additional Instruction: ${customPrompt}` : ""}

Draft the replacement clause below:`;
  try {
    console.log(`[negotiate/compromise] Drafting ${playbookPreferred ? "playbook-preferred" : "balanced"} compromise`);
    const result = await executeCompletion(
      userPrompt,
      systemPrompt,
      "REFINEMENT" /* REFINEMENT */,
      "GEMINI" /* GEMINI */
    );
    return res.json({ result: result.trim() });
  } catch (err) {
    console.error("[negotiate/compromise] AI error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
var negotiate_default = router9;

// src/routes/vulnerabilities.ts
import { Router as Router10 } from "express";
var router10 = Router10();
router10.post("/scan-cookie", authenticateToken, async (req, res) => {
  try {
    const { url, scanDepth } = req.body;
    const job = await addJobToQueue(req.user.id, "privacy_scanning", { url, scanDepth });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (error) {
    console.error("Cookie scan queueing failed:", error);
    res.status(500).json({ success: false, error: "Failed to queue cookie scan" });
  }
});
router10.post("/scan-vulnerability", authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    const job = await addJobToQueue(req.user.id, "vulnerability_scanning", { url });
    res.status(202).json({ success: true, job_id: job.id });
  } catch (error) {
    console.error("Vulnerability scan queueing failed:", error);
    res.status(500).json({ success: false, error: "Failed to queue vulnerability scan" });
  }
});
var vulnerabilities_default = router10;

// src/routes/reports.ts
import { Router as Router11 } from "express";

// src/controllers/reports.ts
import nodemailer from "nodemailer";
var shareReportEmail = async (req, res) => {
  const { recipientEmail, subject, reportTitle, contentType, content, format } = req.body;
  if (!recipientEmail || !content) {
    return res.status(400).json({ error: "Recipient email and report content are required." });
  }
  try {
    await withTransaction(req.user.id, req.user.role, async (client) => {
      await client.query(`
        INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
        VALUES ($1, $2, $3)
      `, [req.user.id, "report_share", JSON.stringify({ recipientEmail, reportTitle, format })]);
    });
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.example.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    if (!process.env.SMTP_USER) {
      console.log(`[STUB]: Sending report "${reportTitle}" to ${recipientEmail} in ${format} format.`);
      return res.json({ success: true, message: `[DEMO MODE] Report successfully dispatched to ${recipientEmail}.` });
    }
    await transporter.sendMail({
      from: '"Lexify Audits" <noreply@Lexify.cloud>',
      to: recipientEmail,
      subject: subject || `Lexify Report: ${reportTitle}`,
      text: content
    });
    res.json({ success: true, message: `Report successfully dispatched to ${recipientEmail}.` });
  } catch (err) {
    console.error("Failed to share report via email:", err);
    res.status(500).json({ error: "Internal server error during report dispatch." });
  }
};

// src/routes/reports.ts
var router11 = Router11();
router11.post("/share-email", authenticateToken, shareReportEmail);
var reports_default = router11;

// src/routes/settings.ts
import { Router as Router12 } from "express";
init_database();
var router12 = Router12();
router12.get("/:key", authenticateToken, async (req, res) => {
  const { key } = req.params;
  const client = req.dbClient || pool;
  try {
    const { rows } = await client.query("SELECT value FROM system_settings WHERE key = $1", [key]);
    if (rows.length === 0) return res.status(404).json({ error: "Setting not found" });
    res.json(rows[0].value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var settings_default = router12;

// src/routes/dpa.ts
import { Router as Router13 } from "express";
import multer3 from "multer";
import pdf4 from "pdf-parse-fork";
import mammoth3 from "mammoth";
import { fileTypeFromBuffer as fileTypeFromBuffer2 } from "file-type";
var router13 = Router13();
var upload3 = multer3({
  storage: multer3.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});
var ALLOWED_MIME_TYPES = /* @__PURE__ */ new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown"
]);
async function extractText(buffer, mimeType) {
  if (mimeType === "application/pdf") {
    const data = await pdf4(buffer);
    return data.text;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mimeType === "application/msword") {
    const data = await mammoth3.extractRawText({ buffer });
    return data.value;
  }
  if (mimeType.startsWith("text/")) {
    return buffer.toString("utf-8");
  }
  return buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
}
router13.post(
  "/review",
  authenticateToken,
  upload3.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded. Send a multipart/form-data request with a 'file' field." });
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({
        error: "Unsupported file type. Only PDF, DOCX, and TXT files are accepted for DPA review."
      });
    }
    try {
      const detected = await fileTypeFromBuffer2(file.buffer);
      if (detected && !ALLOWED_MIME_TYPES.has(detected.mime)) {
        return res.status(400).json({
          error: "File signature mismatch. The file content does not match its declared type."
        });
      }
    } catch {
    }
    let documentText;
    try {
      documentText = await extractText(file.buffer, file.mimetype);
    } catch (extractErr) {
      console.error("[dpa/review] Text extraction failed:", extractErr.message);
      return res.status(422).json({
        error: `Failed to extract text from the uploaded file: ${extractErr.message}`
      });
    }
    const cleanedText = documentText.replace(/\s+/g, " ").trim();
    if (cleanedText.length < 100) {
      return res.status(422).json({
        error: "The uploaded file appears to be empty or contains insufficient text for analysis."
      });
    }
    try {
      const job = await addJobToQueue(req.user.id, "dpa_review", {
        documentText: cleanedText,
        fileName: file.originalname,
        // fileId is omitted here because the DPA is reviewed ephemerally —
        // it is not persisted to the documents vault unless the user chooses to.
        // Pass fileId from req.body if the caller has already uploaded it.
        fileId: req.body?.file_id ?? void 0
      });
      console.log(
        `[dpa/review] Queued dpa_review job ${job.id} for user ${req.user.id}, file: "${file.originalname}", text length: ${cleanedText.length}`
      );
      return res.status(202).json({ success: true, job_id: job.id });
    } catch (queueErr) {
      console.error("[dpa/review] Failed to queue job:", queueErr.message);
      return res.status(500).json({ error: "Failed to start DPA review. Please try again." });
    }
  }
);
var dpa_default = router13;

// src/routes/vendorReview.ts
import { Router as Router14 } from "express";
import multer4 from "multer";
import pdf5 from "pdf-parse-fork";
import mammoth4 from "mammoth";
import { fileTypeFromBuffer as fileTypeFromBuffer3 } from "file-type";
var router14 = Router14();
var upload4 = multer4({
  storage: multer4.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 }
});
var ALLOWED_MIME_TYPES2 = /* @__PURE__ */ new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown"
]);
async function extractText2(buffer, mimeType) {
  if (mimeType === "application/pdf") {
    const data = await pdf5(buffer);
    return data.text;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mimeType === "application/msword") {
    const data = await mammoth4.extractRawText({ buffer });
    return data.value;
  }
  if (mimeType.startsWith("text/")) {
    return buffer.toString("utf-8");
  }
  return buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
}
router14.post(
  "/",
  authenticateToken,
  upload4.array("files", 10),
  async (req, res) => {
    const files = req.files;
    const vendorUrl = (req.body?.vendorUrl ?? "").trim();
    const hasFiles = Array.isArray(files) && files.length > 0;
    const hasUrl = vendorUrl.length > 0;
    if (!hasFiles && !hasUrl) {
      return res.status(400).json({
        error: "At least one vendor document or a vendor URL is required. Send files in a 'files' multipart field and/or a 'vendorUrl' text field."
      });
    }
    if (hasFiles) {
      for (const file of files) {
        if (!ALLOWED_MIME_TYPES2.has(file.mimetype)) {
          return res.status(400).json({
            error: `Unsupported file type for "${file.originalname}". Only PDF, DOCX, and TXT are accepted.`
          });
        }
        try {
          const detected = await fileTypeFromBuffer3(file.buffer);
          if (detected && !ALLOWED_MIME_TYPES2.has(detected.mime)) {
            return res.status(400).json({
              error: `File signature mismatch for "${file.originalname}". Content does not match declared type.`
            });
          }
        } catch {
        }
      }
    }
    const extractedTexts = [];
    if (hasFiles) {
      for (const file of files) {
        try {
          const text = await extractText2(file.buffer, file.mimetype);
          const cleaned = text.replace(/\s+/g, " ").trim();
          if (cleaned.length > 50) {
            extractedTexts.push(
              `[DOCUMENT: ${file.originalname}]
${cleaned}`
            );
            console.log(
              `[vendor-review] Extracted ${cleaned.length} chars from "${file.originalname}"`
            );
          } else {
            console.warn(
              `[vendor-review] "${file.originalname}" yielded insufficient text (${cleaned.length} chars) \u2014 skipping`
            );
          }
        } catch (extractErr) {
          console.error(
            `[vendor-review] Text extraction failed for "${file.originalname}":`,
            extractErr.message
          );
          return res.status(422).json({
            error: `Failed to extract text from "${file.originalname}": ${extractErr.message}`
          });
        }
      }
      if (!hasUrl && extractedTexts.length === 0) {
        return res.status(422).json({
          error: "All uploaded files appear to be empty or contain insufficient text for analysis."
        });
      }
    }
    const mergedDocumentText = extractedTexts.join("\n\n---\n\n");
    const fileNames = hasFiles ? files.map((f) => f.originalname) : [];
    try {
      const job = await addJobToQueue(req.user.id, "vendor_review", {
        documentText: mergedDocumentText,
        vendorUrl: hasUrl ? vendorUrl : void 0,
        fileNames
      });
      console.log(
        `[vendor-review] Queued vendor_review job ${job.id} for user ${req.user.id} \u2014 files: ${fileNames.join(", ") || "none"}, url: ${vendorUrl || "none"}, mergedTextLen: ${mergedDocumentText.length}`
      );
      return res.status(202).json({ success: true, job_id: job.id });
    } catch (queueErr) {
      console.error("[vendor-review] Failed to queue job:", queueErr.message);
      return res.status(500).json({
        error: "Failed to start vendor review. Please try again."
      });
    }
  }
);
var vendorReview_default = router14;

// src/routes/aiEthics.ts
import { Router as Router15 } from "express";
import multer5 from "multer";
import pdf6 from "pdf-parse-fork";
import mammoth5 from "mammoth";
import { fileTypeFromBuffer as fileTypeFromBuffer4 } from "file-type";
var router15 = Router15();
var upload5 = multer5({
  storage: multer5.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 }
});
var ALLOWED_MIME_TYPES3 = /* @__PURE__ */ new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown"
]);
async function extractText3(buffer, mimeType) {
  if (mimeType === "application/pdf") {
    const data = await pdf6(buffer);
    return data.text;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mimeType === "application/msword") {
    const data = await mammoth5.extractRawText({ buffer });
    return data.value;
  }
  if (mimeType.startsWith("text/")) {
    return buffer.toString("utf-8");
  }
  return buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
}
router15.post(
  "/",
  authenticateToken,
  upload5.array("files", 10),
  async (req, res) => {
    const files = req.files;
    const websiteUrl = (req.body?.websiteUrl ?? "").trim();
    const hasFiles = Array.isArray(files) && files.length > 0;
    const hasUrl = websiteUrl.length > 0;
    if (!hasFiles && !hasUrl) {
      return res.status(400).json({
        error: "At least one AI document or a website URL is required. Send files in a 'files' multipart field and/or a 'websiteUrl' text field."
      });
    }
    if (hasFiles) {
      for (const file of files) {
        if (!ALLOWED_MIME_TYPES3.has(file.mimetype)) {
          return res.status(400).json({
            error: `Unsupported file type for "${file.originalname}". Only PDF, DOCX, and TXT are accepted.`
          });
        }
        try {
          const detected = await fileTypeFromBuffer4(file.buffer);
          if (detected && !ALLOWED_MIME_TYPES3.has(detected.mime)) {
            return res.status(400).json({
              error: `File signature mismatch for "${file.originalname}". Content does not match declared type.`
            });
          }
        } catch {
        }
      }
    }
    const extractedTexts = [];
    if (hasFiles) {
      for (const file of files) {
        try {
          const text = await extractText3(file.buffer, file.mimetype);
          const cleaned = text.replace(/\s+/g, " ").trim();
          if (cleaned.length > 50) {
            extractedTexts.push(`[DOCUMENT: ${file.originalname}]
${cleaned}`);
            console.log(
              `[ai-ethics] Extracted ${cleaned.length} chars from "${file.originalname}"`
            );
          } else {
            console.warn(
              `[ai-ethics] "${file.originalname}" yielded insufficient text (${cleaned.length} chars) \u2014 skipping`
            );
          }
        } catch (extractErr) {
          console.error(
            `[ai-ethics] Text extraction failed for "${file.originalname}":`,
            extractErr.message
          );
          return res.status(422).json({
            error: `Failed to extract text from "${file.originalname}": ${extractErr.message}`
          });
        }
      }
      if (!hasUrl && extractedTexts.length === 0) {
        return res.status(422).json({
          error: "All uploaded files appear to be empty or contain insufficient text for analysis."
        });
      }
    }
    const mergedDocumentText = extractedTexts.join("\n\n---\n\n");
    const fileNames = hasFiles ? files.map((f) => f.originalname) : [];
    try {
      const job = await addJobToQueue(req.user.id, "ai_ethics_review", {
        documentText: mergedDocumentText,
        websiteUrl: hasUrl ? websiteUrl : void 0,
        fileNames,
        fileIds: []
        // ephemeral upload: no DB-persisted file IDs yet
      });
      console.log(
        `[ai-ethics] Queued ai_ethics_review job ${job.id} for user ${req.user.id} \u2014 files: ${fileNames.join(", ") || "none"}, url: ${websiteUrl || "none"}, mergedTextLen: ${mergedDocumentText.length}`
      );
      return res.status(202).json({ success: true, job_id: job.id });
    } catch (queueErr) {
      console.error("[ai-ethics] Failed to queue job:", queueErr.message);
      return res.status(500).json({
        error: "Failed to start AI Ethics review. Please try again."
      });
    }
  }
);
var aiEthics_default = router15;

// src/routes/index.ts
var router16 = Router16();
router16.get("/health", async (req, res) => {
  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    const latency = Date.now() - start;
    res.json({
      status: "UP",
      database: "CONNECTED",
      latency: `${latency}ms`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: "DOWN",
      database: "DISCONNECTED",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
router16.use("/auth", auth_default);
router16.use("/admin", admin_default);
router16.use("/documents", documents_default);
router16.use("/folders", folders_default);
router16.use("/library-items", libraryItems_default);
router16.use("/jobs", jobs_default);
router16.use("/analyze", analyze_default);
router16.use("/drafting", route_default);
router16.use("/lawyer", lawyer_default);
router16.use("/negotiate", negotiate_default);
router16.use("/vulnerabilities", vulnerabilities_default);
router16.use("/reports", reports_default);
router16.use("/settings", settings_default);
router16.use("/dpa", dpa_default);
router16.use("/vendor-review", vendorReview_default);
router16.use("/ai-ethics", aiEthics_default);
var routes_default = router16;

// src/middleware/cors.ts
init_config();
import cors from "cors";
var corsOrigins = new Set(
  [
    "http://localhost:5173",
    "http://localhost:3000",
    config.corsOrigin
  ].flatMap((origin) => origin ? origin.split(",") : []).map((origin) => origin.trim()).filter(Boolean)
);
var cloudRunOriginPattern = /^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.[a-z0-9-]+\.run\.app(?::\d+)?$/i;
var corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (corsOrigins.has(origin) || cloudRunOriginPattern.test(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || /^https?:\/\/[a-z0-9-]+\.app\.github\.dev(:\d+)?$/i.test(origin) || /^https?:\/\/[a-z0-9-]+\.github\.dev(:\d+)?$/i.test(origin) || /^https?:\/\/[a-z0-9-]+\.onrender\.com(:\d+)?$/i.test(origin) || /^https?:\/\/([a-z0-9-]+\.)?firebase\.google\.com(:\d+)?$/i.test(origin) || /^https?:\/\/[a-z0-9-]+\.cluster-[a-z0-9]+\.cloudworkstations\.dev(:\d+)?$/i.test(origin) || /cloudworkstations\.dev$/i.test(origin) || process.env.NODE_ENV !== "production") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
});

// src/middleware/error.ts
init_logger();
import * as Sentry2 from "@sentry/node";
var errorHandler = (err, req, res, next) => {
  const alreadyEnded = res.writableEnded || res.headersSent;
  if (alreadyEnded) {
    return;
  }
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  const code = err.code || "INTERNAL_ERROR";
  logger.error({
    err: {
      message: err.message,
      stack: err.stack,
      code: err.code
    },
    status,
    url: req.url,
    method: req.method,
    user: req.user?.id
  }, "API Error occurred");
  if (status >= 500) {
    Sentry2.captureException(err, {
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
    code,
    details: process.env.NODE_ENV === "development" ? err.details : void 0
  });
};

// src/middleware/queryLogger.ts
init_database();
var isPatched = false;
var initQueryLogger = () => {
  if (isPatched) return;
  const originalQuery = pool.query.bind(pool);
  pool.query = (...args) => {
    const start = Date.now();
    const query = typeof args[0] === "string" ? args[0] : args[0].text;
    const params = args[1] || [];
    return originalQuery(...args).then((result) => {
      const duration = Date.now() - start;
      if (process.env.NODE_ENV !== "production" || duration > 100) {
        console.log(`[QueryLogger] ${duration}ms | ${query.substring(0, 200)}${query.length > 200 ? "..." : ""}`);
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

// server.ts
init_logger();
var app = express2();
var httpServer = http.createServer(app);
var __filename = fileURLToPath2(import.meta.url);
var __dirname2 = path2.dirname(__filename);
function resolveFrontendDistPath() {
  const candidates = [
    path2.resolve(__dirname2, "../../frontend/dist"),
    path2.resolve(process.cwd(), "frontend", "dist"),
    path2.resolve(process.cwd(), "dist")
  ];
  for (const candidate of candidates) {
    if (fs2.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}
initSentry(app);
app.use(corsMiddleware);
app.use(express2.json({ limit: "50mb" }));
app.use(express2.urlencoded({ limit: "50mb", extended: true }));
initQueryLogger();
app.use("/api", routes_default);
if (config.nodeEnv === "production") {
  const distPath = resolveFrontendDistPath();
  const assetsPath = path2.join(distPath, "assets");
  logger.info(`[Static Assets] Serving frontend from resolved path: ${distPath}`);
  const assetsStatic = express2.static(assetsPath, {
    fallthrough: false,
    immutable: true,
    maxAge: "1y",
    index: false
  });
  app.use("/assets", (req, res, next) => {
    assetsStatic(req, res, (err) => {
      if (!err) {
        return next();
      }
      if (!res.headersSent) {
        const statusCode = err && typeof err === "object" && "status" in err ? Number(err.status) || 500 : 500;
        res.status(statusCode).type("text/plain").send(statusCode === 404 ? "Asset not found" : "Asset serving failed");
      }
    });
  });
  app.use(express2.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/assets/")) {
      return res.status(404).type("text/plain").send("Asset not found");
    }
    res.sendFile(path2.join(distPath, "index.html"), (err) => {
      if (err) {
        next(err);
      }
    });
  });
}
initSentryErrorHandler(app);
app.use(errorHandler);
async function startServer() {
  validateEnv();
  if (config.nodeEnv !== "production") {
    const vite = await createViteServer({
      root: path2.resolve(process.cwd(), "frontend"),
      server: {
        middlewareMode: true,
        hmr: { server: httpServer }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  const port = config.port;
  httpServer.listen(port, "0.0.0.0", () => {
    logger.info(`Server running on http://localhost:${port} [${config.nodeEnv}]`);
  });
}
if (process.env.NODE_ENV !== "test") {
  startServer();
}
var server_default = app;
export {
  server_default as default
};
