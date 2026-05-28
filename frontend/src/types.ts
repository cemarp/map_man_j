export type Orientation = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

export interface WindowEntry {
  id: string
  width: number
  height: number
  orientation: Orientation
  uValue: number
  shgc: number
  description: string
}

export interface DoorEntry {
  id: string
  width: number
  height: number
  uValue: number
  description: string
}
