## Objective
The task is to implement a dual-capture feature for an HVAC Manual J calculation web app. The user inputs a Google Maps URL, and the app extracts building geometry from the map. The goal was to add a toggle on the frontend so the user can seamlessly switch between the regular Map view and Satellite view without losing their drawn building outline polygon or their scroll position over the image.

## Completed Work
1. **Frontend App Updates**:
   - Expanded image and canvas size to 3000x2000 in `frontend/src/App.tsx`.
   - Added missing inputs (skylights, duct load penalty).
   - Added a "Show Satellite View" checkbox toggle that conditionally renders `data.sat_image_url` if checked.
2. **Backend Capture Updates**:
   - Added a `convert_to_satellite_url` function to rewrite the map URL to satellite mode (using `/data=!3m1!1e3`).
   - Replaced `capture_map_screenshot` with `capture_map_screenshots_dual` in `backend/capture.py`.
   - The dual capture function spawns two Playwright pages concurrently, rendering the Map and Satellite views, capturing both and returning both file paths.
3. **Backend API Route Updates**:
   - Updated `ExtractionResponse` to include `sat_image_url`.
   - Updated the `/extract` endpoint in `backend/main.py` to call `capture_map_screenshots_dual` and return both `image_url` and `sat_image_url`.

## Remaining Tasks / Blockers
- **Debugging Frontend Toggle Logic:** Tests indicate that the checkbox correctly updates state but the image `src` displayed in the frontend is still showing the base `image_url` even when `showSatellite` is true. Need to inspect the conditional logic in `App.tsx` (e.g., `src={http://localhost:8000${showSatellite && data.sat_image_url ? data.sat_image_url : data.image_url}}`) to ensure the state update correctly binds to the `<img>` tag.
- The user requested this to be submitted as-is.
