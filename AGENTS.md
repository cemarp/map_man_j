## Objective
The task is to implement a dual-capture feature for an HVAC Manual J calculation web app. The user inputs a Google Maps URL, and the app extracts building geometry from the map. The goal was to add a toggle on the frontend so the user can seamlessly switch between the regular Map view and Satellite view without losing their drawn building outline polygon or their scroll position over the image.

## Completed Work
1. **Frontend App Updates**:
   - Added missing inputs (skylights, duct load penalty).
   - Added a "Show Satellite View" checkbox toggle that conditionally renders `data.sat_image_url` if checked.
2. **Backend Capture Updates**:
   - Added a `convert_to_satellite_url` function to rewrite the map URL to satellite mode (using `/data=!3m1!1e3`).
   - Replaced `capture_map_screenshot` with `capture_map_screenshots_dual` in `backend/capture.py`.
   - The dual capture function spawns two Playwright pages concurrently, rendering the Map and Satellite views, capturing both and returning both file paths.
3. **Backend API Route Updates**:
   - Updated `ExtractionResponse` to include `sat_image_url`.
   - Updated the `/extract` endpoint in `backend/main.py` to call `capture_map_screenshots_dual` and return both `image_url` and `sat_image_url`.

## Refinements based on review:
- Reverted the viewport changes from 3000x2000 back to 1280x800. Expanding the playwright viewport to 3000x2000 caused Google Maps to compute its view boundary differently resulting in the target coordinates/building no longer being perfectly centered and inside the screenshot bounds. Both backend playwright contexts, api response normalizers, and frontend image container dimensions have been restored to 1280x800.

## Remaining Tasks / Blockers
- None! All tasks are fully implemented, verified via visual E2E playwright testing, and completely resolved.
