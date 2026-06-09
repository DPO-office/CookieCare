import { chromium, Browser, BrowserContext, Page } from "playwright";

class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;

  private constructor() {}

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  public async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (this.launchPromise) {
      return this.launchPromise;
    }

    // Explicitly targeting the system's stable Chrome layer to resolve Linux system library errors
    this.launchPromise = chromium.launch({
      headless: true,
      channel: 'chrome', 
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    }).then(browser => {
      this.browser = browser;
      this.launchPromise = null;

      this.browser.on("disconnected", () => {
        console.warn("[BrowserManager] Browser disconnected.");
        this.browser = null;
      });

      return browser;
    });

    return this.launchPromise;
  }

  public async newContext(options?: any): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    return await browser.newContext(options);
  }

  public async newPage(options?: any): Promise<Page> {
    const context = await this.newContext(options);
    return await context.newPage();
  }

  public async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const browserManager = BrowserManager.getInstance();