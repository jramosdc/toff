// Renders predictions into the station-style board text shown on the glasses.
// The G2 canvas is 576x288 (~10 lines of ~40 chars), so we budget tightly:
// a 2-line header + two direction sections of up to 3 trains each = 10 lines.

import type { Train } from './wmata'

const TRAINS_PER_DIRECTION = 3
const DEST_WIDTH = 15

// Non-revenue / placeholder trains the API sometimes returns.
const SKIP_DEST = /^(no passenger|nopsngr|ssenger|train|no|-+)$/i

function usable(t: Train): boolean {
  return !!t.destination && !SKIP_DEST.test(t.destination.trim())
}

/** WMATA's Min is 'BRD' (boarding), 'ARR' (arriving), a number, or blank. */
function formatMin(min: string): string {
  const m = min.trim().toUpperCase()
  if (m === 'BRD' || m === 'ARR') return m
  if (/^\d+$/.test(m)) return m
  return '--'
}

/** Sort key for arrival time: boarding/arriving first, then minutes ascending. */
function minRank(min: string): number {
  const m = min.trim().toUpperCase()
  if (m === 'BRD') return -2
  if (m === 'ARR') return -1
  if (/^\d+$/.test(m)) return Number(m)
  return Number.POSITIVE_INFINITY
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function trainLine(t: Train): string {
  const line = (t.line || '??').toUpperCase().slice(0, 2)
  const dest = clip(t.destination.trim(), DEST_WIDTH).padEnd(DEST_WIDTH)
  const min = formatMin(t.min).padStart(3)
  return ` ${line} ${dest} ${min}`
}

/** A short label for a direction, derived from its distinct destinations. */
function directionLabel(trains: Train[]): string {
  const seen: string[] = []
  for (const t of trains) {
    const d = t.destination.trim()
    if (d && !seen.includes(d)) seen.push(d)
    if (seen.length === 2) break
  }
  if (seen.length === 0) return 'To —'
  return 'To ' + seen.map((d) => clip(d, 13)).join(' / ')
}

export interface BoardInput {
  stationName: string
  distanceMiles: number
  trains: Train[]
  updatedAt: Date
}

function clockLabel(d: Date): string {
  let h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'p' : 'a'
  h = h % 12 || 12
  return `${h}:${m}${ampm}`
}

/** Build the multi-line board string for the glasses display. */
export function buildBoard(input: BoardInput): string {
  const { stationName, distanceMiles, trains, updatedAt } = input

  const revenue = trains
    .filter(usable)
    .sort((a, b) => minRank(a.min) - minRank(b.min))
  const g1 = revenue.filter((t) => t.group === '1')
  const g2 = revenue.filter((t) => t.group === '2')

  const dist = distanceMiles < 0.1 ? '<0.1' : distanceMiles.toFixed(1)
  const lines: string[] = [
    clip(stationName, 24),
    `${dist} mi · ${clockLabel(updatedAt)}`,
  ]

  const section = (group: Train[]) => {
    if (group.length === 0) {
      lines.push('To —', ' (no trains)')
      return
    }
    lines.push(directionLabel(group))
    for (const t of group.slice(0, TRAINS_PER_DIRECTION)) lines.push(trainLine(t))
  }

  section(g1)
  section(g2)

  return lines.join('\n')
}
