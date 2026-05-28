from playwright.sync_api import sync_playwright
import time

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 1000})

        # Go to frontend
        page.goto("http://localhost:5173")
        page.wait_for_load_state("networkidle")

        # Test input URL
        url_input = page.locator("input[placeholder*='Paste Google Maps Link here...']")
        url_input.fill("https://www.google.com/maps/place/2003+Ellen+Ave,+San+Jose,+CA+95125/@37.2961017,-121.887086,19z/data=!4m6!3m5!1s0x808e33423772f7c5:0x20367eb745bbdfbc!8m2!3d37.2960655!4d-121.8863673!16s%2Fg%2F11c2dhv5c0")

        # Click Extract
        extract_button = page.locator("button", has_text="Extract Geometry")
        extract_button.click()

        # Wait for map to appear and data to load
        page.wait_for_selector("svg circle", timeout=30000)
        time.sleep(2) # Give it a moment to render

        # Take a screenshot
        page.screenshot(path="frontend_verified.png", full_page=True)
        print("Frontend verification completed. Screenshot saved to frontend_verified.png")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
