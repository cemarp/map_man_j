# Auto Manual J Calculator

An automated HVAC Manual J load calculator that extracts building footprints directly from Google Maps URLs and uses dynamic climate data to estimate cooling and heating loads.

## Architecture

*   **Frontend**: React (Vite) + TailwindCSS
*   **Backend**: FastAPI + Playwright (for headless map capture) + OpenCV (for automated polygon extraction)

## Features

*   **Automatic Extraction**: Paste a Google Maps URL, and the backend captures a screenshot and extracts the building footprint using color thresholding.
*   **Interactive SVG Editor**: Drag, add, or right-click to delete vertices on the map to perfectly trace your building.
*   **Climate Defaults**: Automatically fetches Summer/Winter outdoor design temps and outdoor humidity based on the extracted coordinates using Open-Meteo.
*   **Detailed Envelopes**: Add specific windows and doors, each with unique dimensions, U-Values, SHGCs, and orientations. The calculation dynamically incorporates Solar Heat Gain based on orientation.
*   **Import/Export JSON**: Save your progress or load a previous configuration to pick up where you left off.

## Local Development & Deployment

The application is containerized using Docker Compose for easy execution.

### Prerequisites

*   Docker and Docker Compose

### Running the App

1.  Clone this repository.
2.  Run Docker Compose:
    ```bash
    docker-compose up --build
    ```
3.  Access the web interface at `http://localhost:3000`. The FastAPI backend will be available at `http://localhost:8000`.

### Troubleshooting

*   **Linux/Debian Dependencies**: The backend Dockerfile uses `libgl1` and `libglib2.0-0t64` which are required for OpenCV and Playwright on modern Debian-based images (like `trixie`).
*   **Map Load Timeouts**: If extraction fails, it might be due to slow internet connections. The Playwright instance pauses for 10 seconds to allow the Google Maps 3D models to render before capturing.
