import { useState, useRef, useEffect } from 'react'
import WindowsDoors from './WindowsDoors'
import type { WindowEntry, DoorEntry, SkylightEntry, DuctSystem, Foundation, Attic, Envelope } from './types'
import { captureMapCanvas } from './MapCapture'
import { extractBuildingOutline, getScaleFromLatZoom, cvAutoDetectSkylights, cvDetectSkylightAtPoint } from './cvEngine'
import { RotateCcw, MapPin, Download, Upload, ZoomIn, ZoomOut, Table } from 'lucide-react'

type Point = { x: number, y: number }

type ExtractionData = {
  lat: number
  lng: number
  image_url: string
  sat_image_url: string
  polygon: Point[]
  pixel_area: number
  pixel_perimeter: number
  scale: number
  climate: {
    summer_design_temp: number
    winter_design_temp: number
    outdoor_humidity: number
  }
  defaults: {
    year_built: number
    wall_r_value: number
    roof_r_value: number
    window_u_factor: number
  }
}

export default function NewApp() {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [data, setData] = useState<ExtractionData | null>(null)
  const [showSatellite, setShowSatellite] = useState(false)

  // User adjustable values
  const [polygons, setPolygons] = useState<Point[][]>([])
  const [enabledFloors, setEnabledFloors] = useState<boolean[]>([true, false, false])
  const [activeFloorIndex, setActiveFloorIndex] = useState(0)
  const [activeNode, setActiveNode] = useState<number | null>(null)
  const [houseHeight, setHouseHeight] = useState(10)
  const [residents, setResidents] = useState(2)

  const [windows, setWindows] = useState<WindowEntry[]>(Array(6).fill(null).map((_, i) => ({
    id: `win-${i}`,
    width: 3,
    height: 5,
    orientation: 'S',
    uValue: 0.35,
    shgc: 0.25,
    description: `Window ${i + 1}`
  })))

  const [doors, setDoors] = useState<DoorEntry[]>([{
    id: 'door-1',
    width: 3,
    height: 6.8,
    uValue: 0.5,
    description: 'Front Door'
  }])

  const [rValues, setRValues] = useState({ wall: 13, roof: 30 })

  // Climate Inputs
  const [indoorSummerTemp, setIndoorSummerTemp] = useState(75)
  const [indoorWinterTemp, setIndoorWinterTemp] = useState(70)
  const [indoorHumidity, setIndoorHumidity] = useState(50)
  const [outdoorSummerTemp, setOutdoorSummerTemp] = useState(95)
  const [outdoorWinterTemp, setOutdoorWinterTemp] = useState(30)
  const [outdoorHumidity, setOutdoorHumidity] = useState(50)

  // New State variables for Manual J Enhancements
  const [skylights, setSkylights] = useState<SkylightEntry[]>([])
  const [ductSystem, setDuctSystem] = useState<DuctSystem>({ location: 'Conditioned Space', insulationRValue: 0, leakage: 'Tight (5%)' })
  const [foundation, setFoundation] = useState<Foundation>({ type: 'Slab', rValue: 0 })
  const [attic, setAttic] = useState<Attic>({ type: 'Vented', rValue: 30 })
  const [envelope, setEnvelope] = useState<Envelope>({ tightness: 'Average', fireplaces: 0 })

  const svgRef = useRef<SVGSVGElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const spreadsheetInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [cvLoaded, setCvLoaded] = useState(false)
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [zoomScale, setZoomScale] = useState(1.0)
  const [interactionMode, setInteractionMode] = useState<'editFootprint' | 'detectSkylight'>('editFootprint')
  const [isBottomOpen, setIsBottomOpen] = useState(true)

  // Dynamically load OpenCV.js inside the browser (Strict Mode safe)
  useEffect(() => {
    if ((window as any).cv) {
      setCvLoaded(true)
      return
    }

    (window as any).cvLoadedStatus = (window as any).cvLoadedStatus || 'not_started';
    (window as any).cvListeners = (window as any).cvListeners || [];

    if ((window as any).cvLoadedStatus === 'loaded') {
      setCvLoaded(true)
      return
    }

    const listener = () => setCvLoaded(true)
    ;(window as any).cvListeners.push(listener)

    if ((window as any).cvLoadedStatus === 'loading') {
      console.log("OpenCV.js script is already loading. Subscribed to load callback.")
      return () => {
        (window as any).cvListeners = ((window as any).cvListeners || []).filter((l: any) => l !== listener)
      }
    }

    console.log("Setting up OpenCV Module hook and initiating load...")
    ;(window as any).cvLoadedStatus = 'loading'

    const Module = {
      onRuntimeInitialized: () => {
        console.log("OpenCV.js runtime initialized in browser!")
        ;(window as any).cvLoadedStatus = 'loaded'
        const listeners = (window as any).cvListeners || []
        listeners.forEach((l: any) => l())
        ;(window as any).cvListeners = []
      }
    };
    (window as any).Module = Module

    const script = document.createElement('script')
    script.id = 'opencv-script'
    script.src = '/opencv.js'
    script.async = true
    script.onload = () => {
      console.log("OpenCV.js script element loaded successfully")
    }
    script.onerror = () => {
      console.error("Failed to load OpenCV.js script")
      ;(window as any).cvLoadedStatus = 'error'
    }
    document.body.appendChild(script)

    return () => {
      (window as any).cvListeners = ((window as any).cvListeners || []).filter((l: any) => l !== listener)
    }
  }, [])

  // Keyboard event listener for adding and deleting polygon vertices
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedNode === null || !data) return

      if (e.key === 'Delete' || e.key === 'Backspace' || e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setPolygons(prev => {
          const currentFloorPolygon = prev[activeFloorIndex] || [];
          if (currentFloorPolygon.length <= 3) return prev;
          const newFloorPolygon = currentFloorPolygon.filter((_, i) => i !== selectedNode);
          const nextSelected = selectedNode >= newFloorPolygon.length ? newFloorPolygon.length - 1 : selectedNode;
          setSelectedNode(nextSelected);

          const newPolygons = [...prev];
          newPolygons[activeFloorIndex] = newFloorPolygon;
          return newPolygons;
        })
      }

      if (e.key.toLowerCase() === 'a' || e.key === 'Insert' || e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setPolygons(prev => {
          const currentFloorPolygon = prev[activeFloorIndex] || [];
          if (currentFloorPolygon.length === 0 || selectedNode >= currentFloorPolygon.length) return prev;

          const nextPolygon = [...currentFloorPolygon];
          const currPt = nextPolygon[selectedNode];
          const nextIdx = (selectedNode + 1) % nextPolygon.length;
          const nextPt = nextPolygon[nextIdx];
          const midpoint = {
            x: Math.round((currPt.x + nextPt.x) / 2),
            y: Math.round((currPt.y + nextPt.y) / 2)
          }
          nextPolygon.splice(selectedNode + 1, 0, midpoint);
          setSelectedNode(selectedNode + 1);

          const newPolygons = [...prev];
          newPolygons[activeFloorIndex] = nextPolygon;
          return newPolygons;
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedNode, polygons, activeFloorIndex, data])

  // Auto-center viewport on the extracted polygon
  useEffect(() => {
    if (data && containerRef.current) {
      let targetX = 1500
      let targetY = 1000

      const primaryPolygon = polygons[0] || (data.polygon && data.polygon.length > 0 ? data.polygon : []);

      if (primaryPolygon && primaryPolygon.length > 0) {
        const xs = primaryPolygon.map(p => p.x)
        const ys = primaryPolygon.map(p => p.y)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        targetX = minX + (maxX - minX) / 2
        targetY = minY + (maxY - minY) / 2
      }

      const container = containerRef.current
      container.scrollLeft = (targetX * zoomScale) - container.clientWidth / 2
      container.scrollTop = (targetY * zoomScale) - container.clientHeight / 2
    }
  }, [data, zoomScale])

  const parseLatLong = (targetUrl: string) => {
    const decoded = decodeURIComponent(targetUrl)

    let match = decoded.match(/!3d([-\d.]+)!4d([-\d.]+)/)
    if (match) {
      let zoom = 19
      const zoomMatch = decoded.match(/@([-\d.]+),([-\d.]+),([-\d.]+)z/)
      if (zoomMatch) {
        zoom = parseFloat(zoomMatch[3])
      }
      return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), zoom }
    }

    match = decoded.match(/@([-\d.]+),([-\d.]+),([-\d.]+)z/)
    if (match) {
      return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), zoom: parseFloat(match[3]) }
    }

    match = decoded.match(/@([-\d.]+),([-\d.]+)/)
    if (match) {
      return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), zoom: 19 }
    }

    return { lat: null, lng: null, zoom: 19 }
  }

  const handleExtract = async () => {
    if (!url) return
    if (!cvLoaded) {
      setError("OpenCV.js is still loading in the browser. Please wait a few seconds.")
      return
    }
    setLoading(true)
    setError("")

    try {
      const { lat, lng, zoom } = parseLatLong(url)
      if (lat === null || lng === null) {
        throw new Error("Could not parse coordinates from the pasted Google Maps URL. Please check the link.")
      }

      console.log(`Parsed coordinates: lat=${lat}, lng=${lng}, zoom=${zoom}`)

      console.log("Rendering and capturing standard Map tile layer...")
      const mapCanvas = await captureMapCanvas(lat, lng, zoom, false)

      console.log("Rendering and capturing Satellite tile layer...")
      const satCanvas = await captureMapCanvas(lat, lng, zoom, true)

      const imageUrl = mapCanvas.toDataURL('image/png')
      const satImageUrl = satCanvas.toDataURL('image/png')

      console.log("Processing standard map canvas via in-browser OpenCV.js engine...")
      const { polygon: extractedPolygon, area, perimeter } = extractBuildingOutline(mapCanvas)

      const scale = getScaleFromLatZoom(lat, zoom)

      const metadataRes = await fetch(`http://localhost:8000/metadata?lat=${lat}&lng=${lng}&zoom=${zoom}`)
      if (!metadataRes.ok) {
        throw new Error("Failed to load climate metadata from backend")
      }
      const metadata = await metadataRes.json()

      const responseData: ExtractionData = {
        lat,
        lng,
        image_url: imageUrl,
        sat_image_url: satImageUrl,
        polygon: extractedPolygon,
        pixel_area: area,
        pixel_perimeter: perimeter,
        scale,
        climate: {
          summer_design_temp: metadata.climate.summer_design_temp,
          winter_design_temp: metadata.climate.winter_design_temp,
          outdoor_humidity: metadata.climate.outdoor_humidity
        },
        defaults: {
          year_built: metadata.defaults.year_built,
          wall_r_value: metadata.defaults.wall_r_value,
          roof_r_value: metadata.defaults.roof_r_value,
          window_u_factor: metadata.defaults.window_u_factor
        }
      }

      setData(responseData)
      setPolygons([extractedPolygon])
      setEnabledFloors([true, false, false])
      setActiveFloorIndex(0)
      setOutdoorSummerTemp(metadata.climate.summer_design_temp)
      setOutdoorWinterTemp(metadata.climate.winter_design_temp)
      setOutdoorHumidity(metadata.climate.outdoor_humidity)
      setRValues({
        wall: metadata.defaults.wall_r_value,
        roof: metadata.defaults.roof_r_value
      })
      setWindows(prev => prev.map(w => ({ ...w, uValue: metadata.defaults.window_u_factor })))

    } catch (err: any) {
      console.error(err)
      setError(err.message || "Failed to extract map outline")
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setUrl("")
    setError("")
    setData(null)
    setPolygons([])
    setEnabledFloors([true, false, false])
    setActiveFloorIndex(0)
  }

  const calculateGeometries = (pts: Point[], scale: number) => {
    if (pts.length < 3) return { area: 0, perimeter: 0 }

    let area = 0
    let perimeter = 0

    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length
      area += pts[i].x * pts[j].y
      area -= pts[j].x * pts[i].y

      const dx = pts[j].x - pts[i].x
      const dy = pts[j].y - pts[i].y
      perimeter += Math.sqrt(dx*dx + dy*dy)
    }

    area = Math.abs(area) / 2
    return {
      area: area * (scale * scale),
      perimeter: perimeter * scale
    }
  }

  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    e.stopPropagation()
    if (e.button === 2) {
      e.preventDefault()
      const currentFloorPolygon = polygons[activeFloorIndex] || [];
      if (currentFloorPolygon.length > 3) {
        setPolygons(prev => {
          const newFloorPolygon = currentFloorPolygon.filter((_, i) => i !== index);
          const nextSelected = index >= newFloorPolygon.length ? newFloorPolygon.length - 1 : index;
          setSelectedNode(nextSelected);

          const newPolygons = [...prev];
          newPolygons[activeFloorIndex] = newFloorPolygon;
          return newPolygons;
        })
      }
      return
    }
    setActiveNode(index)
    setSelectedNode(index)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeNode === null || !svgRef.current) return

    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY

    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse())

    const boundedX = Math.max(0, Math.min(3000, svgP.x))
    const boundedY = Math.max(0, Math.min(2000, svgP.y))

    setPolygons(prev => {
      const currentFloorPolygon = prev[activeFloorIndex] || [];
      const nextPolygon = [...currentFloorPolygon];
      nextPolygon[activeNode] = { x: Math.round(boundedX), y: Math.round(boundedY) };
      const newPolygons = [...prev];
      newPolygons[activeFloorIndex] = nextPolygon;
      return newPolygons;
    });
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setActiveNode(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleSvgClick = async (e: React.MouseEvent) => {
    if (!svgRef.current) return
    if ((e.target as any).tagName === 'circle') return

    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY

    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse())
    const newPt = { x: Math.round(svgP.x), y: Math.round(svgP.y) }

    if (interactionMode === 'detectSkylight') {
        if (!data?.sat_image_url) return;
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = data.sat_image_url;
        await new Promise(r => img.onload = r);

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, 0, 0);
            const skylight = cvDetectSkylightAtPoint(canvas, newPt, data.scale);
            if (skylight) {
                setSkylights(prev => [...prev, skylight]);
            } else {
                alert("No valid skylight detected near that click point.");
            }
        }
        return;
    }

    setPolygons(prev => {
      const currentFloorPolygon = prev[activeFloorIndex] || [];

      if (currentFloorPolygon.length === 0) {
         const s = 30;
         const defaultSquare = [
            { x: newPt.x - s, y: newPt.y - s },
            { x: newPt.x + s, y: newPt.y - s },
            { x: newPt.x + s, y: newPt.y + s },
            { x: newPt.x - s, y: newPt.y + s }
         ];
         const newPolygons = [...prev];
         newPolygons[activeFloorIndex] = defaultSquare;
         setSelectedNode(0);
         return newPolygons;
      }

      const nextPolygon = [...currentFloorPolygon, newPt]
      const newPolygons = [...prev]
      newPolygons[activeFloorIndex] = nextPolygon
      setSelectedNode(nextPolygon.length - 1)
      return newPolygons
    })
  }

  const handleToggleFloor = (floorIndex: number, enabled: boolean) => {
    setEnabledFloors(prev => {
        const next = [...prev];
        next[floorIndex] = enabled;

        if (enabled) {
            if (floorIndex === 2) next[1] = true;

            setPolygons(currPolys => {
                if (!currPolys[floorIndex] || currPolys[floorIndex].length === 0) {
                    const newPolys = [...currPolys];
                    let copyFrom = 0;
                    for (let i = floorIndex - 1; i >= 0; i--) {
                        if (next[i] && currPolys[i] && currPolys[i].length > 0) {
                            copyFrom = i;
                            break;
                        }
                    }
                    newPolys[floorIndex] = currPolys[copyFrom] ? [...currPolys[copyFrom]] : [];
                    return newPolys;
                }
                return currPolys;
            });

            setActiveFloorIndex(floorIndex);
            setSelectedNode(null);
        } else {
            if (floorIndex === 1) next[2] = false;

            if (activeFloorIndex === floorIndex || (floorIndex === 1 && activeFloorIndex === 2)) {
                let fallbackFloor = 0;
                for (let i = floorIndex - 1; i >= 0; i--) {
                    if (next[i]) {
                        fallbackFloor = i;
                        break;
                    }
                }
                setActiveFloorIndex(fallbackFloor);
                setSelectedNode(null);
            }
        }

        return next;
    });
  }

  const handleRescanSkylights = async () => {
      if (!data?.sat_image_url) return;
      setLoading(true);
      try {
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.src = data.sat_image_url;
          await new Promise(r => img.onload = r);

          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(img, 0, 0);
              const roofPolygon = polygons[polygons.length - 1] || [];
              const detected = cvAutoDetectSkylights(canvas, roofPolygon, data.scale);
              if (detected.length > 0) {
                  setSkylights(prev => [...prev, ...detected]);
                  alert(`Successfully detected ${detected.length} skylights!`);
              } else {
                  alert("No distinct skylights were automatically detected.");
              }
          }
      } finally {
          setLoading(false);
      }
  }

  const activePolyStr = (polygons[activeFloorIndex] || []).map(p => `${p.x},${p.y}`).join(" ")
  const geom = data ? calculateGeometries(polygons[0] || [], data.scale) : { area: 0, perimeter: 0 }

  const floorColors = [
      { fill: "rgba(59, 130, 246, 0.2)", stroke: "#3b82f6" }, // Blue
      { fill: "rgba(249, 115, 22, 0.2)", stroke: "#f97316" }, // Orange
      { fill: "rgba(168, 85, 247, 0.2)", stroke: "#a855f7" }  // Purple
  ];

  const calculateLoad = () => {
    if (!data) return null

    const dtCooling = outdoorSummerTemp - indoorSummerTemp
    const dtHeating = indoorWinterTemp - outdoorWinterTemp

    let highestFloorPoly = polygons[0] || [];
    for (let i = polygons.length - 1; i >= 0; i--) {
        if (enabledFloors[i] && polygons[i] && polygons[i].length >= 3) {
            highestFloorPoly = polygons[i];
            break;
        }
    }
    const roofAreaGeom = calculateGeometries(highestFloorPoly, data.scale);

    let totalWallPerimeter = 0;
    polygons.forEach((pts, i) => {
        if (enabledFloors[i] && pts && pts.length >= 3) {
            totalWallPerimeter += calculateGeometries(pts, data.scale).perimeter;
        }
    });
    if (totalWallPerimeter === 0 && geom.perimeter > 0) totalWallPerimeter = geom.perimeter;

    const wallArea = totalWallPerimeter * houseHeight;
    const windowAreaTotal = windows.reduce((sum, w) => sum + (w.width * w.height), 0)
    const doorAreaTotal = doors.reduce((sum, d) => sum + (d.width * d.height), 0)
    const netWallArea = Math.max(0, wallArea - windowAreaTotal - doorAreaTotal)
    const roofArea = roofAreaGeom.area

    const skylightAreaTotal = skylights.reduce((sum, s) => sum + (s.width * s.height), 0)
    const netRoofArea = Math.max(0, roofArea - skylightAreaTotal)

    const wallU = rValues.wall > 0 ? 1 / rValues.wall : 0
    const roofU = attic.rValue > 0 ? 1 / attic.rValue : 0

    const foundationU = foundation.rValue > 0 ? 1 / foundation.rValue : (foundation.type === 'Slab' ? 1.5 : 0.5)

    const sensibleWallCool = netWallArea * wallU * dtCooling

    let sensibleRoofCool = netRoofArea * roofU * dtCooling
    if (attic.type === 'Vented') {
        sensibleRoofCool = netRoofArea * roofU * (dtCooling + 20)
    } else if (attic.type === 'No Attic') {
        sensibleRoofCool = netRoofArea * roofU * (dtCooling + 10)
    }

    const sensibleFoundationCool = foundation.type === 'Slab'
        ? geom.perimeter * foundationU * (dtCooling * 0.5)
        : geom.area * foundationU * (dtCooling * 0.5)

    const sensibleWindowCool = windows.reduce((sum, w) => {
      const area = w.width * w.height
      const conduction = area * w.uValue * dtCooling
      let solarFactor = 30
      if (['E', 'W'].includes(w.orientation)) solarFactor = 60
      if (['SE', 'SW', 'S'].includes(w.orientation)) solarFactor = 45

      if (w.overhangDepth && w.overhangDepth > 0) {
        let shadeFactor = Math.min(0.5, w.overhangDepth / w.height)
        solarFactor = solarFactor * (1 - shadeFactor)
      }

      const solarGain = area * w.shgc * solarFactor
      return sum + conduction + solarGain
    }, 0)

    const sensibleSkylightCool = skylights.reduce((sum, s) => {
        const area = s.width * s.height
        const conduction = area * s.uValue * dtCooling
        const solarGain = area * s.shgc * 70
        return sum + conduction + solarGain
    }, 0)

    const sensibleDoorCool = doors.reduce((sum, d) => {
      const area = d.width * d.height
      return sum + (area * d.uValue * dtCooling)
    }, 0)

    const sensibleInternalCool = residents * 230
    const totalSensibleCooling = sensibleWallCool + sensibleRoofCool + sensibleFoundationCool + sensibleWindowCool + sensibleSkylightCool + sensibleDoorCool + sensibleInternalCool

    const latentInternalCool = residents * 200

    let totalVolume = 0;
    polygons.forEach((pts, i) => {
        if (enabledFloors[i] && pts && pts.length >= 3) {
            totalVolume += calculateGeometries(pts, data.scale).area * houseHeight;
        }
    });
    if (totalVolume === 0) totalVolume = geom.area * houseHeight;

    const volume = totalVolume;

    let ach = 0.5
    if (envelope.tightness === 'Tight') ach = 0.3
    if (envelope.tightness === 'Loose') ach = 0.8
    ach += (envelope.fireplaces * 0.1)

    const humDiff = Math.max(0, outdoorHumidity - indoorHumidity)
    const cfm = (volume * ach) / 60
    const latentInfiltrationCool = cfm * 0.68 * (humDiff * 0.5)

    const totalLatentCooling = latentInternalCool + latentInfiltrationCool
    const totalCooling = totalSensibleCooling + totalLatentCooling

    const heatWall = netWallArea * wallU * dtHeating
    const heatRoof = netRoofArea * roofU * dtHeating

    const heatFoundation = foundation.type === 'Slab'
        ? geom.perimeter * foundationU * (dtHeating * 0.5)
        : geom.area * foundationU * (dtHeating * 0.5)

    const heatWindow = windows.reduce((sum, w) => {
      const area = w.width * w.height
      return sum + (area * w.uValue * dtHeating)
    }, 0)

    const heatSkylight = skylights.reduce((sum, s) => {
        const area = s.width * s.height
        return sum + (area * s.uValue * dtHeating)
    }, 0)

    const heatDoor = doors.reduce((sum, d) => {
      const area = d.width * d.height
      return sum + (area * d.uValue * dtHeating)
    }, 0)

    const heatInfiltration = 1.08 * cfm * dtHeating

    let totalHeating = heatWall + heatRoof + heatFoundation + heatWindow + heatSkylight + heatDoor + heatInfiltration

    let ductMultiplier = 1.0
    if (ductSystem.location === 'Attic' || ductSystem.location === 'Crawlspace') {
        ductMultiplier += 0.10
        if (ductSystem.leakage === 'Average (10%)') ductMultiplier += 0.05
        else if (ductSystem.leakage === 'Leaky (15%)') ductMultiplier += 0.10

        if (ductSystem.insulationRValue > 0) {
            ductMultiplier -= (ductSystem.insulationRValue * 0.005)
        }
    }
    ductMultiplier = Math.max(1.0, ductMultiplier)

    const finalCooling = totalCooling * ductMultiplier
    const finalCoolingSensible = totalSensibleCooling * ductMultiplier
    const finalCoolingLatent = totalLatentCooling * ductMultiplier
    const finalHeating = totalHeating * ductMultiplier

    // Compute totals for all stories
    let totalAreaAll = 0;
    polygons.forEach((pts, i) => {
        if (enabledFloors[i] && pts && pts.length >= 3) {
            totalAreaAll += calculateGeometries(pts, data.scale).area;
        }
    });
    if (totalAreaAll === 0) totalAreaAll = geom.area;

    let totalPerimeterAll = 0;
    polygons.forEach((pts, i) => {
        if (enabledFloors[i] && pts && pts.length >= 3) {
            totalPerimeterAll += calculateGeometries(pts, data.scale).perimeter;
        }
    });
    if (totalPerimeterAll === 0) totalPerimeterAll = geom.perimeter;

    return {
      cooling: Math.round(finalCooling),
      coolingSensible: Math.round(finalCoolingSensible),
      coolingLatent: Math.round(finalCoolingLatent),
      heating: Math.round(finalHeating),
      tons: (finalCooling / 12000).toFixed(1),
      totalArea: Math.round(totalAreaAll),
      totalPerimeter: Math.round(totalPerimeterAll)
    }
  }

  const loads = calculateLoad()

  const handleExport = () => {
    if (!data) return
    const exportData = {
      sourceData: data,
      state: {
        url,
        polygons,
        enabledFloors,
        houseHeight,
        residents,
        windows,
        doors,
        skylights,
        ductSystem,
        foundation,
        attic,
        envelope,
        rValues,
        indoorSummerTemp,
        indoorWinterTemp,
        indoorHumidity,
        outdoorSummerTemp,
        outdoorWinterTemp,
        outdoorHumidity
      },
      calculation: {
        geometry: geom,
        loads
      }
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'manual_j_export.json'
    link.click()
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string)
        if (imported.sourceData && imported.state) {
          setData(imported.sourceData)
          setUrl(imported.state.url)

          if (imported.state.polygons) {
             setPolygons(imported.state.polygons)
          } else if (imported.state.polygon) {
             setPolygons([imported.state.polygon])
          } else {
             setPolygons([])
          }

          if (imported.state.enabledFloors) {
             setEnabledFloors(imported.state.enabledFloors)
          } else {
             const newEnabled = [true, false, false]
             if (imported.state.polygons && imported.state.polygons.length > 1) newEnabled[1] = true
             if (imported.state.polygons && imported.state.polygons.length > 2) newEnabled[2] = true
             setEnabledFloors(newEnabled)
          }

          setHouseHeight(imported.state.houseHeight)
          setWindows(imported.state.windows || [])
          setDoors(imported.state.doors || [])
          setSkylights(imported.state.skylights || [])
          if (imported.state.ductSystem) setDuctSystem(imported.state.ductSystem)
          if (imported.state.foundation) setFoundation(imported.state.foundation)
          if (imported.state.attic) setAttic(imported.state.attic)
          if (imported.state.envelope) setEnvelope(imported.state.envelope)
          setRValues(imported.state.rValues)
          setIndoorSummerTemp(imported.state.indoorSummerTemp)
          setIndoorWinterTemp(imported.state.indoorWinterTemp)
          setIndoorHumidity(imported.state.indoorHumidity)
          if (imported.state.outdoorSummerTemp !== undefined) setOutdoorSummerTemp(imported.state.outdoorSummerTemp)
          if (imported.state.outdoorWinterTemp !== undefined) setOutdoorWinterTemp(imported.state.outdoorWinterTemp)
          if (imported.state.outdoorHumidity !== undefined) setOutdoorHumidity(imported.state.outdoorHumidity)
        }
      } catch (err) {
        alert("Failed to parse JSON")
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSpreadsheetImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { handleSpreadsheetImport } = await import("./utils/spreadsheetExport");
      const currentState = {
        indoorSummerTemp, outdoorSummerTemp, indoorHumidity, outdoorHumidity,
        indoorWinterTemp, outdoorWinterTemp, residents, houseHeight,
        rValues, attic, foundation, windows, doors, skylights
      };

      const newState = await handleSpreadsheetImport(file, currentState);

      setIndoorSummerTemp(newState.indoorSummerTemp);
      setOutdoorSummerTemp(newState.outdoorSummerTemp);
      setIndoorHumidity(newState.indoorHumidity);
      setOutdoorHumidity(newState.outdoorHumidity);
      setIndoorWinterTemp(newState.indoorWinterTemp);
      setOutdoorWinterTemp(newState.outdoorWinterTemp);
      setResidents(newState.residents);
      setHouseHeight(newState.houseHeight);
      setRValues(newState.rValues);
      setAttic(newState.attic);
      setFoundation(newState.foundation);
      setWindows(newState.windows);
      setDoors(newState.doors);
      setSkylights(newState.skylights);

      if (spreadsheetInputRef.current) spreadsheetInputRef.current.value = '';
    } catch (err) {
      alert("Error importing spreadsheet: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const triggerSpreadsheetExport = async () => {
    if (!data) return
    const { handleSpreadsheetExport } = await import("./utils/spreadsheetExport");
    const stateObj = {
      indoorSummerTemp, outdoorSummerTemp, indoorHumidity, outdoorHumidity,
      indoorWinterTemp, outdoorWinterTemp, residents, houseHeight,
      rValues, attic, foundation, windows, doors, skylights
    };
    const computedObj = {
      totalArea: calculateGeometries(polygons[0] || [], data.scale).area,
      wallArea: (calculateGeometries(polygons[0] || [], data.scale).perimeter || geom.perimeter || 0) * houseHeight,
      roofArea: calculateGeometries(polygons[0] || [], data.scale).area
    };
    handleSpreadsheetExport({
      sourceData: data,
      state: stateObj,
      computed: computedObj
    });
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans select-none">
      {/* Header bar */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/85 backdrop-blur-sm flex-shrink-0 z-20">
        <div className="flex items-center gap-2 mr-4">
          <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center border border-primary/30">
            <MapPin className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h1 className="text-xs font-black tracking-widest uppercase text-foreground leading-none">HVAC Load Calc</h1>
            <p className="text-[9px] text-muted-foreground font-semibold leading-none mt-0.5">Manual J Engine</p>
          </div>
        </div>

        <div className="flex-1 flex items-center gap-2 max-w-2xl">
          <input
            type="text"
            placeholder="Paste Google Maps URL e.g. https://www.google.com/maps/@37.7749,-122.4194,20z"
            className="flex-1 h-7 text-xs bg-muted/30 border border-border rounded px-2.5 font-mono text-foreground focus:outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/50"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
          />
          <button
            onClick={handleExtract}
            disabled={loading}
            className="h-7 text-xs px-3.5 bg-primary text-primary-foreground font-bold rounded shadow hover:bg-primary/95 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            {loading ? (
              <>
                <span className="animate-spin text-[10px]">&#9696;</span>
                Extracting...
              </>
            ) : "Extract Footprint"}
          </button>
          <button
            onClick={handleReset}
            className="h-7 w-7 flex items-center justify-center hover:bg-muted border border-border rounded text-muted-foreground hover:text-foreground transition-all cursor-pointer shrink-0"
            title="Reset"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <a
            href="#/"
            className="h-7 text-xs px-3 bg-secondary text-secondary-foreground hover:bg-secondary-border border border-border rounded font-bold transition-all flex items-center justify-center"
          >
            Switch to Classic UI
          </a>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {data && (
              <span className="font-mono bg-muted/30 px-2 py-0.5 rounded border border-border text-foreground">
                {data.lat.toFixed(5)}, {data.lng.toFixed(5)}
              </span>
            )}
            {loads && (
              <span className="text-primary font-black bg-primary/10 px-2.5 py-0.5 rounded border border-primary/20">
                {loads.tons} Tons AC
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main content grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Left: Settings */}
        <aside className="w-56 flex-shrink-0 border-r border-border bg-sidebar overflow-y-auto flex flex-col p-3 gap-4">
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-primary">Parameters</h2>
            <p className="text-[10px] text-muted-foreground">Envelope & Design defaults</p>
          </div>

          {/* Occupancy */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Occupants</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Residents</label>
              <input
                type="number"
                min={1}
                max={20}
                value={residents}
                onChange={(e) => setResidents(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Foundation */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Foundation</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Type</label>
                <select
                  value={foundation.type}
                  onChange={(e) => setFoundation({ ...foundation, type: e.target.value as any })}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-1.5 text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="Slab">Slab-on-grade</option>
                  <option value="Crawlspace">Crawlspace</option>
                  <option value="Basement">Basement</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Insulation R-Value</label>
                <input
                  type="number"
                  value={foundation.rValue}
                  onChange={(e) => setFoundation({ ...foundation, rValue: Number(e.target.value) })}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </div>

          {/* Attic */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Attic</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Configuration</label>
                <select
                  value={attic.type}
                  onChange={(e) => setAttic({ ...attic, type: e.target.value as any })}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-1.5 text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="Vented">Vented Attic</option>
                  <option value="Unvented">Unvented Attic</option>
                  <option value="No Attic">No Attic</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Insulation R-Value</label>
                <input
                  type="number"
                  value={attic.rValue}
                  onChange={(e) => setAttic({ ...attic, rValue: Number(e.target.value) })}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </div>

          {/* Duct System */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Duct System</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Location</label>
                <select
                  value={ductSystem.location}
                  onChange={(e) => setDuctSystem({ ...ductSystem, location: e.target.value as any })}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-1.5 text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="Conditioned Space">Conditioned Space</option>
                  <option value="Attic">Attic</option>
                  <option value="Crawlspace">Crawlspace</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Leakage</label>
                <select
                  value={ductSystem.leakage}
                  onChange={(e) => setDuctSystem({ ...ductSystem, leakage: e.target.value as any })}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-1.5 text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="Tight (5%)">Tight (5%)</option>
                  <option value="Average (10%)">Average (10%)</option>
                  <option value="Leaky (15%)">Leaky (15%)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Insulation R-Value</label>
                <input
                  type="number"
                  value={ductSystem.insulationRValue}
                  onChange={(e) => setDuctSystem({ ...ductSystem, insulationRValue: Number(e.target.value) })}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </div>

          {/* Envelope & Defaults */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Envelope</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Tightness</label>
                <select
                  value={envelope.tightness}
                  onChange={(e) => setEnvelope({ ...envelope, tightness: e.target.value as any })}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-1.5 text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="Tight">Tight</option>
                  <option value="Average">Average</option>
                  <option value="Loose">Loose</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Fireplaces</label>
                <input
                  type="number"
                  value={envelope.fireplaces}
                  onChange={(e) => setEnvelope({ ...envelope, fireplaces: Number(e.target.value) })}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Wall R-Value</label>
                <input
                  type="number"
                  value={rValues.wall}
                  onChange={(e) => setRValues({ ...rValues, wall: Number(e.target.value) })}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </div>

          {/* Climate Design Inputs */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Climate Design</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Outdoor Summer (°F)</label>
                <input
                  type="number"
                  step="0.1"
                  value={outdoorSummerTemp}
                  onChange={(e) => setOutdoorSummerTemp(Number(e.target.value))}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Outdoor Winter (°F)</label>
                <input
                  type="number"
                  step="0.1"
                  value={outdoorWinterTemp}
                  onChange={(e) => setOutdoorWinterTemp(Number(e.target.value))}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Outdoor Humidity (%)</label>
                <input
                  type="number"
                  value={outdoorHumidity}
                  onChange={(e) => setOutdoorHumidity(Number(e.target.value))}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Indoor Summer (°F)</label>
                <input
                  type="number"
                  value={indoorSummerTemp}
                  onChange={(e) => setIndoorSummerTemp(Number(e.target.value))}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Indoor Winter (°F)</label>
                <input
                  type="number"
                  value={indoorWinterTemp}
                  onChange={(e) => setIndoorWinterTemp(Number(e.target.value))}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Indoor Humidity (%)</label>
                <input
                  type="number"
                  value={indoorHumidity}
                  onChange={(e) => setIndoorHumidity(Number(e.target.value))}
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground focus:outline-none"
                />
              </div>
            </div>
          </div>
        </aside>

        {/* Center Panel: Map and Windows/Doors collapsible drawer */}
        <main className="flex-1 flex flex-col overflow-hidden bg-background relative">
          {error && (
            <div className="absolute top-2 left-2 right-2 bg-destructive/15 border border-destructive/20 text-destructive text-xs py-2 px-3 rounded z-30">
              {error}
            </div>
          )}

          {/* SVG Map Editor Area */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Overlay controller bar */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
              {/* Mode toggler */}
              <div className="flex bg-muted/50 p-0.5 rounded border border-border">
                <button
                  onClick={() => setInteractionMode('editFootprint')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${interactionMode === 'editFootprint' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Edit Footprint
                </button>
                <button
                  onClick={() => { setInteractionMode('detectSkylight'); setShowSatellite(true); }}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${interactionMode === 'detectSkylight' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Click map to auto-detect a skylight at location"
                >
                  Detect Skylight
                </button>
              </div>

              {/* Zoom control bar */}
              <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded border border-border">
                <button
                  onClick={() => setZoomScale(z => Math.max(0.25, z - 0.25))}
                  className="w-5 h-5 flex items-center justify-center border border-border rounded bg-card hover:bg-muted text-foreground font-bold select-none text-[10px] shadow-sm transition-colors cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-black text-foreground w-10 text-center select-none font-mono">
                  {Math.round(zoomScale * 100)}%
                </span>
                <button
                  onClick={() => setZoomScale(z => Math.min(3.0, z + 0.25))}
                  className="w-5 h-5 flex items-center justify-center border border-border rounded bg-card hover:bg-muted text-foreground font-bold select-none text-[10px] shadow-sm transition-colors cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setZoomScale(1.0)}
                  className="text-[9px] px-1.5 py-0.5 border border-border rounded bg-card hover:bg-muted text-muted-foreground font-bold select-none shadow-sm transition-colors cursor-pointer"
                  title="Reset Zoom"
                >
                  Reset
                </button>
              </div>

              {/* Satellite check */}
              <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded border border-border">
                <input
                  type="checkbox"
                  id="sat-new"
                  checked={showSatellite}
                  onChange={e => setShowSatellite(e.target.checked)}
                  className="w-3 h-3 cursor-pointer accent-primary"
                />
                <label htmlFor="sat-new" className="text-[10px] font-bold cursor-pointer text-foreground select-none">
                  Satellite
                </label>
              </div>
            </div>

            {/* Bottom info banner */}
            {data && polygons[activeFloorIndex] && polygons[activeFloorIndex].length > 0 && (
              <div className="absolute bottom-2 left-2 z-10 bg-background/85 backdrop-blur-sm border border-border rounded px-2.5 py-1 text-[9px] text-muted-foreground flex gap-3 shadow-md border-primary/20">
                <span><strong className="text-foreground">D / Del</strong>: Remove Node</span>
                <span className="text-border">|</span>
                <span><strong className="text-foreground">A / N</strong>: Add Midpoint</span>
                <span className="text-border">|</span>
                <span><strong className="text-foreground">Right-Click</strong>: Quick Delete</span>
              </div>
            )}

            {/* Canvas viewport container */}
            <div
              ref={containerRef}
              className={`w-full h-full overflow-auto bg-card select-none relative ${interactionMode === 'detectSkylight' ? 'cursor-crosshair' : ''}`}
            >
              {data ? (
                <div style={{ width: `${3000 * zoomScale}px`, height: `${2000 * zoomScale}px`, overflow: 'hidden' }}>
                  <div className="relative w-[3000px] h-[2000px]" style={{ transform: `scale(${zoomScale})`, transformOrigin: 'top left' }}>
                    <img
                      src={showSatellite && data.sat_image_url ? data.sat_image_url : data.image_url}
                      alt="Map Capture"
                      className="absolute inset-0 w-full h-full object-cover"
                      draggable={false}
                    />
                    <svg
                      ref={svgRef}
                      className="absolute inset-0 w-full h-full z-10"
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerLeave={handlePointerUp}
                      onClick={handleSvgClick}
                      onContextMenu={(e) => e.preventDefault()}
                      viewBox="0 0 3000 2000"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {/* Render inactive floors in background */}
                      {polygons.map((pts, floorIndex) => {
                          if (floorIndex === activeFloorIndex || !pts || pts.length === 0 || !enabledFloors[floorIndex]) return null;
                          const fColor = floorColors[floorIndex] || floorColors[0];
                          const ptsStr = pts.map(p => `${p.x},${p.y}`).join(" ");
                          return (
                              <polygon
                                  key={`floor-${floorIndex}`}
                                  points={ptsStr}
                                  fill={fColor.fill}
                                  stroke={fColor.stroke}
                                  strokeWidth="1.5"
                                  opacity={0.4}
                                  style={{ pointerEvents: 'none' }}
                              />
                          );
                      })}

                      {/* Render active floor */}
                      {enabledFloors[activeFloorIndex] && (
                        <polygon
                          points={activePolyStr}
                          fill={(floorColors[activeFloorIndex] || floorColors[0]).fill}
                          stroke={(floorColors[activeFloorIndex] || floorColors[0]).stroke}
                          strokeWidth="3.5"
                          style={{ pointerEvents: interactionMode === 'detectSkylight' ? 'none' : 'auto' }}
                        />
                      )}
                      {enabledFloors[activeFloorIndex] && (polygons[activeFloorIndex] || []).map((pt, i) => (
                        <circle
                          key={i}
                          cx={pt.x}
                          cy={pt.y}
                          r={selectedNode === i ? "9" : "6"}
                          fill={selectedNode === i ? "#ea4335" : "white"}
                          stroke={selectedNode === i ? "white" : (floorColors[activeFloorIndex] || floorColors[0]).stroke}
                          strokeWidth={selectedNode === i ? "3" : "2"}
                          className={interactionMode === 'editFootprint' ? "cursor-move" : ""}
                          onPointerDown={(e) => {
                              if (interactionMode === 'editFootprint') handlePointerDown(e, i);
                          }}
                          style={{
                            transition: "r 0.15s ease, fill 0.15s ease",
                            pointerEvents: interactionMode === 'detectSkylight' ? 'none' : 'auto'
                          }}
                        />
                      ))}
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-card/10">
                  <div className="max-w-md bg-card border border-border p-5 rounded shadow-lg">
                    <p className="text-xs text-muted-foreground">To get started, paste a Google Maps URL at the top and click</p>
                    <p className="text-sm font-bold text-primary mt-1">"Extract Footprint"</p>
                    <p className="text-[10px] text-muted-foreground mt-2">The system will capture the building footprint, auto-detect the outline using OpenCV, and calculate initial sizing.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Collapsible bottom drawer for Windows, Doors & Skylights */}
          {data && (
            <div className={`border-t border-border bg-sidebar flex flex-col transition-all duration-300 ${isBottomOpen ? "h-72" : "h-9"}`}>
              <div
                onClick={() => setIsBottomOpen(v => !v)}
                className="flex items-center justify-between px-3 py-2 bg-card/65 cursor-pointer border-b border-border hover:bg-card/90"
              >
                <div className="flex items-center gap-2">
                  <Table className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Windows, Doors & Skylights</span>
                </div>
                <button className="text-xs font-bold text-muted-foreground">
                  {isBottomOpen ? "Collapse [−]" : "Expand [+]"}
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4 bg-card/20 select-text">
                <WindowsDoors
                  windows={windows}
                  setWindows={setWindows}
                  doors={doors}
                  setDoors={setDoors}
                  skylights={skylights}
                  setSkylights={setSkylights}
                  onRescanSkylights={handleRescanSkylights}
                />
              </div>
            </div>
          )}
        </main>

        {/* Sidebar Right: Stories, Loads, Actions */}
        <aside className="w-60 flex-shrink-0 border-l border-border bg-sidebar overflow-y-auto flex flex-col p-3 gap-4">
          {/* Stories Controls */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Story Management</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-1.5">
              {[
                { index: 0, label: "Ground Floor", color: "border-blue-500/30" },
                { index: 1, label: "2nd Story", color: "border-orange-500/30" },
                { index: 2, label: "3rd Story", color: "border-purple-500/30" }
              ].map(f => (
                <div
                  key={f.index}
                  onClick={() => {
                    if (f.index === 0 || enabledFloors[f.index]) {
                      setActiveFloorIndex(f.index);
                      setSelectedNode(null);
                    }
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded border transition-all cursor-pointer ${activeFloorIndex === f.index ? "border-primary bg-primary/10 text-primary" : "border-border bg-card/40 hover:border-border/80 text-muted-foreground"}`}
                >
                  {f.index > 0 && (
                    <input
                      type="checkbox"
                      checked={enabledFloors[f.index]}
                      onChange={(e) => { e.stopPropagation(); handleToggleFloor(f.index, e.target.checked); }}
                      className="w-3.5 h-3.5 cursor-pointer accent-primary"
                    />
                  )}
                  <span className="text-[11px] font-bold flex-1">{f.label}</span>
                </div>
              ))}
            </div>

            {data && (
              <div className="mt-2 text-[10px] space-y-1 bg-card/25 p-2 rounded border border-border/80">
                <div className="flex justify-between text-muted-foreground">
                  <span>Story area:</span>
                  <span className="font-mono text-foreground">{Math.round(calculateGeometries(polygons[activeFloorIndex] || [], data.scale).area)} sq ft</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Story perimeter:</span>
                  <span className="font-mono text-foreground">{Math.round(calculateGeometries(polygons[activeFloorIndex] || [], data.scale).perimeter)} ft</span>
                </div>
                <div className="h-px bg-border my-1" />
                <div className="flex justify-between text-muted-foreground font-semibold">
                  <span>Total area:</span>
                  <span className="font-mono text-primary">{loads?.totalArea || 0} sq ft</span>
                </div>
                <div className="flex justify-between text-muted-foreground font-semibold">
                  <span>Total perimeter:</span>
                  <span className="font-mono text-primary">{loads?.totalPerimeter || 0} ft</span>
                </div>
              </div>
            )}
          </div>

          {/* Loads Results */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Manual J Loads</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {loads ? (
              <div className="space-y-2 bg-card/25 p-2 rounded border border-border">
                {/* Heating */}
                <div>
                  <div className="text-[9px] font-bold text-muted-foreground mb-1">HEATING LOAD</div>
                  <div className="flex justify-between text-[11px] py-0.5 border-b border-border/40 text-muted-foreground">
                    <span>Sensible</span>
                    <span className="font-mono text-foreground">{loads.heating.toLocaleString()} BTU/h</span>
                  </div>
                  <div className="flex justify-between text-xs py-1 font-bold text-foreground">
                    <span>Total Capacity</span>
                    <span className="font-mono text-primary">{loads.tons} Tons</span>
                  </div>
                </div>

                <div className="h-px bg-border my-1" />

                {/* Cooling */}
                <div>
                  <div className="text-[9px] font-bold text-muted-foreground mb-1">COOLING LOAD</div>
                  <div className="flex justify-between text-[11px] py-0.5 border-b border-border/40 text-muted-foreground">
                    <span>Sensible</span>
                    <span className="font-mono text-foreground">{loads.coolingSensible.toLocaleString()} BTU/h</span>
                  </div>
                  <div className="flex justify-between text-[11px] py-0.5 border-b border-border/40 text-muted-foreground">
                    <span>Latent</span>
                    <span className="font-mono text-foreground">{loads.coolingLatent.toLocaleString()} BTU/h</span>
                  </div>
                  <div className="flex justify-between text-[11px] py-0.5 border-b border-border/40 text-muted-foreground">
                    <span>Total Raw</span>
                    <span className="font-mono text-foreground">{loads.cooling.toLocaleString()} BTU/h</span>
                  </div>
                  <div className="flex justify-between text-xs py-1 font-bold text-foreground">
                    <span>Recommended AC</span>
                    <span className="font-mono text-primary">{loads.tons} Tons</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground text-center py-4 border border-dashed border-border rounded">
                No loads calculated.
              </div>
            )}
          </div>

          {/* Export / Import actions */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Data Integration</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="flex flex-col gap-2">
              <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
              <input type="file" accept=".xlsx" className="hidden" ref={spreadsheetInputRef} onChange={handleSpreadsheetImport} />

              <button
                onClick={triggerSpreadsheetExport}
                disabled={!data}
                className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                Export Spreadsheet (.xlsx)
              </button>

              <button
                onClick={() => spreadsheetInputRef.current?.click()}
                className="w-full h-7 text-xs bg-muted/40 hover:bg-muted/70 text-foreground border border-border font-bold rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                Import Spreadsheet (.xlsx)
              </button>

              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={handleExport}
                  disabled={!data}
                  className="h-7 text-xs bg-muted/40 hover:bg-muted/70 text-foreground border border-border font-semibold rounded transition-all cursor-pointer disabled:opacity-50"
                >
                  Export JSON
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7 text-xs bg-muted/40 hover:bg-muted/70 text-foreground border border-border font-semibold rounded transition-all cursor-pointer"
                >
                  Import JSON
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
