import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { Coords, getPosition } from './geo'
import {
  fetchStations,
  nearestStationGroup,
  fetchPredictions,
  type Station,
} from './wmata'
import { buildBoard } from './board'

const REFRESH_MS = 20_000
const STATIONS_KEY = 'metro.stations.v1'
const STATIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // station list rarely changes

// Last-resort coordinates (Metro Center) so the board still shows something if
// location is denied and no VITE_DEFAULT_* override is set.
const FALLBACK: Coords = {
  lat: Number(import.meta.env.VITE_DEFAULT_LAT ?? 38.898303),
  lon: Number(import.meta.env.VITE_DEFAULT_LON ?? -77.028099),
}

const bridge = await waitForEvenAppBridge()

// ---- Glasses page: one full-canvas text container we keep upgrading ----------
const board = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 8,
  containerID: 1,
  containerName: 'board',
  content: 'Locating nearest\nMetro station…',
  isEventCapture: 1,
})

const created = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: [board] }),
)
if (created !== 0) console.error('createStartUpPageContainer failed:', created)

// Serialize bridge writes so rapid refreshes/taps can't overlap on the wire.
let writing: Promise<unknown> = Promise.resolve()
function render(text: string) {
  mirror(text)
  writing = writing.then(() =>
    bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 1, containerName: 'board', content: text }),
    ),
  )
  return writing
}

// ---- Station list (cached in SDK storage; survives restarts) -----------------
async function loadStations(): Promise<Station[]> {
  try {
    const raw = await bridge.getLocalStorage(STATIONS_KEY)
    if (raw) {
      const cached = JSON.parse(raw) as { at: number; stations: Station[] }
      if (Date.now() - cached.at < STATIONS_TTL_MS && cached.stations.length) {
        return cached.stations
      }
    }
  } catch {
    /* ignore corrupt cache */
  }
  const stations = await fetchStations()
  try {
    await bridge.setLocalStorage(STATIONS_KEY, JSON.stringify({ at: Date.now(), stations }))
  } catch {
    /* storage best-effort */
  }
  return stations
}

async function resolveCoords(): Promise<Coords> {
  try {
    return await getPosition()
  } catch (e) {
    console.warn('Geolocation unavailable, using fallback:', (e as Error).message)
    return FALLBACK
  }
}

// ---- Refresh cycle -----------------------------------------------------------
let stations: Station[] = []
let refreshing = false

async function refresh() {
  if (refreshing) return
  refreshing = true
  try {
    if (stations.length === 0) stations = await loadStations()
    const here = await resolveCoords()
    const group = nearestStationGroup(stations, here)
    if (!group) {
      await render('No stations found.\nTap to retry.')
      return
    }
    const trains = await fetchPredictions(group.codes)
    await render(
      buildBoard({
        stationName: group.primary.name,
        distanceMiles: group.distanceMiles,
        trains,
        updatedAt: new Date(),
      }),
    )
    status(`${group.primary.name} · ${trains.length} trains`)
  } catch (e) {
    const msg = (e as Error).message || 'Unknown error'
    console.error('refresh failed:', msg)
    await render(`Couldn't load trains.\n\n${msg}\n\nTap to retry.`)
    status('Error: ' + msg)
  } finally {
    refreshing = false
  }
}

// ---- Input + lifecycle -------------------------------------------------------
// Protobuf omits zero-value fields, so CLICK_EVENT (0) can arrive as undefined —
// always coalesce before comparing. Taps/double-taps come via sysEvent.
const unsubscribe = bridge.onEvenHubEvent((event) => {
  const sysType = event.sysEvent?.eventType ?? null

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    bridge.shutDownPageContainer(1)
    return
  }
  if (sysType === OsEventTypeList.CLICK_EVENT) {
    refresh().catch((err) => console.error(err))
    return
  }
  if (
    sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
    sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
  ) {
    cleanup()
  }
})

const timer = window.setInterval(() => {
  refresh().catch((err) => console.error(err))
}, REFRESH_MS)

let cleanedUp = false
function cleanup() {
  if (cleanedUp) return
  cleanedUp = true
  window.clearInterval(timer)
  unsubscribe()
}
window.addEventListener('beforeunload', cleanup)

// Kick off the first load.
refresh().catch((err) => console.error(err))

// ---- Companion-app mirror (phone screen) ------------------------------------
function mirror(text: string) {
  const el = document.getElementById('mirror')
  if (el) el.textContent = text
}
function status(text: string) {
  const el = document.getElementById('status')
  if (el) el.textContent = text
}
