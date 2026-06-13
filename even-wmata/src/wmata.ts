// Thin WMATA client. Returns just the fields the board needs.
//
// Endpoints used:
//   GET /Rail.svc/json/jStations                  -> all stations (+ lat/lon)
//   GET /StationPrediction.svc/json/GetPrediction/{codes}  -> live arrivals
//
// `Group` ('1' | '2') on a prediction is the platform/track — i.e. the two
// opposite travel directions, exactly like the signs in the station.

import { Coords, haversineMiles } from './geo'
import { MOCK } from './mock'

const BASE = (import.meta.env.VITE_WMATA_BASE ?? '/api/wmata').replace(/\/+$/, '')
const KEY = import.meta.env.VITE_WMATA_API_KEY ?? ''
const USE_MOCK = import.meta.env.VITE_WMATA_MOCK === '1'

export interface Station {
  code: string
  name: string
  coords: Coords
  /** Codes for the other platforms of the same physical complex (transfers). */
  together: string[]
}

export interface Train {
  /** Two-letter line code: RD, OR, BL, SV, GR, YL (or '' / 'No' for non-revenue). */
  line: string
  destination: string
  /** Raw WMATA value: 'BRD', 'ARR', a minute count, or '' / '---'. */
  min: string
  /** Number of cars as a string (e.g. '8'), or '' if unknown. */
  car: string
  /** Platform/direction group: '1' or '2'. */
  group: string
}

/** A station plus every platform code at the same physical location. */
export interface StationGroup {
  primary: Station
  codes: string[]
  distanceMiles: number
}

async function wmataGet<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  const url = KEY ? `${BASE}${path}${sep}api_key=${encodeURIComponent(KEY)}` : `${BASE}${path}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`WMATA ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

interface RawStation {
  Code: string
  Name: string
  Lat: number
  Lon: number
  StationTogether1?: string
  StationTogether2?: string
}

/** Fetch and normalise the full station list. */
export async function fetchStations(): Promise<Station[]> {
  if (USE_MOCK) return MOCK.stations
  const data = await wmataGet<{ Stations: RawStation[] }>('/Rail.svc/json/jStations')
  return data.Stations.map((s) => ({
    code: s.Code,
    name: s.Name,
    coords: { lat: s.Lat, lon: s.Lon },
    together: [s.StationTogether1, s.StationTogether2].filter(
      (c): c is string => !!c && c.trim().length > 0,
    ),
  }))
}

/** Find the closest station and collect all platform codes at that location. */
export function nearestStationGroup(stations: Station[], here: Coords): StationGroup | null {
  if (stations.length === 0) return null

  let primary = stations[0]
  let best = haversineMiles(here, primary.coords)
  for (const s of stations) {
    const d = haversineMiles(here, s.coords)
    if (d < best) {
      best = d
      primary = s
    }
  }

  // A transfer complex spans multiple station codes (linked via StationTogether)
  // and/or shares a display name. Union them so we query every platform.
  const codes = new Set<string>([primary.code, ...primary.together])
  for (const s of stations) {
    if (s.name === primary.name || s.together.includes(primary.code)) {
      codes.add(s.code)
      s.together.forEach((c) => codes.add(c))
    }
  }

  return { primary, codes: [...codes], distanceMiles: best }
}

interface RawPrediction {
  LocationCode: string
  Line: string
  DestinationName: string
  Min: string
  Car: string
  Group: string
}

/** Fetch live predictions for one or more station codes. */
export async function fetchPredictions(codes: string[]): Promise<Train[]> {
  if (USE_MOCK) return MOCK.predictions
  const joined = codes.join(',')
  const data = await wmataGet<{ Trains: RawPrediction[] }>(
    `/StationPrediction.svc/json/GetPrediction/${joined}`,
  )
  return data.Trains.map((t) => ({
    line: t.Line ?? '',
    destination: t.DestinationName ?? '',
    min: t.Min ?? '',
    car: t.Car ?? '',
    group: t.Group ?? '',
  }))
}
