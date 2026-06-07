from playwright.sync_api import sync_playwright
import time

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Wait for server to start
            time.sleep(5)

            # Go to the app
            page.goto("http://localhost:3000")

            # Take a screenshot of the login/auth modal
            page.screenshot(path="verification/auth_modal.png")
            print("Screenshot taken: auth_modal.png")

            # Check for specific elements
            if page.query_selector("text=PrivSecAI") or page.query_selector("text=LexAES"):
                print("App Title detected")

        except Exception as e:
            print(f"Error during verification: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_frontend()
