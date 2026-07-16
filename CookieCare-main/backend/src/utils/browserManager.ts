import { chromium, Browser, BrowserContext, Page } from "playwright";

class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;
  // Track whether we're using a remote endpoint or local launch
  private usingRemote = false;

  private constructor() {}

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  private async launchLocal(): Promise<Browser> {
    console.log("[BrowserManager] Launching local Chromium browser.");
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        
        
      ],
    });
    this.usingRemote = false;
    return browser;
  }

  private async connectRemote(endpoint: string): Promise<Browser> {
    console.log("[BrowserManager] Connecting to remote browser endpoint.");
    const browser = await chromium.connectOverCDP(endpoint);
    this.usingRemote = true;
    return browser;
  }

  public async getBrowser(): Promise<Browser> {
    // Return existing connected browser
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    // Another caller is already starting the browser — wait for it
    if (this.launchPromise) {
      return this.launchPromise;
    }

    const endpoint = process.env.BROWSER_ENDPOINT;

    this.launchPromise = (async () => {
      let browser: Browser;

      if (endpoint && !endpoint.includes("YOUR_TOKEN_HERE")) {
        try {
          browser = await this.connectRemote(endpoint);
        } catch (remoteErr) {
          console.warn("[BrowserManager] Remote browser failed, falling back to local launch:", (remoteErr as Error).message);
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
    })().catch(err => {
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
  public async newContext(options?: any): Promise<BrowserContext> {
    let browser: Browser;
    try {
      browser = await this.getBrowser();
    } catch (err) {
      // Reset and retry once with a fresh local launch
      this.browser = null;
      this.launchPromise = null;
      browser = await this.getBrowser();
    }

    // If the browser disconnected between getBrowser() and newContext()
    // (race condition), fall back to a fresh local launch
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
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      ignoreHTTPSErrors: true,
      ...options,
    });

    if (options?.optimizeForScanning) {
      await context.route("**/*", (route) => {
        const resourceType = route.request().resourceType();
        // Block heavy resources that aren't needed for cookie scanning
        if (["image", "font", "media"].includes(resourceType)) {
          return route.abort();
        }
        return route.continue();
      });
    }

    return context;
  }

  public async newPage(options?: any): Promise<Page> {
    const context = await this.newContext(options);
    return context.newPage();
  }

  public async cleanup(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (_) {}
      this.browser = null;
    }
  }

  /**
   * Probe whether a Playwright browser can actually be launched or connected.
   *
   * Returns `true` when Playwright is available, `false` when the executable
   * is missing, blocked by Group Policy, or otherwise unlaunchable.
   *
   * The result is cached after the first successful launch so subsequent calls
   * are free once the browser is running.
   */
  private _playwrightAvailable: boolean | null = null;

  public async isAvailable(): Promise<boolean> {
    // Fast path: browser is already running — definitely available.
    if (this.browser && this.browser.isConnected()) {
      this._playwrightAvailable = true;
      return true;
    }

    // Return cached negative result so we don't probe on every request.
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
        (err as Error).message
      );
      this._playwrightAvailable = false;
      return false;
    }
  }
}

export const browserManager = BrowserManager.getInstance();
