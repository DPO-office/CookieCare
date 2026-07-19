/**
 * BrowserManager — Playwright-first with automatic Puppeteer fallback.
 *
 * Architecture:
 *   BrowserManager
 *     └─ Try Playwright (chromium.launch / connectOverCDP)
 *         └─ If launch fails → "Playwright unavailable — using Puppeteer"
 *             └─ Launch Puppeteer (puppeteer.launch)
 *                 └─ Wrap Puppeteer objects to expose the same interface
 *
 * Every caller (ScannerService, exportService, pageCrawler, metadataExtractor,
 * contentExtractor) continues to use the same BrowserManager API unchanged:
 *   - browserManager.newContext(options?)    → BrowserContextLike
 *   - browserManager.newPage(options?)       → PageLike
 *   - browserManager.isAvailable()           → Promise<boolean>
 *   - browserManager.cleanup()
 *   - browserManager.getBrowser()
 *
 * Puppeteer adapter covers all APIs used by existing callers:
 *   - context.newPage()
 *   - context.route("**\/*", handler)        → requestinterception + request event
 *   - context.newCDPSession(page)            → page.target().createCDPSession()
 *   - context.close()
 *   - page.goto(url, options)
 *   - page.on("request"|"response", handler)
 *   - page.evaluate(fn, ...args)
 *   - page.locator(selector)                 → thin wrapper over page.$() / page.waitForSelector()
 *   - page.waitForLoadState(state, options)
 *   - page.setContent(html)
 *   - page.pdf(options)
 *   - page.close()
 *   - page.context()                         → back-reference to the owning context
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";

// ─── Shared interface types ───────────────────────────────────────────────────
// These mirror the Playwright shape that callers depend on.

export interface LocatorLike {
  first(): LocatorLike;
  isVisible(options?: { timeout?: number }): Promise<boolean>;
  click(): Promise<void>;
}

export interface CDPSessionLike {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  detach(): Promise<void>;
}

export interface BrowserContextLike {
  newPage(): Promise<PageLike>;
  /** Playwright-style request interception. Puppeteer adapter implements this. */
  route(pattern: string, handler: (route: RouteLike) => void): Promise<void>;
  newCDPSession(page: PageLike): Promise<CDPSessionLike>;
  close(): Promise<void>;
}

export interface RouteLike {
  request(): { resourceType(): string; url(): string };
  abort(): Promise<void>;
  continue(): Promise<void>;
}

export interface PageLike {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<any>;
  on(event: string, handler: (...args: any[]) => void): void;
  evaluate<T = any>(fn: ((...args: any[]) => T) | string, ...args: any[]): Promise<T>;
  locator(selector: string): LocatorLike;
  waitForLoadState(state: string, options?: { timeout?: number }): Promise<void>;
  setContent(html: string): Promise<void>;
  pdf(options?: Record<string, any>): Promise<Buffer>;
  close(): Promise<void>;
  context(): BrowserContextLike;
}

// ─── Puppeteer adapter ────────────────────────────────────────────────────────

/**
 * Wraps a Puppeteer CDPSession to match our CDPSessionLike interface.
 */
class PuppeteerCDPSession implements CDPSessionLike {
  constructor(private session: any) {}

  async send(method: string, params?: Record<string, unknown>): Promise<any> {
    return this.session.send(method, params ?? {});
  }

  async detach(): Promise<void> {
    try {
      await this.session.detach();
    } catch {
      // ignore — already detached
    }
  }
}

/**
 * Thin Playwright-style locator wrapper over Puppeteer's page.$ API.
 */
class PuppeteerLocator implements LocatorLike {
  constructor(
    private page: any,
    private selector: string,
    private _isFirst: boolean = false
  ) {}

  first(): LocatorLike {
    return new PuppeteerLocator(this.page, this.selector, true);
  }

  async isVisible(options?: { timeout?: number }): Promise<boolean> {
    const timeout = options?.timeout ?? 2000;
    try {
      const el = await this.page.waitForSelector(this.selector, {
        timeout,
        visible: true,
      });
      return el !== null;
    } catch {
      return false;
    }
  }

  async click(): Promise<void> {
    await this.page.click(this.selector);
  }
}

/**
 * Wraps a Puppeteer Page to expose the Playwright PageLike interface.
 */
class PuppeteerPageAdapter implements PageLike {
  private _context: BrowserContextLike;

  constructor(private puppeteerPage: any, context: BrowserContextLike) {
    this._context = context;
  }

  async goto(
    url: string,
    options?: { waitUntil?: string; timeout?: number }
  ): Promise<any> {
    // Map Playwright waitUntil values to Puppeteer equivalents
    const waitUntilMap: Record<string, string> = {
      networkidle: "networkidle2",
      networkidle0: "networkidle0",
      networkidle2: "networkidle2",
      domcontentloaded: "domcontentloaded",
      load: "load",
      commit: "domcontentloaded",
    };
    const puppeteerWaitUntil =
      (options?.waitUntil ? waitUntilMap[options.waitUntil] : undefined) ??
      "domcontentloaded";

    return this.puppeteerPage.goto(url, {
      waitUntil: puppeteerWaitUntil,
      timeout: options?.timeout ?? 30000,
    });
  }

  on(event: string, handler: (...args: any[]) => void): void {
    if (event === "request") {
      this.puppeteerPage.on("request", (req: any) => {
        // Wrap the Puppeteer request object to match Playwright's shape
        handler({
          url: () => req.url(),
          resourceType: () => req.resourceType(),
        });
      });
    } else if (event === "response") {
      this.puppeteerPage.on("response", (resp: any) => {
        handler({
          url: () => resp.url(),
          status: () => resp.status(),
        });
      });
    } else {
      this.puppeteerPage.on(event, handler);
    }
  }

  async evaluate<T = any>(
    fn: ((...args: any[]) => T) | string,
    ...args: any[]
  ): Promise<T> {
    return this.puppeteerPage.evaluate(fn as any, ...args);
  }

  locator(selector: string): LocatorLike {
    return new PuppeteerLocator(this.puppeteerPage, selector);
  }

  async waitForLoadState(
    state: string,
    options?: { timeout?: number }
  ): Promise<void> {
    const waitUntilMap: Record<string, string> = {
      networkidle: "networkidle2",
      networkidle0: "networkidle0",
      networkidle2: "networkidle2",
      domcontentloaded: "domcontentloaded",
      load: "load",
    };
    const waitUntil = waitUntilMap[state] ?? "load";
    try {
      await this.puppeteerPage.waitForNavigation({
        waitUntil,
        timeout: options?.timeout ?? 10000,
      });
    } catch {
      // waitForNavigation can time out if no navigation happens after a click
      // (e.g. a consent banner closes in-place) — swallow silently, same as
      // Playwright's behaviour.
    }
  }

  async setContent(html: string): Promise<void> {
    await this.puppeteerPage.setContent(html, { waitUntil: "networkidle2" });
  }

  async pdf(options?: Record<string, any>): Promise<Buffer> {
    // Puppeteer uses { width, height } for custom sizes; map Playwright's
    // format/margin/printBackground directly — Puppeteer accepts them too.
    const pdfOptions: Record<string, any> = {
      printBackground: options?.printBackground ?? true,
      format: options?.format ?? "A4",
    };
    if (options?.margin) {
      pdfOptions.margin = options.margin;
    }
    const result = await this.puppeteerPage.pdf(pdfOptions);
    return Buffer.isBuffer(result) ? result : Buffer.from(result);
  }

  async close(): Promise<void> {
    try {
      await this.puppeteerPage.close();
    } catch {
      // ignore
    }
  }

  context(): BrowserContextLike {
    return this._context;
  }
}

/**
 * Wraps a Puppeteer Browser to expose the BrowserContextLike interface.
 *
 * Puppeteer has no equivalent of Playwright's isolated BrowserContext in the
 * same way (incognito contexts exist but are rarely used).  We create a fresh
 * incognito context so each scan gets isolated cookies/storage — matching the
 * Playwright behaviour of `browser.newContext()`.
 */
class PuppeteerContextAdapter implements BrowserContextLike {
  /** Pages created in this context (needed for cleanup). */
  private pages: PuppeteerPageAdapter[] = [];
  /** Pending route handlers installed before any page was created. */
  private routeHandlers: Array<{ pattern: string; handler: (route: RouteLike) => void }> = [];

  constructor(
    private puppeteerContext: any,
    private optimizeForScanning: boolean = false
  ) {}

  async newPage(): Promise<PageLike> {
    const rawPage = await this.puppeteerContext.newPage();

    // Apply request interception if scanning optimisation was requested.
    // This must happen *before* any navigation.
    if (this.optimizeForScanning || this.routeHandlers.length > 0) {
      await rawPage.setRequestInterception(true);
      rawPage.on("request", (req: any) => {
        const resourceType: string = req.resourceType();

        // Default scanning optimisation: abort heavy non-essential resources
        if (
          this.optimizeForScanning &&
          this.routeHandlers.length === 0 &&
          ["image", "font", "media"].includes(resourceType)
        ) {
          req.abort();
          return;
        }

        // Apply custom route handlers (registered via context.route())
        for (const { handler } of this.routeHandlers) {
          let aborted = false;
          let continued = false;

          const route: RouteLike = {
            request: () => ({
              resourceType: () => resourceType,
              url: () => req.url(),
            }),
            abort: async () => {
              aborted = true;
            },
            continue: async () => {
              continued = true;
            },
          };

          handler(route);

          if (aborted) {
            req.abort();
            return;
          }
          if (continued) {
            break;
          }
        }

        req.continue();
      });
    }

    const adapter = new PuppeteerPageAdapter(rawPage, this);
    this.pages.push(adapter);
    return adapter;
  }

  /**
   * Register a Playwright-style route handler.
   * Pattern is ignored (we handle all requests) — the handler's abort/continue
   * decision drives whether the request is blocked.
   */
  async route(
    _pattern: string,
    handler: (route: RouteLike) => void
  ): Promise<void> {
    this.routeHandlers.push({ pattern: _pattern, handler });
  }

  async newCDPSession(page: PageLike): Promise<CDPSessionLike> {
    // Retrieve the raw Puppeteer page from our adapter
    const rawPage = (page as PuppeteerPageAdapter as any).puppeteerPage;
    const session = await rawPage.target().createCDPSession();
    return new PuppeteerCDPSession(session);
  }

  async close(): Promise<void> {
    try {
      await this.puppeteerContext.close();
    } catch {
      // ignore
    }
  }
}

// ─── Playwright adapter (thin pass-through) ───────────────────────────────────
// The existing code already uses Playwright types directly.  When Playwright
// is available we need to return Playwright objects that also satisfy our
// *Like interfaces.  Rather than wrap everything, we cast the Playwright
// BrowserContext / Page — they already match the shape.

function wrapPlaywrightContext(context: BrowserContext): BrowserContextLike {
  return {
    newPage: async () => wrapPlaywrightPage(await context.newPage(), wrapPlaywrightContext(context)),
    route: async (pattern, handler) => {
      await context.route(pattern, (playwrightRoute) => {
        const route: RouteLike = {
          request: () => ({
            resourceType: () => playwrightRoute.request().resourceType(),
            url: () => playwrightRoute.request().url(),
          }),
          abort: () => playwrightRoute.abort(),
          continue: () => playwrightRoute.continue(),
        };
        handler(route);
      });
    },
    newCDPSession: async (page) => {
      // page is a wrapped Playwright Page — get the raw Playwright Page
      const rawPage = (page as any)._playwrightPage as Page;
      const session = await context.newCDPSession(rawPage);
      return {
        send: (method, params) => session.send(method as any, params as any),
        detach: () => session.detach(),
      };
    },
    close: () => context.close(),
  };
}

function wrapPlaywrightPage(page: Page, context: BrowserContextLike): PageLike {
  const adapter: PageLike = {
    _playwrightPage: page,
    goto: (url, options) => page.goto(url, options as any),
    on: (event, handler) => {
      if (event === "request") {
        page.on("request", (req) => handler({ url: () => req.url(), resourceType: () => req.resourceType() }));
      } else if (event === "response") {
        page.on("response", (resp) => handler({ url: () => resp.url(), status: () => resp.status() }));
      } else {
        (page as any).on(event, handler);
      }
    },
    evaluate: (fn, ...args) => page.evaluate(fn as any, ...args),
    locator: (selector) => {
      const locatorObj = page.locator(selector);
      return {
        first: () => {
          const first = locatorObj.first();
          return {
            first: () => wrapLocator(first),
            isVisible: (opts) => first.isVisible(opts),
            click: () => first.click(),
          };
        },
        isVisible: (opts) => locatorObj.isVisible(opts),
        click: () => locatorObj.click(),
      };
    },
    waitForLoadState: (state, opts) => page.waitForLoadState(state as any, opts),
    setContent: (html) => page.setContent(html),
    pdf: (opts) => page.pdf(opts as any),
    close: () => page.close(),
    context: () => context,
  } as any;
  return adapter;
}

function wrapLocator(locator: any): LocatorLike {
  return {
    first: () => wrapLocator(locator.first()),
    isVisible: (opts) => locator.isVisible(opts),
    click: () => locator.click(),
  };
}

// ─── BrowserManager ───────────────────────────────────────────────────────────

type BrowserEngine = "playwright" | "puppeteer";

class BrowserManager {
  private static instance: BrowserManager;

  // Playwright state
  private playwrightBrowser: Browser | null = null;
  private playwrightLaunchPromise: Promise<Browser> | null = null;
  private usingRemote = false;

  // Puppeteer state
  private puppeteerBrowser: any = null;
  private puppeteerLaunchPromise: Promise<any> | null = null;

  // Which engine is in use
  private engine: BrowserEngine | null = null;

  // Cached availability state
  private _playwrightAvailable: boolean | null = null;

  private constructor() {}

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  // ── Playwright launch helpers ──────────────────────────────────────────────

  private async launchPlaywrightLocal(): Promise<Browser> {
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--headless=new",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--disable-extensions",
        "--hide-crash-restore-bubble",
        "--window-position=-10000,-10000",
      ],
    });
    this.usingRemote = false;
    console.log("[BrowserManager] Using Playwright (headless)");
    return browser;
  }

  private async connectPlaywrightRemote(endpoint: string): Promise<Browser> {
    console.log("[BrowserManager] Connecting to remote browser endpoint (Playwright).");
    const browser = await chromium.connectOverCDP(endpoint);
    this.usingRemote = true;
    return browser;
  }

  private async getPlaywrightBrowser(): Promise<Browser> {
    if (this.playwrightBrowser && this.playwrightBrowser.isConnected()) {
      return this.playwrightBrowser;
    }
    if (this.playwrightLaunchPromise) {
      return this.playwrightLaunchPromise;
    }

    const endpoint = process.env.BROWSER_ENDPOINT;

    this.playwrightLaunchPromise = (async () => {
      let browser: Browser;
      if (endpoint && !endpoint.includes("YOUR_TOKEN_HERE")) {
        try {
          browser = await this.connectPlaywrightRemote(endpoint);
        } catch (remoteErr) {
          console.warn(
            "[BrowserManager] Remote Playwright browser failed, falling back to local:",
            (remoteErr as Error).message
          );
          browser = await this.launchPlaywrightLocal();
        }
      } else {
        browser = await this.launchPlaywrightLocal();
      }

      this.playwrightBrowser = browser;
      this.playwrightLaunchPromise = null;

      browser.on("disconnected", () => {
        console.warn("[BrowserManager] Playwright browser disconnected. Will relaunch on next request.");
        this.playwrightBrowser = null;
      });

      return browser;
    })().catch((err) => {
      this.playwrightLaunchPromise = null;
      throw err;
    });

    return this.playwrightLaunchPromise;
  }

  // ── Puppeteer launch helper ────────────────────────────────────────────────

  private async getPuppeteerBrowser(): Promise<any> {
    if (this.puppeteerBrowser) {
      // Check the browser is still alive via connected() or process()
      try {
        const isAlive =
          typeof this.puppeteerBrowser.connected === "boolean"
            ? this.puppeteerBrowser.connected
            : !this.puppeteerBrowser.process()?.killed;
        if (isAlive) return this.puppeteerBrowser;
      } catch {
        // If any check throws, treat as disconnected
      }
      this.puppeteerBrowser = null;
    }

    if (this.puppeteerLaunchPromise) return this.puppeteerLaunchPromise;

    this.puppeteerLaunchPromise = (async () => {
      // Dynamic import so Puppeteer is never required when Playwright works
      const puppeteerModule = await import("puppeteer");
      const puppeteer = puppeteerModule.default || puppeteerModule;

      console.log("[BrowserManager] Launching Puppeteer browser.");
      const browser = await (puppeteer as any).launch({
        headless: true,
        executablePath: chromium.executablePath(),
        args: [
          "--headless=new",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--disable-extensions",
          "--hide-crash-restore-bubble",
          "--window-position=-10000,-10000",
        ],
      });

      this.puppeteerBrowser = browser;
      this.puppeteerLaunchPromise = null;
      console.log("[BrowserManager] Using Puppeteer (headless)");

      browser.on("disconnected", () => {
        console.warn("[BrowserManager] Puppeteer browser disconnected. Will relaunch on next request.");
        this.puppeteerBrowser = null;
      });

      return browser;
    })().catch((err) => {
      this.puppeteerLaunchPromise = null;
      throw err;
    });

    return this.puppeteerLaunchPromise;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Get the underlying browser object (Playwright Browser or Puppeteer Browser).
   * Used by callers that need the raw browser for advanced operations.
   * Performs automatic Puppeteer fallback if Playwright is unavailable.
   */
  public async getBrowser(): Promise<any> {
    // If we already know which engine to use, fast-path
    if (this.engine === "playwright") {
      return this.getPlaywrightBrowser();
    }
    if (this.engine === "puppeteer") {
      return this.getPuppeteerBrowser();
    }

    // First call — try Playwright
    try {
      const browser = await this.getPlaywrightBrowser();
      this.engine = "playwright";
      this._playwrightAvailable = true;
      return browser;
    } catch (playwrightErr) {
      console.warn(
        "[BrowserManager] Playwright unavailable — using Puppeteer.",
        (playwrightErr as Error).message
      );
      this._playwrightAvailable = false;
      this.engine = "puppeteer";
      return this.getPuppeteerBrowser();
    }
  }

  /**
   * Create a new browser context.
   * Returns a BrowserContextLike regardless of which engine is active.
   */
  public async newContext(options?: any): Promise<BrowserContextLike> {
    // Determine engine (launches browser if not already running)
    await this.getBrowser();

    if (this.engine === "playwright") {
      let playwrightBrowser = this.playwrightBrowser!;

      // Re-check connectivity (race condition guard)
      if (!playwrightBrowser.isConnected()) {
        this.playwrightBrowser = null;
        try {
          playwrightBrowser = await this.getPlaywrightBrowser();
        } catch {
          // Playwright died on us — pivot to Puppeteer
          console.warn("[BrowserManager] Playwright disconnected — switching to Puppeteer.");
          this._playwrightAvailable = false;
          this.engine = "puppeteer";
          return this.newContext(options);
        }
      }

      const contextOptions: any = {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        ignoreHTTPSErrors: true,
        ...options,
      };
      // Remove our custom flag before passing to Playwright
      const optimizeForScanning = contextOptions.optimizeForScanning;
      delete contextOptions.optimizeForScanning;

      const ctx = await playwrightBrowser.newContext(contextOptions);

      if (optimizeForScanning) {
        await ctx.route("**/*", (route) => {
          const resourceType = route.request().resourceType();
          if (["image", "font", "media"].includes(resourceType)) {
            return route.abort();
          }
          return route.continue();
        });
      }

      return wrapPlaywrightContext(ctx);
    }

    // Puppeteer path
    const puppeteerBrowser = this.puppeteerBrowser!;
    const optimizeForScanning = options?.optimizeForScanning ?? false;
    // createBrowserContext is the modern API (Puppeteer v20+).
    // Older versions used createIncognitoBrowserContext — fall back gracefully.
    const createCtx =
      typeof puppeteerBrowser.createBrowserContext === "function"
        ? puppeteerBrowser.createBrowserContext.bind(puppeteerBrowser)
        : typeof puppeteerBrowser.createIncognitoBrowserContext === "function"
          ? puppeteerBrowser.createIncognitoBrowserContext.bind(puppeteerBrowser)
          : null;

    let incognitoContext: any;
    if (createCtx) {
      incognitoContext = await createCtx();
    } else {
      // Fallback: use the default browser context (no isolation, but functional)
      incognitoContext = puppeteerBrowser.defaultBrowserContext();
    }

    // Set a realistic user-agent on the context level by applying it to each
    // new page via a new-page hook (Puppeteer doesn't support UA at context level)
    const adapter = new PuppeteerContextAdapter(incognitoContext, optimizeForScanning);
    return adapter;
  }

  /**
   * Create a new page (convenience: creates a context then a page).
   * Matches the existing API used by exportService.
   */
  public async newPage(options?: any): Promise<PageLike> {
    const context = await this.newContext(options);
    return context.newPage();
  }

  /**
   * Close all browser instances.
   */
  public async cleanup(): Promise<void> {
    if (this.playwrightBrowser) {
      try {
        await this.playwrightBrowser.close();
      } catch {
        // ignore
      }
      this.playwrightBrowser = null;
    }
    if (this.puppeteerBrowser) {
      try {
        await this.puppeteerBrowser.close();
      } catch {
        // ignore
      }
      this.puppeteerBrowser = null;
    }
    this.engine = null;
  }

  /**
   * Returns true when any browser engine can be launched.
   *
   * Fast-paths:
   *   - If a browser is already running → true
   *   - If Playwright previously failed AND Puppeteer is running → true
   *   - If both previously failed → false (cached)
   */
  public async isAvailable(): Promise<boolean> {
    // A browser context is already alive
    if (this.engine === "playwright" && this.playwrightBrowser?.isConnected()) {
      return true;
    }
    if (this.engine === "puppeteer" && this.puppeteerBrowser) {
      try {
        const alive =
          typeof this.puppeteerBrowser.connected === "boolean"
            ? this.puppeteerBrowser.connected
            : !this.puppeteerBrowser.process()?.killed;
        if (alive) return true;
      } catch {
        // fall through and try to re-launch
      }
    }

    // We haven't tried yet — attempt getBrowser() which tries Playwright first
    // then falls back to Puppeteer automatically
    try {
      await this.getBrowser();
      return true;
    } catch (err) {
      console.warn("[BrowserManager] No browser engine available:", (err as Error).message);
      return false;
    }
  }
}

export const browserManager = BrowserManager.getInstance();
