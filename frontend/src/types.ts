export type Orientation = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

export interface WindowEntry {
  id: string
  width: number
  height: number
  orientation: Orientation
  uValue: number
  shgc: number
  description: string
  overhangDepth?: number
  distanceAboveWindow?: number
}

export interface DoorEntry {
  id: string
  width: number
  height: number
  uValue: number
  description: string
}

export interface SkylightEntry {
  id: string
  width: number
  height: number
  uValue: number
  shgc: number
  description: string
}

export type DuctLocation = 'Attic' | 'Crawlspace' | 'Conditioned Space'
export type DuctLeakage = 'Tight (5%)' | 'Average (10%)' | 'Leaky (15%)'

export interface DuctSystem {
  location: DuctLocation
  insulationRValue: number
  leakage: DuctLeakage
}

export type FoundationType = 'Slab' | 'Crawlspace' | 'Basement'

export interface Foundation {
  type: FoundationType
  rValue: number
}

export type AtticType = 'Vented' | 'Unvented' | 'No Attic'

export interface Attic {
  type: AtticType
  rValue: number
}

export type EnvelopeTightness = 'Tight' | 'Average' | 'Loose'

export interface Envelope {
  tightness: EnvelopeTightness
  fireplaces: number
}
