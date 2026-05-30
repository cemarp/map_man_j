import { useState, useRef, useEffect } from 'react'
import WindowsDoors from './WindowsDoors'
import type { WindowEntry, DoorEntry, SkylightEntry, DuctSystem, Foundation, Attic, Envelope } from './types'
import { captureMapCanvas } from './MapCapture'
import { extractBuildingOutline, getScaleFromLatZoom, cvAutoDetectSkylights, cvDetectSkylightAtPoint } from './cvEngine'

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

export default function App() {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [data, setData] = useState<ExtractionData | null>(null)
  const [showSatellite, setShowSatellite] = useState(false)

  // User adjustable values
  const [polygon, setPolygon] = useState<Point[]>([])
  const [activeNode, setActiveNode] = useState<number | null>(null)
  const [houseHeight, setHouseHeight] = useState(10)
  const [secondStory, setSecondStory] = useState(false)
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
  const containerRef = useRef<HTMLDivElement>(null)

  const [cvLoaded, setCvLoaded] = useState(false)

  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [zoomScale, setZoomScale] = useState(1.0)
  const [interactionMode, setInteractionMode] = useState<'editFootprint' | 'detectSkylight'>('editFootprint')

  // Dynamically load OpenCV.js inside the browser (Strict Mode safe)
  useEffect(() => {
    // 1. If already fully loaded
    if ((window as any).cv) {
      setCvLoaded(true)
      return
    }

    // Initialize global status objects
    (window as any).cvLoadedStatus = (window as any).cvLoadedStatus || 'not_started';
    (window as any).cvListeners = (window as any).cvListeners || [];

    if ((window as any).cvLoadedStatus === 'loaded') {
      setCvLoaded(true)
      return
    }

    // Subscribe current setCvLoaded callback
    const listener = () => setCvLoaded(true)
    ;(window as any).cvListeners.push(listener)

    if ((window as any).cvLoadedStatus === 'loading') {
      console.log("OpenCV.js script is already loading. Subscribed to load callback.")
      return () => {
        // Cleanup listener if component unmounts
        (window as any).cvListeners = ((window as any).cvListeners || []).filter((l: any) => l !== listener)
      }
    }

    // Otherwise, we are the one initiating the load
    console.log("Setting up OpenCV Module hook and initiating load...")
    ;(window as any).cvLoadedStatus = 'loading'

    const Module = {
      onRuntimeInitialized: () => {
        console.log("OpenCV.js runtime initialized in browser!")
        ;(window as any).cvLoadedStatus = 'loaded'
        // Call all subscribers
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
      // Cleanup listener if component unmounts
      (window as any).cvListeners = ((window as any).cvListeners || []).filter((l: any) => l !== listener)
    }
  }, [])

  // Keyboard event listener for adding and deleting polygon vertices
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedNode === null || !data) return

      // D, Delete, or Backspace to delete the highlighted vertex
      if (e.key === 'Delete' || e.key === 'Backspace' || e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (polygon.length > 3) {
          setPolygon(prev => {
            const next = prev.filter((_, i) => i !== selectedNode)
            const nextSelected = selectedNode >= next.length ? next.length - 1 : selectedNode
            setSelectedNode(nextSelected)
            return next
          })
          console.log(`Deleted vertex at index ${selectedNode}`)
        }
      }

      // A, Insert, or N to insert a new vertex next to (after) the selected one
      if (e.key.toLowerCase() === 'a' || e.key === 'Insert' || e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setPolygon(prev => {
          if (selectedNode >= prev.length) return prev
          const currPt = prev[selectedNode]
          const nextIdx = (selectedNode + 1) % prev.length
          const nextPt = prev[nextIdx]
          const midpoint = {
            x: Math.round((currPt.x + nextPt.x) / 2),
            y: Math.round((currPt.y + nextPt.y) / 2)
          }
          const next = [...prev]
          next.splice(selectedNode + 1, 0, midpoint)
          setSelectedNode(selectedNode + 1)
          return next
        })
        console.log(`Inserted new vertex after index ${selectedNode}`)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedNode, polygon.length, data])

  // Auto-center viewport on the extracted polygon
  useEffect(() => {
    if (data && containerRef.current) {
      let targetX = 1500
      let targetY = 1000

      if (data.polygon && data.polygon.length > 0) {
        const xs = data.polygon.map(p => p.x)
        const ys = data.polygon.map(p => p.y)
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

    // Try finding coordinates inside path segments first: !3d(lat)!4d(lng)
    let match = decoded.match(/!3d([-\d.]+)!4d([-\d.]+)/)
    if (match) {
      let zoom = 19
      const zoomMatch = decoded.match(/@([-\d.]+),([-\d.]+),([-\d.]+)z/)
      if (zoomMatch) {
        zoom = parseFloat(zoomMatch[3])
      }
      return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), zoom }
    }

    // Try finding zoom first: @lat,lng,zoomz
    match = decoded.match(/@([-\d.]+),([-\d.]+),([-\d.]+)z/)
    if (match) {
      return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), zoom: parseFloat(match[3]) }
    }

    // Try @lat,lng
    match = decoded.match(/@([-\d.]+),([-\d.]+)/)
    if (match) {
      return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), zoom: 19 }
    }

    return { lat: null, lng: null, zoom: 19 }
  }

  const handleExtract = async () => {
    if (!url) return
    if (!cvLoaded) {
      setError("OpenCV.js is still loading in the browser. Please wait a few seconds and try again.")
      return
    }
    setLoading(true)
    setError("")

    try {
      const { lat, lng, zoom } = parseLatLong(url)
      if (lat === null || lng === null) {
        throw new Error("Could not parse coordinates from the pasted Google Maps URL. Please check the link and try again.")
      }

      console.log(`Parsed coordinates: lat=${lat}, lng=${lng}, zoom=${zoom}`)

      // 1. Capture Map & Satellite canvasses locally in the browser
      console.log("Rendering and capturing standard Map tile layer...")
      const mapCanvas = await captureMapCanvas(lat, lng, zoom, false)

      console.log("Rendering and capturing Satellite tile layer...")
      const satCanvas = await captureMapCanvas(lat, lng, zoom, true)

      // 2. Convert captured canvasses to Base64 Data URLs
      const imageUrl = mapCanvas.toDataURL('image/png')
      const satImageUrl = satCanvas.toDataURL('image/png')

      // 3. Extract building outline polygon from the Map canvas in-browser via OpenCV.js
      console.log("Processing standard map canvas via in-browser OpenCV.js engine...")
      const { polygon: extractedPolygon, area, perimeter } = extractBuildingOutline(mapCanvas)

      // 4. Calculate local scale from latitude and zoom
      const scale = getScaleFromLatZoom(lat, zoom)

      // 5. Query fast, lightweight metadata endpoint on backend to fetch climate & defaults
      const metadataRes = await fetch(`http://localhost:8000/metadata?lat=${lat}&lng=${lng}&zoom=${zoom}`)
      if (!metadataRes.ok) {
        throw new Error("Failed to load climate metadata from backend")
      }
      const metadata = await metadataRes.json()

      // 6. Set active states
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
      setPolygon(extractedPolygon)
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

  // Calculate actual area/perimeter from polygon
  // We need to use shoelace formula for area
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

    // Scale to feet
    return {
      area: area * (scale * scale),
      perimeter: perimeter * scale
    }
  }

  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    e.stopPropagation()
    if (e.button === 2) {
      // Right click to delete vertex
      e.preventDefault()
      if (polygon.length > 3) {
        setPolygon(prev => {
          const next = prev.filter((_, i) => i !== index)
          const nextSelected = index >= next.length ? next.length - 1 : index
          setSelectedNode(nextSelected)
          return next
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

    // Constrain points to bounds
    const boundedX = Math.max(0, Math.min(3000, svgP.x))
    const boundedY = Math.max(0, Math.min(2000, svgP.y))

    setPolygon(prev => {
      const next = [...prev]
      next[activeNode] = { x: boundedX, y: boundedY }
      return next
    })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setActiveNode(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleSvgClick = async (e: React.MouseEvent) => {
    if (!svgRef.current) return
    // Only handle direct clicks on the SVG (or polygon), not on circles
    if ((e.target as any).tagName === 'circle') return

    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY

    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse())
    const newPt = { x: Math.round(svgP.x), y: Math.round(svgP.y) }

    if (interactionMode === 'detectSkylight') {
        if (!data?.sat_image_url) return;
        // Load the satellite image to a canvas
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

    // Default Edit Footprint Mode
    // Add point to the end and select it
    setPolygon(prev => {
      const next = [...prev, newPt]
      setSelectedNode(next.length - 1)
      return next
    })
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
              const detected = cvAutoDetectSkylights(canvas, polygon, data.scale);
              if (detected.length > 0) {
                  setSkylights(prev => [...prev, ...detected]);
                  alert(`Successfully detected ${detected.length} skylights! Review the list and remove any false positives.`);
              } else {
                  alert("No distinct skylights were automatically detected inside the footprint.");
              }
          }
      } finally {
          setLoading(false);
      }
  }

  const polyStr = polygon.map(p => `${p.x},${p.y}`).join(" ")
  const geom = data ? calculateGeometries(polygon, data.scale) : { area: 0, perimeter: 0 }

  // Basic Manual J Estimation
  const calculateLoad = () => {
    if (!data) return null

    const dtCooling = outdoorSummerTemp - indoorSummerTemp
    const dtHeating = indoorWinterTemp - outdoorWinterTemp

    // Area of elements
    const wallArea = geom.perimeter * houseHeight * (secondStory ? 2 : 1)
    const windowAreaTotal = windows.reduce((sum, w) => sum + (w.width * w.height), 0)
    const doorAreaTotal = doors.reduce((sum, d) => sum + (d.width * d.height), 0)
    const netWallArea = Math.max(0, wallArea - windowAreaTotal - doorAreaTotal)
    const roofArea = geom.area

    // Area of new elements
    const skylightAreaTotal = skylights.reduce((sum, s) => sum + (s.width * s.height), 0)

    // Adjust roof area for skylights if attic type allows (assume no attic or vented still has skylights penetrating)
    // Here we'll just subtract it from the raw roof Area to get net
    const netRoofArea = Math.max(0, roofArea - skylightAreaTotal)

    // U-values = 1/R-value
    const wallU = rValues.wall > 0 ? 1 / rValues.wall : 0
    const roofU = attic.rValue > 0 ? 1 / attic.rValue : (rValues.roof > 0 ? 1 / rValues.roof : 0) // Fallback for old configs

    // Foundation logic
    const foundationU = foundation.rValue > 0 ? 1 / foundation.rValue : (foundation.type === 'Slab' ? 1.5 : 0.5) // basic assumptions for uninsulated

    // Sensible Cooling (BTU/h) = Area * U * DT
    const sensibleWallCool = netWallArea * wallU * dtCooling

    // Roof load depends on attic type
    let sensibleRoofCool = netRoofArea * roofU * dtCooling
    if (attic.type === 'Vented') {
        // Vented attics get much hotter than outdoor air in summer
        sensibleRoofCool = netRoofArea * roofU * (dtCooling + 20)
    } else if (attic.type === 'No Attic') {
        // Direct roof exposure, somewhat higher sol-air temp
        sensibleRoofCool = netRoofArea * roofU * (dtCooling + 10)
    }

    const sensibleFoundationCool = foundation.type === 'Slab'
        ? geom.perimeter * foundationU * (dtCooling * 0.5) // Edge heat transfer is mostly what matters for slab
        : geom.area * foundationU * (dtCooling * 0.5) // Crawlspace/Basement transfers through floor

    // Individual Window Cooling (Sensible = U*Area*DT + Area*SHGC*HTM_Solar)
    // Simplified HTM Solar based on standard approximations
    const sensibleWindowCool = windows.reduce((sum, w) => {
      const area = w.width * w.height
      const conduction = area * w.uValue * dtCooling
      // Rough solar gain factor depending on orientation
      let solarFactor = 30
      if (['E', 'W'].includes(w.orientation)) solarFactor = 60
      if (['SE', 'SW', 'S'].includes(w.orientation)) solarFactor = 45

      // Overhang adjustment (simplified: reduces solar gain if it has an overhang)
      // A deeper overhang closer to the window blocks more sun.
      if (w.overhangDepth && w.overhangDepth > 0) {
        // Very basic shading factor: reduce solar gain by up to 50% depending on depth vs height
        // This is a highly simplified approximation
        let shadeFactor = Math.min(0.5, w.overhangDepth / w.height)
        solarFactor = solarFactor * (1 - shadeFactor)
      }

      const solarGain = area * w.shgc * solarFactor
      return sum + conduction + solarGain
    }, 0)

    const sensibleSkylightCool = skylights.reduce((sum, s) => {
        const area = s.width * s.height
        const conduction = area * s.uValue * dtCooling
        // Skylights get direct overhead sun, so solar gain factor is high
        const solarGain = area * s.shgc * 70
        return sum + conduction + solarGain
    }, 0)

    const sensibleDoorCool = doors.reduce((sum, d) => {
      const area = d.width * d.height
      return sum + (area * d.uValue * dtCooling)
    }, 0)

    const sensibleInternalCool = residents * 230

    const totalSensibleCooling = sensibleWallCool + sensibleRoofCool + sensibleFoundationCool + sensibleWindowCool + sensibleSkylightCool + sensibleDoorCool + sensibleInternalCool

    // Latent Cooling Load
    // Rough estimate based on infiltration and occupant moisture
    // People: ~200 BTU/h latent per person
    const latentInternalCool = residents * 200
    // Infiltration latent load: volume * air changes * moisture difference
    const volume = geom.area * houseHeight * (secondStory ? 2 : 1)

    // Calculate ACH based on envelope tightness and fireplaces
    let ach = 0.5 // Average
    if (envelope.tightness === 'Tight') ach = 0.3
    if (envelope.tightness === 'Loose') ach = 0.8
    // Fireplaces add extra leakage
    ach += (envelope.fireplaces * 0.1)

    // Convert humidity to grains of moisture difference
    // Simple estimation: 1 grain = ~0.00014 lbs water. 1 BTU evaporates ~0.001 lbs water.
    // We'll use a simplified formula where humidity difference directly impacts latent load
    const humDiff = Math.max(0, outdoorHumidity - indoorHumidity)
    // 0.68 is a common factor for latent load calculation: 0.68 * CFM * delta Grains
    // Assuming delta Grains is proportional to relative humidity diff for simplicity in this model
    const cfm = (volume * ach) / 60
    const latentInfiltrationCool = cfm * 0.68 * (humDiff * 0.5) // Rough approximation of grains from RH diff

    const totalLatentCooling = latentInternalCool + latentInfiltrationCool
    const totalCooling = totalSensibleCooling + totalLatentCooling

    // Heating (BTU/h)
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

    // Infiltration Heating Load (Sensible)
    // 1.08 * CFM * DT
    const heatInfiltration = 1.08 * cfm * dtHeating

    let totalHeating = heatWall + heatRoof + heatFoundation + heatWindow + heatSkylight + heatDoor + heatInfiltration

    // Apply Duct Loss / Gain Multipliers
    let ductMultiplier = 1.0
    // If ducts are in unconditioned space, they lose/gain heat
    if (ductSystem.location === 'Attic' || ductSystem.location === 'Crawlspace') {
        // Base penalty for being in unconditioned space
        ductMultiplier += 0.10

        if (ductSystem.leakage === 'Average (10%)') ductMultiplier += 0.05
        else if (ductSystem.leakage === 'Leaky (15%)') ductMultiplier += 0.10
        // Tight is 0% added penalty

        // Insulation reduction (very rough approx: R8 drops penalty by 4%)
        if (ductSystem.insulationRValue > 0) {
            ductMultiplier -= (ductSystem.insulationRValue * 0.005)
        }
    }

    // Ensure multiplier doesn't go below 1.0 (can't have negative loss)
    ductMultiplier = Math.max(1.0, ductMultiplier)

    const finalCooling = totalCooling * ductMultiplier
    const finalCoolingSensible = totalSensibleCooling * ductMultiplier
    const finalCoolingLatent = totalLatentCooling * ductMultiplier
    const finalHeating = totalHeating * ductMultiplier

    return {
      cooling: Math.round(finalCooling),
      coolingSensible: Math.round(finalCoolingSensible),
      coolingLatent: Math.round(finalCoolingLatent),
      heating: Math.round(finalHeating),
      tons: (finalCooling / 12000).toFixed(1)
    }
  }

  const loads = calculateLoad()

  const handleExport = () => {
    if (!data) return
    const exportData = {
      sourceData: data,
      state: {
        url,
        polygon,
        houseHeight,
        secondStory,
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
          setPolygon(imported.state.polygon)
          setHouseHeight(imported.state.houseHeight)
          setSecondStory(imported.state.secondStory)
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

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Auto Manual J Calculator</h1>
            <div className="space-x-2">
              <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
              <button onClick={() => fileInputRef.current?.click()} className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50">Import JSON</button>
              <button onClick={handleExport} className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50" disabled={!data}>Export JSON</button>
            </div>
          </div>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Paste Google Maps Link here..."
              className="flex-1 p-3 border rounded-lg"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
            <button
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium"
              onClick={handleExtract}
              disabled={loading}
            >
              {loading ? "Extracting..." : "Extract Geometry"}
            </button>
          </div>
          {error && <p className="text-red-500 mt-2">{error}</p>}
        </div>

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left Column: Image Map Editor */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
              <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                <h2 className="text-lg font-semibold">Refine Footprint</h2>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Premium Zoom Control Bar */}
                  <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider select-none mr-1">Zoom</span>
                    <button
                      onClick={() => setZoomScale(z => Math.max(0.25, z - 0.25))}
                      className="w-7 h-7 flex items-center justify-center border rounded bg-white hover:bg-gray-50 text-gray-600 font-bold select-none text-sm shadow-sm transition-colors"
                      title="Zoom Out"
                    >
                      -
                    </button>
                    <span className="text-xs font-semibold text-gray-700 w-12 text-center select-none font-mono">
                      {Math.round(zoomScale * 100)}%
                    </span>
                    <button
                      onClick={() => setZoomScale(z => Math.min(3.0, z + 0.25))}
                      className="w-7 h-7 flex items-center justify-center border rounded bg-white hover:bg-gray-50 text-gray-600 font-bold select-none text-sm shadow-sm transition-colors"
                      title="Zoom In"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setZoomScale(1.0)}
                      className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50 text-gray-500 font-medium select-none shadow-sm ml-1 transition-colors"
                      title="Reset Zoom"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                    <input
                      type="checkbox"
                      id="showSatellite"
                      checked={showSatellite}
                      onChange={e => setShowSatellite(e.target.checked)}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="showSatellite" className="text-sm font-semibold cursor-pointer text-gray-700 select-none">
                      Show Satellite View
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-start mb-4">
                  <p className="text-sm text-gray-500 flex-1">
                    Drag points to align. Click on the map to add a point. Click a point to highlight it, then press <strong className="text-gray-700 bg-gray-100 px-1 py-0.5 rounded border border-gray-200">D</strong> / <strong className="text-gray-700 bg-gray-100 px-1 py-0.5 rounded border border-gray-200">Delete</strong> to delete it, or <strong className="text-gray-700 bg-gray-100 px-1 py-0.5 rounded border border-gray-200">A</strong> / <strong className="text-gray-700 bg-gray-100 px-1 py-0.5 rounded border border-gray-200">N</strong> to insert a new vertex next to it.
                  </p>
                  <div className="flex bg-gray-100 p-1 rounded-lg shadow-sm border border-gray-200 ml-4">
                      <button
                        onClick={() => setInteractionMode('editFootprint')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${interactionMode === 'editFootprint' ? 'bg-white text-blue-700 shadow border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Edit Footprint
                      </button>
                      <button
                        onClick={() => { setInteractionMode('detectSkylight'); setShowSatellite(true); }}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${interactionMode === 'detectSkylight' ? 'bg-white text-blue-700 shadow border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                        title="Click on the map to auto-detect a skylight at that location"
                      >
                        Detect Skylight
                      </button>
                  </div>
              </div>

              <div ref={containerRef} className={`border rounded-lg overflow-auto select-none bg-gray-100 ${interactionMode === 'detectSkylight' ? 'cursor-crosshair' : ''}`} style={{height: "600px"}}>
                <div style={{ width: `${3000 * zoomScale}px`, height: `${2000 * zoomScale}px`, overflow: 'hidden' }}>
                  <div className="relative w-[3000px] h-[2000px]" style={{ transform: `scale(${zoomScale})`, transformOrigin: 'top left' }}>
                    <img
                      src={showSatellite && data.sat_image_url ? data.sat_image_url : data.image_url}
                      alt="Map Capture"
                      className="absolute inset-0 w-full h-full object-cover"
                      draggable={false}
                    />
                  {/* SVG Overlay for editing the polygon */}
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
                  <polygon
                    points={polyStr}
                    fill="rgba(59, 130, 246, 0.3)"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    style={{ pointerEvents: interactionMode === 'detectSkylight' ? 'none' : 'auto' }}
                  />
                  {polygon.map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r={selectedNode === i ? "9" : "6"}
                      fill={selectedNode === i ? "#ea4335" : "white"}
                      stroke={selectedNode === i ? "white" : "#2563eb"}
                      strokeWidth={selectedNode === i ? "3" : "2"}
                      className={interactionMode === 'editFootprint' ? "cursor-move" : ""}
                      onPointerDown={(e) => {
                          if (interactionMode === 'editFootprint') handlePointerDown(e, i);
                      }}
                      style={{
                        transition: "r 0.15s ease, fill 0.15s ease",
                        filter: selectedNode === i ? "drop-shadow(0 0 4px rgba(234, 67, 53, 0.6))" : "none",
                        pointerEvents: interactionMode === 'detectSkylight' ? 'none' : 'auto'
                      }}
                    />
                  ))}
                </svg>
                </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div className="bg-blue-50 p-3 rounded text-blue-800">
                  <span className="font-semibold block">Footprint Area</span>
                  {Math.round(geom.area)} sqft
                </div>
                <div className="bg-blue-50 p-3 rounded text-blue-800">
                  <span className="font-semibold block">Perimeter</span>
                  {Math.round(geom.perimeter)} ft
                </div>
              </div>
            </div>

            {/* Right Column: Calculator Input & Output */}
            <div className="space-y-6">

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold mb-4">Building Characteristics</h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">House Height (ft)</label>
                    <input type="number" className="w-full p-2 border rounded" value={houseHeight} onChange={e => setHouseHeight(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Number of Occupants</label>
                    <input type="number" className="w-full p-2 border rounded" value={residents} onChange={e => setResidents(Number(e.target.value))} />
                  </div>
                  <div className="col-span-2 flex items-center gap-2 mt-2">
                    <input type="checkbox" id="secondStory" checked={secondStory} onChange={e => setSecondStory(e.target.checked)} className="w-4 h-4" />
                    <label htmlFor="secondStory" className="text-sm">Has 2nd Story (doubles wall area)</label>
                  </div>
                </div>

                <div className="mt-6 border-t pt-4">
                  <WindowsDoors
                    windows={windows} setWindows={setWindows}
                    doors={doors} setDoors={setDoors}
                    skylights={skylights} setSkylights={setSkylights}
                    onRescanSkylights={handleRescanSkylights}
                  />
                </div>

                <div className="mt-6 border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3 border-b pb-2">Envelope Defaults</h3>

                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <label className="block text-gray-500 mb-1">Wall R-Value</label>
                      <input type="number" className="w-full p-1 border rounded" value={rValues.wall} onChange={e => setRValues({...rValues, wall: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">Old Roof R-Value (Legacy)</label>
                      <input type="number" className="w-full p-1 border rounded" value={rValues.roof} onChange={e => setRValues({...rValues, roof: Number(e.target.value)})} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <label className="block text-gray-500 mb-1">Attic Type</label>
                      <select className="w-full p-1 border rounded" value={attic.type} onChange={e => setAttic({...attic, type: e.target.value as any})}>
                        <option value="Vented">Vented</option>
                        <option value="Unvented">Unvented</option>
                        <option value="No Attic">No Attic</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">Attic R-Value</label>
                      <input type="number" className="w-full p-1 border rounded" value={attic.rValue} onChange={e => setAttic({...attic, rValue: Number(e.target.value)})} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <label className="block text-gray-500 mb-1">Foundation Type</label>
                      <select className="w-full p-1 border rounded" value={foundation.type} onChange={e => setFoundation({...foundation, type: e.target.value as any})}>
                        <option value="Slab">Slab</option>
                        <option value="Crawlspace">Crawlspace</option>
                        <option value="Basement">Basement</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">Foundation R-Value</label>
                      <input type="number" className="w-full p-1 border rounded" value={foundation.rValue} onChange={e => setFoundation({...foundation, rValue: Number(e.target.value)})} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <label className="block text-gray-500 mb-1">Envelope Tightness</label>
                      <select className="w-full p-1 border rounded" value={envelope.tightness} onChange={e => setEnvelope({...envelope, tightness: e.target.value as any})}>
                        <option value="Tight">Tight</option>
                        <option value="Average">Average</option>
                        <option value="Loose">Loose</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">Fireplaces</label>
                      <input type="number" className="w-full p-1 border rounded" value={envelope.fireplaces} onChange={e => setEnvelope({...envelope, fireplaces: Number(e.target.value)})} />
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3 border-b pb-2">Duct System</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                    <div>
                      <label className="block text-gray-500 mb-1">Location</label>
                      <select className="w-full p-1 border rounded" value={ductSystem.location} onChange={e => setDuctSystem({...ductSystem, location: e.target.value as any})}>
                        <option value="Attic">Attic</option>
                        <option value="Crawlspace">Crawlspace</option>
                        <option value="Conditioned Space">Conditioned Space</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">Leakage</label>
                      <select className="w-full p-1 border rounded" value={ductSystem.leakage} onChange={e => setDuctSystem({...ductSystem, leakage: e.target.value as any})}>
                        <option value="Tight (5%)">Tight (5%)</option>
                        <option value="Average (10%)">Average (10%)</option>
                        <option value="Leaky (15%)">Leaky (15%)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">Insulation R-Value</label>
                      <input type="number" className="w-full p-1 border rounded" value={ductSystem.insulationRValue} onChange={e => setDuctSystem({...ductSystem, insulationRValue: Number(e.target.value)})} />
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3 border-b pb-2">Climate Defaults</h3>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-4">
                    <div>
                      <label className="text-gray-500 block mb-1">Outdoor Summer Design (°F)</label>
                      <input type="number" step="0.1" className="w-full p-1 border rounded" value={outdoorSummerTemp} onChange={e => setOutdoorSummerTemp(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-gray-500 block mb-1">Outdoor Winter Design (°F)</label>
                      <input type="number" step="0.1" className="w-full p-1 border rounded" value={outdoorWinterTemp} onChange={e => setOutdoorWinterTemp(Number(e.target.value))} />
                    </div>
                    <div>
                      <span className="text-gray-500 block mb-1">Outdoor Humidity (%)</span>
                      <input type="number" className="w-full p-1 border rounded font-medium" value={outdoorHumidity} onChange={e => setOutdoorHumidity(Number(e.target.value))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-4">
                    <div>
                      <label className="block text-gray-500 mb-1">Indoor Summer Temp</label>
                      <input type="number" className="w-full p-1 border rounded" value={indoorSummerTemp} onChange={e => setIndoorSummerTemp(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">Indoor Winter Temp</label>
                      <input type="number" className="w-full p-1 border rounded" value={indoorWinterTemp} onChange={e => setIndoorWinterTemp(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">Indoor Humidity (%)</label>
                      <input type="number" className="w-full p-1 border rounded" value={indoorHumidity} onChange={e => setIndoorHumidity(Number(e.target.value))} />
                    </div>
                  </div>

                </div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-100 p-6 rounded-xl shadow-sm border border-emerald-200">
                <h2 className="text-lg font-semibold text-emerald-900 mb-4">Manual J Estimate</h2>
                {loads && (
                  <div className="space-y-3">
                    <div className="bg-white/60 p-3 rounded">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-emerald-800 font-semibold">Cooling Load</span>
                        <span className="font-bold text-lg">{loads.cooling.toLocaleString()} BTU/h</span>
                      </div>
                      <div className="flex justify-between items-center text-sm text-emerald-700 pl-4 border-l-2 border-emerald-200">
                        <span>Sensible</span>
                        <span>{loads.coolingSensible.toLocaleString()} BTU/h</span>
                      </div>
                      <div className="flex justify-between items-center text-sm text-emerald-700 pl-4 border-l-2 border-emerald-200">
                        <span>Latent</span>
                        <span>{loads.coolingLatent.toLocaleString()} BTU/h</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center bg-white/60 p-3 rounded">
                      <span className="text-emerald-800">Heating Load</span>
                      <span className="font-bold text-lg">{loads.heating.toLocaleString()} BTU/h</span>
                    </div>
                    <div className="flex justify-between items-center bg-emerald-600 text-white p-4 rounded-lg mt-4 shadow-sm">
                      <span className="font-medium">Recommended AC Size</span>
                      <span className="font-bold text-2xl">{loads.tons} Tons</span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  )
}
