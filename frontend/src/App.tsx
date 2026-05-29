import { useState, useRef } from 'react'
import WindowsDoors from './WindowsDoors'
import type { WindowEntry, DoorEntry } from './types'

type Point = { x: number, y: number }

type ExtractionData = {
  lat: number
  lng: number
  image_url: string
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

  const svgRef = useRef<SVGSVGElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExtract = async () => {
    if (!url) return
    setLoading(true)
    setError("")

    try {
      const res = await fetch("http://localhost:8000/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || "Extraction failed")
      }

      const resData = await res.json()
      setData(resData)
      setPolygon(resData.polygon)
      setOutdoorSummerTemp(resData.climate.summer_design_temp)
      setOutdoorWinterTemp(resData.climate.winter_design_temp)
      setOutdoorHumidity(resData.climate.outdoor_humidity)
      setRValues({
        wall: resData.defaults.wall_r_value,
        roof: resData.defaults.roof_r_value
      })
      // Update window defaults if we fetch them
      setWindows(prev => prev.map(w => ({ ...w, uValue: resData.defaults.window_u_factor })))
    } catch (err: any) {
      setError(err.message)
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
        setPolygon(prev => prev.filter((_, i) => i !== index))
      }
      return
    }
    setActiveNode(index)
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
    const boundedX = Math.max(0, Math.min(1280, svgP.x))
    const boundedY = Math.max(0, Math.min(800, svgP.y))

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

  const handleSvgClick = (e: React.MouseEvent) => {
    if (!svgRef.current) return
    // Only handle direct clicks on the SVG (or polygon), not on circles
    if ((e.target as any).tagName === 'circle') return

    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY

    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse())

    // Add point to the end
    setPolygon(prev => [...prev, { x: svgP.x, y: svgP.y }])
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

    // U-values = 1/R-value
    const wallU = 1 / rValues.wall
    const roofU = 1 / rValues.roof

    // Sensible Cooling (BTU/h) = Area * U * DT
    const sensibleWallCool = netWallArea * wallU * dtCooling
    const sensibleRoofCool = roofArea * roofU * dtCooling

    // Individual Window Cooling (Sensible = U*Area*DT + Area*SHGC*HTM_Solar)
    // Simplified HTM Solar based on standard approximations
    const sensibleWindowCool = windows.reduce((sum, w) => {
      const area = w.width * w.height
      const conduction = area * w.uValue * dtCooling
      // Rough solar gain factor depending on orientation
      let solarFactor = 30
      if (['E', 'W'].includes(w.orientation)) solarFactor = 60
      if (['SE', 'SW', 'S'].includes(w.orientation)) solarFactor = 45
      const solarGain = area * w.shgc * solarFactor
      return sum + conduction + solarGain
    }, 0)

    const sensibleDoorCool = doors.reduce((sum, d) => {
      const area = d.width * d.height
      return sum + (area * d.uValue * dtCooling)
    }, 0)

    const sensibleInternalCool = residents * 230

    const totalSensibleCooling = sensibleWallCool + sensibleRoofCool + sensibleWindowCool + sensibleDoorCool + sensibleInternalCool

    // Latent Cooling Load
    // Rough estimate based on infiltration and occupant moisture
    // People: ~200 BTU/h latent per person
    const latentInternalCool = residents * 200
    // Infiltration latent load: volume * air changes * moisture difference
    const volume = geom.area * houseHeight * (secondStory ? 2 : 1)
    const ach = 0.5 // assumption

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
    const heatRoof = roofArea * roofU * dtHeating

    const heatWindow = windows.reduce((sum, w) => {
      const area = w.width * w.height
      return sum + (area * w.uValue * dtHeating)
    }, 0)

    const heatDoor = doors.reduce((sum, d) => {
      const area = d.width * d.height
      return sum + (area * d.uValue * dtHeating)
    }, 0)

    const totalHeating = heatWall + heatRoof + heatWindow + heatDoor

    return {
      cooling: Math.round(totalCooling),
      coolingSensible: Math.round(totalSensibleCooling),
      coolingLatent: Math.round(totalLatentCooling),
      heating: Math.round(totalHeating),
      tons: (totalCooling / 12000).toFixed(1)
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
          setWindows(imported.state.windows)
          setDoors(imported.state.doors)
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
              <h2 className="text-lg font-semibold mb-2">Refine Footprint</h2>
              <p className="text-sm text-gray-500 mb-4">Drag the points to align perfectly with the building outline. Click on the map to add new points, or right-click a point to delete it.</p>

              <div className="border rounded-lg overflow-auto select-none bg-gray-100" style={{height: "600px"}}>
                <div className="relative w-[3000px] h-[2000px]">
                  <img
                    src={`http://localhost:8000${data.image_url}`}
                    alt="Map Capture"
                    className="absolute inset-0 w-full h-full object-none object-left-top"
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
                  />
                  {polygon.map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r="6"
                      fill="white"
                      stroke="#2563eb"
                      strokeWidth="2"
                      className="cursor-move"
                      onPointerDown={(e) => handlePointerDown(e, i)}
                    />
                  ))}
                </svg>
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
                  />
                </div>

                <div className="mt-6 border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3 border-b pb-2">Climate & Envelope Defaults</h3>

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

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="block text-gray-500 mb-1">Wall R-Value</label>
                      <input type="number" className="w-full p-1 border rounded" value={rValues.wall} onChange={e => setRValues({...rValues, wall: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">Roof R-Value</label>
                      <input type="number" className="w-full p-1 border rounded" value={rValues.roof} onChange={e => setRValues({...rValues, roof: Number(e.target.value)})} />
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
