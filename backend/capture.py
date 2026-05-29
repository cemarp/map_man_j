import re
from playwright.async_api import async_playwright
import urllib.parse
from pydantic import BaseModel
import asyncio

class MapURL(BaseModel):
    url: str

def parse_lat_long(url: str):
    """
    Parses lat/long from a Google Maps URL.
    Format is typically .../@lat,long,zoom...
    """
    decoded = urllib.parse.unquote(url)

    # Try finding zoom first
    match = re.search(r'@([-\d.]+),([-\d.]+),([-\d.]+)z', decoded)
    if match:
        return float(match.group(1)), float(match.group(2)), float(match.group(3))

    match = re.search(r'@([-\d.]+),([-\d.]+)', decoded)
    if match:
        return float(match.group(1)), float(match.group(2)), 19

    # Try finding coordinates in the query params or other path segments
    match = re.search(r'!3d([-\d.]+)!4d([-\d.]+)', decoded)
    if match:
        return float(match.group(1)), float(match.group(2)), 19

    return None, None, 19

async def capture_map_screenshot(url: str, output_path: str = "screenshot.png"):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 3000, 'height': 2000},
            device_scale_factor=2, # Higher res
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        page = await context.new_page()

        # Don't wait for networkidle, it might timeout on maps
        await page.goto(url, wait_until="domcontentloaded")

        # Give it a good amount of time to load tiles and the 3D structures
        print("Waiting for maps to load...")
        await asyncio.sleep(10)

        # Close consent dialogs if they appear
        try:
            # Often Google shows a cookie consent or "Stay on Web" overlay
            buttons = await page.locator("button").all()
            for button in buttons:
                text = await button.text_content()
                if text and ("Accept all" in text or "Agree" in text or "I agree" in text):
                    await button.click()
                    await asyncio.sleep(2)
                    break
        except Exception as e:
            print("No consent dialog found or error:", e)

        print("Taking screenshot...")
        # Take a screenshot
        await page.screenshot(path=output_path, full_page=False)

        await browser.close()
        return output_path
