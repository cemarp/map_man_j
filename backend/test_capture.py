import asyncio
from capture import capture_map_screenshot, parse_lat_long

url = "https://www.google.com/maps/place/1950+Ellen+Ave,+San+Jose,+CA+95125/@37.2970351,-121.8873522,19z/data=!4m6!3m5!1s0x808e3369337be797:0x2026101b0ff8a4e4!8m2!3d37.2970906!4d-121.8865381!16s%2Fg%2F11c1yng9fd?entry=ttu&g_ep=EgoyMDI2MDUyMC4wIKXMDSoASAFQAw%3D%3D"
print(parse_lat_long(url))
