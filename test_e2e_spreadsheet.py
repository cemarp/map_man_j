import os
import time
from playwright.sync_api import sync_playwright
import openpyxl

def test_spreadsheet_e2e():
    """
    E2E test verifying that spreadsheet export and import works.
    We trigger an extraction to get basic data, export the spreadsheet,
    modify a cell value using openpyxl, and import it back to check if the
    frontend recalculates loads correctly based on the new value.
    """
    with sync_playwright() as p:
        # Launch browser headlessly
        browser = p.chromium.launch(headless=True)
        # Create a new browser context that accepts downloads
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))

        try:
            page.goto("http://localhost:3000")
            page.wait_for_selector("text=Auto Manual J Calculator")

            # Allow OpenCV WASM to initialize
            page.wait_for_timeout(5000)
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)

            # 1. Trigger Extraction
            print("Triggering extraction...")
            page.fill("input[placeholder='Paste Google Maps Link here...']", "https://www.google.com/maps/@37.7749,-122.4194,20z")
            page.click("button:has-text('Extract Geometry')")

            # Wait for extraction to complete
            page.wait_for_selector("text=Building Characteristics", timeout=25000)

            # 2. Get initial cooling load for comparison
            initial_cooling_text = page.locator("span.font-bold.text-lg >> nth=0").inner_text()
            print(f"Initial Cooling Load: {initial_cooling_text}")

            # Verify initial residents count is 3
            initial_residents = page.locator("label:has-text('Number of Occupants') >> .. >> input").input_value()
            assert initial_residents == "2", f"Expected initial residents to be 3, got {initial_residents}"

            # 3. Export Spreadsheet
            print("Triggering spreadsheet export...")
            with page.expect_download() as download_info:
                page.click("button:has-text('Export Spreadsheet')")
            download = download_info.value
            download_path = os.path.join(os.getcwd(), download.suggested_filename)
            download.save_as(download_path)

            assert os.path.exists(download_path), "Spreadsheet did not download successfully."
            print(f"Spreadsheet downloaded to {download_path}")

            # 4. Modify the Spreadsheet (Simulate user tweaking values in LibreOffice)
            print("Modifying the spreadsheet (Changing Residents from 3 to 10)...")
            wb = openpyxl.load_workbook(download_path)
            sheet = wb.active

            # Find the "Residents" row and change its value
            residents_modified = False
            for row in sheet.iter_rows(min_row=1, max_col=2):
                if row[0].value == 'Residents':
                    row[1].value = 10
                    residents_modified = True
                    break

            assert residents_modified, "Could not find 'Residents' parameter in the exported spreadsheet."
            wb.save(download_path)

            # 5. Import the Spreadsheet back
            print("Importing modified spreadsheet...")
            # Playwright handles file inputs gracefully
            file_input = page.locator("input[accept='.xlsx']")
            file_input.set_input_files(download_path)

            # 6. Verify changes in the UI
            page.wait_for_timeout(3000) # Give React a moment to re-render

            new_residents = page.locator("label:has-text('Number of Occupants') >> .. >> input").input_value()
            print(f"New Residents Value in UI: {new_residents}")
            assert new_residents == "10", f"Expected residents to update to 10, got {new_residents}"

            new_cooling_text = page.locator("span.font-bold.text-lg >> nth=0").inner_text()
            print(f"New Cooling Load: {new_cooling_text}")

            assert initial_cooling_text != new_cooling_text, "Cooling load did not update after importing new residents!"
            print("E2E Spreadsheet Test: SUCCESS")

        except Exception as e:
            print(f"E2E Spreadsheet Test: FAILED - {e}")
            raise
        finally:
            browser.close()
            if os.path.exists("manual_j_calculation.xlsx"):
                os.remove("manual_j_calculation.xlsx")

if __name__ == "__main__":
    test_spreadsheet_e2e()
