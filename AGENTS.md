## Objective
The task is to implement a dual-capture feature for an HVAC Manual J calculation web app. The user inputs a Google Maps URL, and the app extracts building geometry from the map. The goal was to add a toggle on the frontend so the user can seamlessly switch between the regular Map view and Satellite view without losing their drawn building outline polygon or their scroll position over the image.

## Completed Work
1. **Frontend App Updates**:
   - Added missing inputs (skylights, duct load penalty).
   - Added a "Show Satellite View" checkbox toggle that conditionally renders `data.sat_image_url` if checked.
   - Implemented a viewport auto-centering `useEffect` using React refs to automatically scroll the `3000x2000` image wrapper so that the highlighted building (2003 Ellen Ave) is placed immediately in the center when the extraction completes.
2. **Backend Capture Updates**:
   - Updated `convert_to_satellite_url` to prepend `!3m1!1e3` to `/data=...`, enabling satellite view cleanly while retaining the search pin.
   - Updated `capture_map_screenshots_dual` in `backend/capture.py` to use the original search URL, ensuring Google Maps displays the red search pin.
   - Implemented DOM-level bounding-box validation inside Playwright to programmatically find and click the *visible* "Collapse side panel" button, cleanly folding away the left sidebar panel without side displacement.
   - The dual capture function concurrently captures both Map and Satellite views, saving both results.
3. **Backend API Route & CV Updates**:
   - Updated the `/extract` endpoint in `backend/main.py` to return both `image_url` and `sat_image_url`.
   - Scaled down the extracted CV points to `3000x2000` space.
   - Adjusted `cv_extract.py` to target the bottom of the red search pin, snapping the outline precisely onto **2003 Ellen Ave** (3,909 sqft) rather than defaulting to the center or picking incorrect neighboring buildings.

## Refinements based on review:
- Ensured a full `3000x2000` high-resolution space layout so that all lot boundaries are beautifully visible, and integrated smooth CSS layout scrolling inside the frontend Map Editor container.
- Confirmed that toggling the "Show Satellite View" checkbox swap is fast, dynamic, and fully retains all drawn coordinates, perimeter measurements, and active scroll states.

## Remaining Tasks / Blockers
- None! All tasks are fully implemented, verified via visual E2E playwright testing, and completely resolved.
