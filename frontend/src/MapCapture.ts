import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';

export async function captureMapCanvas(
  lat: number,
  lng: number,
  zoom: number,
  showSatellite: boolean
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    // 1. Create a temporary container off-screen
    const tempDiv = document.createElement('div');
    const uniqueId = 'map-capture-' + Math.random().toString(36).substring(2, 9);
    tempDiv.id = uniqueId;
    tempDiv.style.position = 'absolute';
    tempDiv.style.top = '-9999px';
    tempDiv.style.left = '-9999px';
    tempDiv.style.width = '3000px';
    tempDiv.style.height = '2000px';
    tempDiv.style.visibility = 'visible';
    tempDiv.style.zIndex = '-9999';
    document.body.appendChild(tempDiv);

    // 2. Initialize Leaflet Map
    const map = L.map(tempDiv, {
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: false,
      zoomAnimation: false,
      inertia: false
    }).setView([lat, lng], zoom);

    // 3. Add Google Maps tile layer (Map or Satellite view)
    const tileUrl = showSatellite
      ? 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' // Satellite
      : 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'; // Standard Map
      
    const tileLayer = L.tileLayer(tileUrl, {
      crossOrigin: true, // loads tiles with Access-Control-Allow-Origin: * to prevent tainted canvas
      maxZoom: 22
    }).addTo(map);

    // 4. Draw high-fidelity custom SVG Red Search Pin at target lat/lng
    const pinSvg = `
      <svg width="40" height="60" viewBox="0 0 32 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.16 0 0 7.16 0 16C0 28 16 48 16 48C16 48 32 28 32 16C32 7.16 24.84 0 16 0ZM16 22C12.68 22 10 19.32 10 16C10 12.68 12.68 10 16 10C19.32 10 22 12.68 22 16C22 19.32 19.32 22 16 22Z" fill="#EA4335" stroke="white" stroke-width="1"/>
      </svg>
    `;
    const pinIcon = L.divIcon({
      html: pinSvg,
      className: 'custom-red-pin',
      iconSize: [40, 60],
      iconAnchor: [20, 60] // align bottom tip of pin exactly at coordinates
    });
    L.marker([lat, lng], { icon: pinIcon }).addTo(map);

    let isCleanedUp = false;

    // Timeout safety fallback (e.g. if tile loading hangs)
    const timeoutId = setTimeout(async () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      tileLayer.off('load');
      
      try {
        console.log("Tile loading timed out. Capturing current state...");
        const canvas = await html2canvas(tempDiv, {
          useCORS: true,
          allowTaint: false,
          width: 3000,
          height: 2000,
          scale: 1,
          logging: false
        });
        map.remove();
        if (tempDiv.parentNode) {
          document.body.removeChild(tempDiv);
        }
        resolve(canvas);
      } catch (err) {
        map.remove();
        if (tempDiv.parentNode) {
          document.body.removeChild(tempDiv);
        }
        reject(err);
      }
    }, 6000);

    // 5. Wait for all tiles in viewport to fully finish loading
    tileLayer.on('load', async () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      clearTimeout(timeoutId);

      // Small safety delay for tiles to fully render in DOM before capture
      await new Promise(r => setTimeout(r, 600));

      try {
        console.log("Map tiles loaded. Taking local screenshot via html2canvas...");
        const canvas = await html2canvas(tempDiv, {
          useCORS: true,       // Force cross-origin anonymous capture
          allowTaint: false,
          width: 3000,
          height: 2000,
          scale: 1,            // Capture at exact 3000x2000 size
          logging: false
        });

        // Cleanup
        map.remove();
        if (tempDiv.parentNode) {
          document.body.removeChild(tempDiv);
        }
        resolve(canvas);
      } catch (err) {
        // Cleanup
        map.remove();
        if (tempDiv.parentNode) {
          document.body.removeChild(tempDiv);
        }
        reject(err);
      }
    });
  });
}
