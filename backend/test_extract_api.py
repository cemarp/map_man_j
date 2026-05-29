import requests
import json
import time

url = "http://localhost:8000/extract"
payload = {
    "url": "https://www.google.com/maps/place/2003+Ellen+Ave,+San+Jose,+CA+95125/@37.2961017,-121.887086,19z/data=!4m6!3m5!1s0x808e33423772f7c5:0x20367eb745bbdfbc!8m2!3d37.2960655!4d-121.8863673!16s%2Fg%2F11c2dhv5c0"
}

print("Sending request to /extract endpoint...")
start_time = time.time()
try:
    response = requests.post(url, json=payload, timeout=90)
    duration = time.time() - start_time
    print(f"Request finished in {duration:.2f} seconds.")
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("Success! Response:")
        print(json.dumps(data, indent=2))
    else:
        print("Error response:")
        print(response.text)
except Exception as e:
    print(f"Failed to connect/send request: {e}")
