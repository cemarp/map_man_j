from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import uuid

from capture import parse_lat_long, capture_map_screenshot, MapURL
from cv_extract import extract_building_outline, get_scale_from_lat_zoom
from climate import get_climate_data, get_property_defaults

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("images", exist_ok=True)
app.mount("/images", StaticFiles(directory="images"), name="images")

class ClimateData(BaseModel):
    summer_design_temp: float
    winter_design_temp: float

class PropertyDefaults(BaseModel):
    year_built: int
    wall_r_value: float
    roof_r_value: float
    window_u_factor: float

class ExtractionResponse(BaseModel):
    lat: float
    lng: float
    image_url: str
    polygon: List[Dict[str, int]]
    pixel_area: float
    pixel_perimeter: float
    scale: float
    climate: ClimateData
    defaults: PropertyDefaults
    message: str

@app.post("/extract", response_model=ExtractionResponse)
async def extract_geometry(data: MapURL):
    lat, lng, zoom = parse_lat_long(data.url)
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Could not parse coordinates from URL")

    image_id = str(uuid.uuid4())
    filepath = f"images/{image_id}.png"

    try:
        await capture_map_screenshot(data.url, filepath)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to capture screenshot: {str(e)}")

    try:
        polygon, area, perimeter = extract_building_outline(filepath)
        # Scale down points to 1280x800 space since Playwright used device_scale_factor=2
        polygon = [{"x": int(p["x"] / 2), "y": int(p["y"] / 2)} for p in polygon]
        scale = get_scale_from_lat_zoom(lat, zoom, device_scale_factor=1)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Computer vision failed: {str(e)}")

    climate = get_climate_data(lat, lng)
    defaults = get_property_defaults(lat, lng)

    return ExtractionResponse(
        lat=lat,
        lng=lng,
        image_url=f"/images/{image_id}.png",
        polygon=polygon,
        pixel_area=area,
        pixel_perimeter=perimeter,
        scale=scale,
        climate=ClimateData(**climate),
        defaults=PropertyDefaults(**defaults),
        message="Capture and extraction successful"
    )
