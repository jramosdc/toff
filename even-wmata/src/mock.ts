// Offline mock data. Enable with VITE_WMATA_MOCK=1 to develop the board UI
// without a WMATA API key or network — handy in the simulator. Coordinates
// are Metro Center so nearest-station logic resolves there.

import type { Station, Train } from './wmata'

const metroCenter: Station = {
  code: 'A01',
  name: 'Metro Center',
  coords: { lat: 38.898303, lon: -77.028099 },
  together: ['C01'],
}

const metroCenterLower: Station = {
  code: 'C01',
  name: 'Metro Center',
  coords: { lat: 38.898303, lon: -77.028099 },
  together: ['A01'],
}

const predictions: Train[] = [
  { line: 'RD', destination: 'Glenmont', min: 'BRD', car: '8', group: '1' },
  { line: 'RD', destination: 'Glenmont', min: '7', car: '6', group: '1' },
  { line: 'RD', destination: 'Shady Grove', min: 'ARR', car: '8', group: '2' },
  { line: 'RD', destination: 'Shady Grove', min: '9', car: '8', group: '2' },
  { line: 'BL', destination: 'Largo Town Center', min: '3', car: '6', group: '1' },
  { line: 'SV', destination: 'Downtown Largo', min: '11', car: '8', group: '1' },
  { line: 'OR', destination: 'Vienna', min: '5', car: '8', group: '2' },
  { line: 'SV', destination: 'Ashburn', min: '12', car: '8', group: '2' },
]

export const MOCK: { stations: Station[]; predictions: Train[] } = {
  stations: [metroCenter, metroCenterLower],
  predictions,
}
