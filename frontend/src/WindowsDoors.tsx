import React from 'react'
import type { WindowEntry, DoorEntry, SkylightEntry, Orientation } from './types'

interface WindowsDoorsProps {
  windows: WindowEntry[]
  setWindows: React.Dispatch<React.SetStateAction<WindowEntry[]>>
  doors: DoorEntry[]
  setDoors: React.Dispatch<React.SetStateAction<DoorEntry[]>>
  skylights: SkylightEntry[]
  setSkylights: React.Dispatch<React.SetStateAction<SkylightEntry[]>>
  onRescanSkylights: () => void
}

const orientations: Orientation[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

const windowPresets = [
  { label: 'Single Pane Clear', uValue: 1.04, shgc: 0.86 },
  { label: 'Double Pane Clear', uValue: 0.76, shgc: 0.76 },
  { label: 'Double Pane Low-E', uValue: 0.35, shgc: 0.25 },
  { label: 'Triple Pane Low-E', uValue: 0.20, shgc: 0.15 },
]

const doorPresets = [
  { label: 'Wood Solid Core', uValue: 0.50 },
  { label: 'Steel Insulated', uValue: 0.17 },
  { label: 'Fiberglass Insulated', uValue: 0.20 },
  { label: 'Glass Sliding', uValue: 0.65 },
]

export default function WindowsDoors({ windows, setWindows, doors, setDoors, skylights, setSkylights, onRescanSkylights }: WindowsDoorsProps) {
  const addWindow = () => {
    setWindows([...windows, {
      id: Math.random().toString(36).substring(7),
      width: 3,
      height: 5,
      orientation: 'N',
      uValue: 0.35,
      shgc: 0.25,
      description: `Window ${windows.length + 1}`,
      overhangDepth: 0,
      distanceAboveWindow: 0
    }])
  }

  const removeWindow = (id: string) => {
    setWindows(windows.filter(w => w.id !== id))
  }

  const updateWindow = (id: string, field: keyof WindowEntry, value: any) => {
    setWindows(windows.map(w => w.id === id ? { ...w, [field]: value } : w))
  }

  const addDoor = () => {
    setDoors([...doors, {
      id: Math.random().toString(36).substring(7),
      width: 3,
      height: 6.8,
      uValue: 0.5,
      description: 'Standard Door'
    }])
  }

  const removeDoor = (id: string) => {
    setDoors(doors.filter(d => d.id !== id))
  }

  const addSkylight = () => {
    setSkylights([...skylights, {
      id: Math.random().toString(36).substring(7),
      width: 2,
      height: 4,
      uValue: 0.50,
      shgc: 0.40,
      description: `Skylight ${skylights.length + 1}`
    }])
  }

  const updateSkylight = (id: string, field: keyof SkylightEntry, value: any) => {
    setSkylights(skylights.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const removeSkylight = (id: string) => {
    setSkylights(skylights.filter(s => s.id !== id))
  }

  const updateDoor = (id: string, field: keyof DoorEntry, value: any) => {
    setDoors(doors.map(d => d.id === id ? { ...d, [field]: value } : d))
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold border-b pb-2 flex-1">Windows</h3>
          <button onClick={addWindow} className="ml-2 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium hover:bg-blue-200">+ Add Window</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 bg-gray-50">
              <tr>
                <th className="px-2 py-1">Desc</th>
                <th className="px-2 py-1">W (ft)</th>
                <th className="px-2 py-1">H (ft)</th>
                <th className="px-2 py-1">Orient</th>
                <th className="px-2 py-1" title="Overhang Depth (ft)">Overhang Depth (ft)</th>
                <th className="px-2 py-1" title="Distance Above Window (ft)">Dist Above (ft)</th>
                <th className="px-2 py-1">Preset</th>
                <th className="px-2 py-1">U-Val</th>
                <th className="px-2 py-1">SHGC</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {windows.map(w => (
                <tr key={w.id} className="border-b">
                  <td className="p-1"><input className="w-20 border rounded px-1" value={w.description} onChange={(e) => updateWindow(w.id, 'description', e.target.value)} /></td>
                  <td className="p-1"><input type="number" step="0.1" className="w-12 border rounded px-1" value={w.width} onChange={(e) => updateWindow(w.id, 'width', Number(e.target.value))} /></td>
                  <td className="p-1"><input type="number" step="0.1" className="w-12 border rounded px-1" value={w.height} onChange={(e) => updateWindow(w.id, 'height', Number(e.target.value))} /></td>
                  <td className="p-1">
                    <select className="border rounded px-1" value={w.orientation} onChange={(e) => updateWindow(w.id, 'orientation', e.target.value as Orientation)}>
                      {orientations.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="p-1"><input type="number" step="0.1" className="w-14 border rounded px-1" value={w.overhangDepth || ''} onChange={(e) => updateWindow(w.id, 'overhangDepth', Number(e.target.value))} placeholder="0.0" /></td>
                  <td className="p-1"><input type="number" step="0.1" className="w-14 border rounded px-1" value={w.distanceAboveWindow || ''} onChange={(e) => updateWindow(w.id, 'distanceAboveWindow', Number(e.target.value))} placeholder="0.0" /></td>
                  <td className="p-1">
                    <select
                      className="border rounded px-1 text-xs w-24"
                      onChange={(e) => {
                        const preset = windowPresets.find(p => p.label === e.target.value)
                        if (preset) {
                          updateWindow(w.id, 'uValue', preset.uValue)
                          updateWindow(w.id, 'shgc', preset.shgc)
                        }
                      }}
                    >
                      <option value="">Custom</option>
                      {windowPresets.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                    </select>
                  </td>
                  <td className="p-1"><input type="number" step="0.01" className="w-14 border rounded px-1" value={w.uValue} onChange={(e) => updateWindow(w.id, 'uValue', Number(e.target.value))} /></td>
                  <td className="p-1"><input type="number" step="0.01" className="w-14 border rounded px-1" value={w.shgc} onChange={(e) => updateWindow(w.id, 'shgc', Number(e.target.value))} /></td>
                  <td className="p-1"><button onClick={() => removeWindow(w.id)} className="text-red-500 font-bold hover:text-red-700">×</button></td>
                </tr>
              ))}
              {windows.length === 0 && <tr><td colSpan={10} className="text-center p-4">No windows added.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold border-b pb-2 flex-1">Doors</h3>
          <button onClick={addDoor} className="ml-2 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium hover:bg-blue-200">+ Add Door</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 bg-gray-50">
              <tr>
                <th className="px-2 py-1">Desc</th>
                <th className="px-2 py-1">W (ft)</th>
                <th className="px-2 py-1">H (ft)</th>
                <th className="px-2 py-1">Preset</th>
                <th className="px-2 py-1">U-Value</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {doors.map(d => (
                <tr key={d.id} className="border-b">
                  <td className="p-1"><input className="w-32 border rounded px-1" value={d.description} onChange={(e) => updateDoor(d.id, 'description', e.target.value)} /></td>
                  <td className="p-1"><input type="number" step="0.1" className="w-16 border rounded px-1" value={d.width} onChange={(e) => updateDoor(d.id, 'width', Number(e.target.value))} /></td>
                  <td className="p-1"><input type="number" step="0.1" className="w-16 border rounded px-1" value={d.height} onChange={(e) => updateDoor(d.id, 'height', Number(e.target.value))} /></td>
                  <td className="p-1">
                    <select
                      className="border rounded px-1 text-xs w-32"
                      onChange={(e) => {
                        const preset = doorPresets.find(p => p.label === e.target.value)
                        if (preset) {
                          updateDoor(d.id, 'uValue', preset.uValue)
                        }
                      }}
                    >
                      <option value="">Custom</option>
                      {doorPresets.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                    </select>
                  </td>
                  <td className="p-1"><input type="number" step="0.01" className="w-20 border rounded px-1" value={d.uValue} onChange={(e) => updateDoor(d.id, 'uValue', Number(e.target.value))} /></td>
                  <td className="p-1"><button onClick={() => removeDoor(d.id)} className="text-red-500 font-bold hover:text-red-700">×</button></td>
                </tr>
              ))}
              {doors.length === 0 && <tr><td colSpan={5} className="text-center p-4">No doors added.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold border-b pb-2 flex-1">Skylights</h3>
          <button onClick={onRescanSkylights} className="ml-2 bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-medium hover:bg-emerald-200 flex items-center gap-1">
             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
             Auto-Scan Roof
          </button>
          <button onClick={addSkylight} className="ml-2 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium hover:bg-blue-200">+ Add Skylight</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 bg-gray-50">
              <tr>
                <th className="px-2 py-1">Desc</th>
                <th className="px-2 py-1">W (ft)</th>
                <th className="px-2 py-1">H (ft)</th>
                <th className="px-2 py-1">U-Value</th>
                <th className="px-2 py-1">SHGC</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {skylights.map(s => (
                <tr key={s.id} className="border-b">
                  <td className="p-1"><input className="w-32 border rounded px-1" value={s.description} onChange={(e) => updateSkylight(s.id, 'description', e.target.value)} /></td>
                  <td className="p-1"><input type="number" step="0.1" className="w-16 border rounded px-1" value={s.width} onChange={(e) => updateSkylight(s.id, 'width', Number(e.target.value))} /></td>
                  <td className="p-1"><input type="number" step="0.1" className="w-16 border rounded px-1" value={s.height} onChange={(e) => updateSkylight(s.id, 'height', Number(e.target.value))} /></td>
                  <td className="p-1"><input type="number" step="0.01" className="w-20 border rounded px-1" value={s.uValue} onChange={(e) => updateSkylight(s.id, 'uValue', Number(e.target.value))} /></td>
                  <td className="p-1"><input type="number" step="0.01" className="w-20 border rounded px-1" value={s.shgc} onChange={(e) => updateSkylight(s.id, 'shgc', Number(e.target.value))} /></td>
                  <td className="p-1"><button onClick={() => removeSkylight(s.id)} className="text-red-500 font-bold hover:text-red-700">×</button></td>
                </tr>
              ))}
              {skylights.length === 0 && <tr><td colSpan={6} className="text-center p-4">No skylights added.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
