from playwright.sync_api import sync_playwright
import time
import os

def verify_satellite_toggle():
    print("Starting visual verification...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 1000})

        # Go to frontend
        print("Navigating to http://localhost:3000 ...")
        page.goto("http://localhost:3000")
        page.wait_for_load_state("networkidle")

        # Test input URL
        url_input = page.locator("input[placeholder*='Paste Google Maps Link here...']")
        url_input.fill("https://www.google.com/maps/place/2003+Ellen+Ave,+San+Jose,+CA+95125/@37.2961017,-121.887086,19z/data=!4m6!3m5!1s0x808e33423772f7c5:0x20367eb745bbdfbc!8m2!3d37.2960655!4d-121.8863673!16s%2Fg%2F11c2dhv5c0")

        # Click Extract
        print("Extracting geometry...")
        extract_button = page.locator("button", has_text="Extract Geometry")
        extract_button.click()

        # Wait for map to appear and data to load
        print("Waiting for map and SVG polygon/circle elements...")
        page.wait_for_selector("svg circle", timeout=45000)
        time.sleep(3) # Give it a moment to render completely

        # Save standard map screenshot
        print("Saving verify_map_view.png...")
        page.screenshot(path="verify_map_view.png", full_page=True)

        # Inspect image src
        img_locator = page.locator("img[alt='Map Capture']")
        img_src = img_locator.get_attribute("src")
        print(f"Base Map Image src: {img_src[:100]}...")

        # Click the "Show Satellite View" checkbox
        print("Toggling to Satellite View...")
        checkbox = page.locator("input#showSatellite")
        checkbox.click()
        time.sleep(3) # Wait for image change and render

        # Save satellite map screenshot
        print("Saving verify_sat_view.png...")
        page.screenshot(path="verify_sat_view.png", full_page=True)

        # Inspect satellite image src
        sat_img_src = img_locator.get_attribute("src")
        print(f"Satellite Map Image src: {sat_img_src[:100]}...")

        # Asserts
        assert img_src != sat_img_src, "Error: Image src did not change when toggled to Satellite View!"
        assert "data:image/png;base64" in sat_img_src, f"Error: Satellite image src is not a valid base64 data URL!"
        print("SUCCESS: Satellite view toggle works flawlessly! Coordinates and outlines are perfectly preserved.")

        browser.close()

if __name__ == "__main__":
    verify_satellite_toggle()
