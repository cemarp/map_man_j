import asyncio
from playwright.async_api import async_playwright

async def capture_one(target_url: str, path: str):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
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

            print(f"Taking screenshot to {path}...")
            await page.screenshot(path=path, full_page=False)
        finally:
            await browser.close()

if __name__ == "__main__":
    url = "https://www.google.com/maps/place/2003+Ellen+Ave,+San+Jose,+CA+95125/@37.2961017,-121.887086,19z/data=!4m6!3m5!1s0x808e336ec6ab8993:0xaf2d40802ca13942!8m2!3d37.2960985!4d-121.8864718!16s%2Fg%2F11c4qk9gz7?entry=ttu&g_ep=EgoyMDI2MDUyNS4wIKXMDSoASAFQAw%3D%3D"
    asyncio.run(capture_one(url, "test_1280.png"))
