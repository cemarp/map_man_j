from playwright.sync_api import sync_playwright

def test_extraction_e2e():
    """
    E2E test verifying that OpenCV.js frontend extraction works.
    Requires running via `xvfb-run` to simulate a headed environment,
    preventing html2canvas DOM lockups in headless mode.
    """
    with sync_playwright() as p:
        # Must be headless=False and use xvfb-run to ensure html2canvas paints correctly
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        try:
            page.goto("http://localhost:3000")
            page.wait_for_selector("text=Auto Manual J Calculator")

            # Allow OpenCV WASM to initialize
            page.wait_for_timeout(5000)

            # Explicit Waits for html2canvas stability
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)

            # Trigger Extraction
            page.fill("input[placeholder='Paste Google Maps Link here...']", "https://www.google.com/maps/@37.7749,-122.4194,20z")
            page.click("button:has-text('Extract Geometry')")

            # Wait for successful extraction (increase timeout for WASM calculation)
            page.wait_for_selector("text=Building Characteristics", timeout=25000)
            print("E2E Extraction Test: SUCCESS")

        except Exception as e:
            print(f"E2E Extraction Test: FAILED - {e}")
            raise
        finally:
            browser.close()

if __name__ == "__main__":
    test_extraction_e2e()
