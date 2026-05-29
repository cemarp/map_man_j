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

def convert_to_satellite_url(url: str) -> str:
    """
    Converts a Google Maps URL to satellite view (Earth mode) by appending/editing !1e3 in the data parameter.
    """
    if "/data=" in url:
        if "!1e3" not in url:
            return re.sub(r'(/data=[^/&?]+)', r'\1!1e3', url)
        return url
    else:
        if "?" in url:
            base, query = url.split("?", 1)
            return f"{base.rstrip('/')}/data=!3m1!1e3?{query}"
        elif "#" in url:
            base, fragment = url.split("#", 1)
            return f"{base.rstrip('/')}/data=!3m1!1e3#{fragment}"
        else:
            return f"{url.rstrip('/')}/data=!3m1!1e3"

async def capture_map_screenshots_dual(url: str, output_path: str, sat_output_path: str):
    """
    Spawns Playwright to capture both Map and Satellite views of the same area concurrently.
    """
    sat_url = convert_to_satellite_url(url)
    print(f"Original URL: {url}")
    print(f"Satellite URL: {sat_url}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        async def capture_one(target_url: str, path: str):
            context = await browser.new_context(
                viewport={'width': 1280, 'height': 800},
                device_scale_factor=2, # Higher res
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            page = await context.new_page()
            try:
                # Don't wait for networkidle, it might timeout on maps
                await page.goto(target_url, wait_until="domcontentloaded")

                print(f"Waiting for maps to load for {path}...")
                await asyncio.sleep(10)

                # Close consent dialogs if they appear
                try:
                    buttons = await page.locator("button").all()
                    for button in buttons:
                        text = await button.text_content()
                        if text and ("Accept all" in text or "Agree" in text or "I agree" in text):
                            await button.click()
                            await asyncio.sleep(2)
                            break
                except Exception as e:
                    print("No consent dialog found or error:", e)

                print(f"Taking screenshot to {path}...")
                await page.screenshot(path=path, full_page=False)
            finally:
                await context.close()

        # Run both captures in parallel
        await asyncio.gather(
            capture_one(url, output_path),
            capture_one(sat_url, sat_output_path)
        )

        await browser.close()
        return output_path, sat_output_path
