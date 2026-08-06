// V2-B — src/features/home/road.ts
// Pure geometry + pacing for the Home winding road. Ported verbatim from
// the mock (ui_kits/roadmap/App.jsx L40-83); no store imports.

export const ROAD_ROW_H = 56
export const ROAD_XMID = 36
const ROAD_AMP = 22

type Pt = { x: number; y: number }

function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || pts[i + 1]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

export type RoadGeometry = {
  dOpen: string
  dClosed: string
  H: number
  xs: number[]
  cap: number
  boundaryY: number
}

export function roadGeometry(n: number, cap: number): RoadGeometry {
  const xs = Array.from({ length: n }, (_, i) => ROAD_XMID + ROAD_AMP * Math.sin(i * 1.15 + 0.4))
  const markers = xs.map((x, i) => ({ x, y: i * ROAD_ROW_H + ROAD_ROW_H / 2 }))
  const H = n * ROAD_ROW_H
  const leadIn = { x: xs[0], y: -10 }
  const leadOut = { x: xs[n - 1], y: H + 10 }
  cap = Math.max(1, Math.min(cap, n))
  if (cap >= n) return { dOpen: smoothPath([leadIn, ...markers, leadOut]), dClosed: '', H, xs, cap, boundaryY: H }
  const boundaryY = cap * ROAD_ROW_H
  const bpt = { x: (xs[cap - 1] + xs[cap]) / 2, y: boundaryY }
  return {
    dOpen: smoothPath([leadIn, ...markers.slice(0, cap), bpt]),
    dClosed: smoothPath([bpt, ...markers.slice(cap), leadOut]),
    H, xs, cap, boundaryY,
  }
}

// How many stops before the road "closes" — tighter as the night wears on.
export function workCap(hour: number): number {
  if (hour >= 23 || hour < 6) return 1
  if (hour >= 21) return 2
  if (hour >= 19) return 4
  return 6
}

export function barrierMessage(hour: number): string {
  if (hour >= 23 || hour < 6) return '🌙 Rest now — tomorrow needs you sharp'
  if (hour >= 21) return '🌙 Wind down — park the rest for tomorrow'
  if (hour >= 19) return '🌆 Evening cap — wrap up soon'
  return '🛑 Daily limit — stop here'
}
