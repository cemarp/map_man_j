import { useState, useRef, useEffect } from 'react'

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
  const [windows, setWindows] = useState(8)
  const [rValues, setRValues] = useState({ wall: 13, roof: 30, windowU: 0.35 })

  const svgRef = useRef<SVGSVGElement>(null)

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
      setRValues({
        wall: resData.defaults.wall_r_value,
        roof: resData.defaults.roof_r_value,
        windowU: resData.defaults.window_u_factor
      })
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

    setPolygon(prev => {
      const next = [...prev]
      next[activeNode] = { x: svgP.x, y: svgP.y }
      return next
    })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setActiveNode(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const polyStr = polygon.map(p => `${p.x},${p.y}`).join(" ")
  const geom = data ? calculateGeometries(polygon, data.scale) : { area: 0, perimeter: 0 }

  // Basic Manual J Estimation
  const calculateLoad = () => {
    if (!data) return null

    const dtCooling = data.climate.summer_design_temp - 75 // Assume 75F indoor
    const dtHeating = 70 - data.climate.winter_design_temp // Assume 70F indoor

    // Area of elements
    const wallArea = geom.perimeter * houseHeight * (secondStory ? 2 : 1)
    const windowArea = windows * 15 // Assume 15 sqft per window
    const netWallArea = Math.max(0, wallArea - windowArea)
    const roofArea = geom.area

    // U-values = 1/R-value
    const wallU = 1 / rValues.wall
    const roofU = 1 / rValues.roof

    // Sensible Cooling (BTU/h) = Area * U * DT
    const sensibleWallCool = netWallArea * wallU * dtCooling
    const sensibleRoofCool = roofArea * roofU * dtCooling
    const sensibleWindowCool = windowArea * rValues.windowU * dtCooling * 1.5 // Added solar heat gain factor approx
    const internalCool = residents * 400 // Latent+Sensible roughly 400 BTU per person

    const totalCooling = sensibleWallCool + sensibleRoofCool + sensibleWindowCool + internalCool

    // Heating (BTU/h)
    const heatWall = netWallArea * wallU * dtHeating
    const heatRoof = roofArea * roofU * dtHeating
    const heatWindow = windowArea * rValues.windowU * dtHeating

    const totalHeating = heatWall + heatRoof + heatWindow

    return {
      cooling: Math.round(totalCooling),
      heating: Math.round(totalHeating),
      tons: (totalCooling / 12000).toFixed(1)
    }
  }

  const loads = calculateLoad()

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h1 className="text-2xl font-bold mb-4">Auto Manual J Calculator</h1>
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
              <p className="text-sm text-gray-500 mb-4">Drag the points to align perfectly with the building outline.</p>

              <div className="relative border rounded-lg overflow-hidden flex-1 select-none flex items-center justify-center bg-gray-100" style={{minHeight: 400}}>
                <img
                  src={`http://localhost:8000${data.image_url}`}
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
                  viewBox="0 0 1280 800" // Assuming the playwright capture resolution
                  preserveAspectRatio="xMidYMid slice"
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
                    <label className="block text-sm text-gray-600 mb-1">Number of Windows</label>
                    <input type="number" className="w-full p-2 border rounded" value={windows} onChange={e => setWindows(Number(e.target.value))} />
                  </div>
                  <div className="col-span-2 flex items-center gap-2 mt-2">
                    <input type="checkbox" id="secondStory" checked={secondStory} onChange={e => setSecondStory(e.target.checked)} className="w-4 h-4" />
                    <label htmlFor="secondStory" className="text-sm">Has 2nd Story (doubles wall area)</label>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold mb-3 border-b pb-2">Climate & Defaults (Auto-detected)</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 block">Summer Design</span>
                      {data.climate.summer_design_temp}°F
                    </div>
                    <div>
                      <span className="text-gray-500 block">Winter Design</span>
                      {data.climate.winter_design_temp}°F
                    </div>
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
                    <div className="flex justify-between items-center bg-white/60 p-3 rounded">
                      <span className="text-emerald-800">Cooling Load</span>
                      <span className="font-bold text-lg">{loads.cooling.toLocaleString()} BTU/h</span>
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
