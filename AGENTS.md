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

## Architecture Note
- A previous agent completed a major frontend refactor to move the CV extraction logic from the Python backend entirely to the frontend via OpenCV.js. This was an intentional design decision requested by the user and is the accepted architecture moving forward.

## Remaining Tasks / Blockers
- None! All tasks are fully implemented, verified via visual E2E playwright testing, and completely resolved.

## Playwright / E2E Testing Notes (Important)
- The frontend `html2canvas` extraction process uses OpenCV.js (WASM) and DOM traversal, which blocks the main thread.
- **Headless Chrome Timeout Issue:** In standard headless mode, Playwright often times out waiting for `html2canvas` to capture the Map and Satellite images because the Chromium rendering pipeline fails to produce a stable DOM paint state, causing a race condition or outright hang.
- **The Fix:** If you write an End-to-End (E2E) Playwright script to verify the extraction logic, you **must**:
  1. Add explicit waits before triggering the extraction:
     `page.wait_for_load_state("networkidle")` and `page.wait_for_timeout(2000)`.
  2. Run the script in headed mode using an X server. In headless CI or Sandbox environments, use `xvfb-run python3 your_script.py`. Setting `headless=False` ensures a real paint cycle occurs.

## Dependency and Execution Verification Strategies

### 1. Detection of Container & E2E Hangs
* **Attach Browser Console Listeners**: Always attach a console message listener during browser context creation in E2E tests:
  ```python
  page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
  ```
  This immediately catches runtime bundler failures (e.g. `Vite: Failed to resolve import`) or unhandled exceptions that cause silent freezes in headless Chromium.
* **Inspect Live Container Logs**: When a test fails or hangs, check container logs directly rather than relying solely on the script's output:
  ```bash
  docker compose logs frontend --tail 50
  ```
* **Python Output Unbuffering**: In headless background execution tasks (like background Python scripts), run Python with output unbuffering to prevent log caching from hiding failures:
  ```bash
  python -u test_e2e_spreadsheet.py
  # or set environment variable PYTHONUNBUFFERED=1
  ```

### 2. Prevention of Container & E2E Hangs
* **Volume Cache Invalidation on Dependency Changes**: Simply running `docker compose up --build` will reuse cached volume directories (like `/app/node_modules`) and fail to install newly introduced packages. When adding/modifying dependencies in `package.json`, always purge volumes to force a fresh install inside the container:
  ```bash
  docker compose down -v
  docker compose up -d --build
  ```
* **OpenCV / Asset Initialisation Guards**: Avoid using static/arbitrary sleep intervals (e.g., `page.wait_for_timeout(5000)`) for heavy WebAssembly module loads. Instead, expose status hooks (e.g. `window.cvLoaded = true`) in the frontend and use Playwright dynamic state polling:
  ```python
  page.wait_for_function("window.cvLoaded === true", timeout=30000)
  ```
