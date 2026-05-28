import requests

def get_climate_data(lat: float, lng: float):
    """
    Fetches basic climate design conditions.
    In a production setting, this would query ASHRAE tables or a weather API.
    For this prototype, we'll use a public API (like Open-Meteo) to estimate design conditions.
    """
    # Using Open-Meteo historical data to estimate summer/winter design temperatures
    # We will just get typical max/min temperatures for simplicity.
    url = f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lng}&start_date=2023-01-01&end_date=2023-12-31&daily=temperature_2m_max,temperature_2m_min&timezone=auto"

    try:
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            daily = data.get('daily', {})
            max_temps = daily.get('temperature_2m_max', [])
            min_temps = daily.get('temperature_2m_min', [])

            # Simple estimates for design temps
            # Summer Design: 99% highest temp
            # Winter Design: 99% lowest temp
            if max_temps and min_temps:
                valid_max = [t for t in max_temps if t is not None]
                valid_min = [t for t in min_temps if t is not None]

                valid_max.sort()
                valid_min.sort()

                # ~99th percentile
                summer_design_c = valid_max[int(len(valid_max) * 0.99)]
                winter_design_c = valid_min[int(len(valid_min) * 0.01)]

                # Convert C to F
                summer_design_f = (summer_design_c * 9/5) + 32
                winter_design_f = (winter_design_c * 9/5) + 32

                return {
                    "summer_design_temp": round(summer_design_f, 1),
                    "winter_design_temp": round(winter_design_f, 1),
                    "outdoor_humidity": 50.0  # Estimated generic value
                }
    except Exception as e:
        print(f"Failed to fetch climate data: {e}")

    # Fallback default values
    return {
        "summer_design_temp": 95.0,
        "winter_design_temp": 32.0,
        "outdoor_humidity": 50.0
    }

def get_property_defaults(lat: float, lng: float):
    """
    Estimates intelligent defaults for insulation based on typical property data.
    In production, this would scrape Zillow/Redfin or use a property API.
    For MVP, we'll return average modern defaults.
    """
    return {
        "year_built": 1990,
        "wall_r_value": 13,
        "roof_r_value": 30,
        "window_u_factor": 0.35
    }
