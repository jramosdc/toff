// Geolocation + distance helpers. The Even Hub SDK has no GPS API; per the
// Even docs you use the WebView's standard navigator.geolocation and declare
// the `location` permission in app.json.

export interface Coords {
  lat: number
  lon: number
}

/** Resolve the device's current position, or reject on denial/timeout. */
export function getPosition(timeoutMs = 8000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not available'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.message || 'Location permission denied')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    )
  })
}

const toRad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance between two points, in miles. */
export function haversineMiles(a: Coords, b: Coords): number {
  const R = 3958.8 // Earth radius, miles
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
