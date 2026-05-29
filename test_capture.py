import asyncio
from backend.capture import capture_map_screenshots_dual

async def main():
    url = "https://www.google.com/maps/place/2003+Ellen+Ave,+San+Jose,+CA+95125/@37.2961017,-121.887086,19z/data=!4m6!3m5!1s0x808e336ec6ab8993:0xaf2d40802ca13942!8m2!3d37.2960985!4d-121.8864718!16s%2Fg%2F11c4qk9gz7?entry=ttu&g_ep=EgoyMDI2MDUyNS4wIKXMDSoASAFQAw%3D%3D"
    await capture_map_screenshots_dual(url, "test_map.png", "test_sat.png")

if __name__ == "__main__":
    asyncio.run(main())
