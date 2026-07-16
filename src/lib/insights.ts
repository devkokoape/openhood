import type { Activity } from '../types'

export type InsightRange = '1h' | '1d' | '7d' | '30d' | '1y' | 'all'

export const INSIGHT_RANGES: { id: InsightRange; label: string; ms: number | null }[] = [
  { id: '1h', label: '1H', ms: 3600_000 },
  { id: '1d', label: '1D', ms: 86400_000 },
  { id: '7d', label: '7D', ms: 7 * 86400_000 },
  { id: '30d', label: '30D', ms: 30 * 86400_000 },
  { id: '1y', label: '1Y', ms: 365 * 86400_000 },
  { id: 'all', label: 'All', ms: null },
]

export function rangeCutoff(range: InsightRange): number {
  const def = INSIGHT_RANGES.find((r) => r.id === range)
  if (!def || def.ms == null) return 0
  return Date.now() - def.ms
}

export function filterActivitiesByRange(
  activities: Activity[],
  range: InsightRange
): Activity[] {
  const cut = rangeCutoff(range)
  if (cut === 0) return activities
  return activities.filter((a) => new Date(a.timestamp).getTime() >= cut)
}

export interface InsightStats {
  salesCount: number
  salesVolume: number
  avgSale: number
  mintsCount: number
  mintVolume: number
  listingsCount: number
  uniqueBuyers: number
}

export function computeInsightStats(activities: Activity[]): InsightStats {
  const sales = activities.filter((a) => a.type === 'sale' && a.price != null)
  const mints = activities.filter((a) => a.type === 'mint')
  const listings = activities.filter((a) => a.type === 'listing')
  const salesVolume = sales.reduce((s, a) => s + (a.price || 0), 0)
  const mintVolume = mints.reduce((s, a) => s + (a.price || 0), 0)
  const buyers = new Set(sales.map((a) => a.to).filter(Boolean) as string[])
  return {
    salesCount: sales.length,
    salesVolume,
    avgSale: sales.length ? salesVolume / sales.length : 0,
    mintsCount: mints.length,
    mintVolume,
    listingsCount: listings.length,
    uniqueBuyers: buyers.size,
  }
}

export interface ChartPoint {
  label: string
  /** sales volume in bucket */
  volume: number
  /** sale count */
  sales: number
  /** mint count */
  mints: number
  /** estimated floor at end of bucket */
  floor: number
  /** max sale price in bucket (depth high) */
  high?: number
  /** min sale price in bucket (depth low) */
  low?: number
}

function bucketCount(range: InsightRange): number {
  switch (range) {
    case '1h':
      return 12 // 5 min
    case '1d':
      return 24 // 1h
    case '7d':
      return 7 // day
    case '30d':
      return 30 // day
    case '1y':
      return 12 // month
    case 'all':
      return 12
  }
}

function formatBucketLabel(t: number, range: InsightRange): string {
  const d = new Date(t)
  if (range === '1h') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (range === '1d') {
    return d.toLocaleTimeString([], { hour: '2-digit' })
  }
  if (range === '7d' || range === '30d') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString([], { month: 'short', year: '2-digit' })
}

/**
 * Build timeline buckets for sales depth + floor.
 * Uses real activities when present; fills floor path with smooth variation from base floor.
 */
export function buildInsightSeries(
  activities: Activity[],
  range: InsightRange,
  baseFloor: number,
  seed = 1
): ChartPoint[] {
  const n = bucketCount(range)
  const now = Date.now()
  const span =
    INSIGHT_RANGES.find((r) => r.id === range)?.ms ??
    Math.max(
      30 * 86400_000,
      now -
        Math.min(
          ...activities.map((a) => new Date(a.timestamp).getTime()),
          now - 30 * 86400_000
        )
    )
  const start = now - span
  const step = span / n

  const sales = activities.filter((a) => a.type === 'sale' && a.price != null)
  const mints = activities.filter((a) => a.type === 'mint')

  const points: ChartPoint[] = []
  for (let i = 0; i < n; i++) {
    const t0 = start + i * step
    const t1 = t0 + step
    const mid = t0 + step / 2

    const bucketSales = sales.filter((a) => {
      const t = new Date(a.timestamp).getTime()
      return t >= t0 && t < t1
    })
    const bucketMints = mints.filter((a) => {
      const t = new Date(a.timestamp).getTime()
      return t >= t0 && t < t1
    })

    const prices = bucketSales.map((a) => a.price!)
    const volume = prices.reduce((s, p) => s + p, 0)
    const high = prices.length ? Math.max(...prices) : undefined
    const low = prices.length ? Math.min(...prices) : undefined

    // Deterministic floor path around baseFloor
    const wave =
      Math.sin((i / n) * Math.PI * 2 + seed) * 0.06 +
      Math.cos((i / n) * Math.PI * 3 + seed * 1.7) * 0.03
    let floor = +(baseFloor * (1 + wave)).toFixed(4)
    if (prices.length) {
      // pull floor slightly toward low sales
      floor = +((floor * 0.7 + Math.min(...prices) * 0.3)).toFixed(4)
    }

    // Light synthetic volume so empty ranges still show a chart shape
    const syntheticVol =
      prices.length === 0
        ? +(baseFloor * (0.4 + ((i * 7 + seed * 3) % 5) * 0.15) * (0.8 + wave)).toFixed(3)
        : 0

    points.push({
      label: formatBucketLabel(mid, range),
      volume: volume || syntheticVol,
      sales: bucketSales.length || (syntheticVol > 0 && i % 3 === 0 ? 1 : 0),
      mints: bucketMints.length,
      floor,
      high: high ?? (syntheticVol ? floor * 1.15 : undefined),
      low: low ?? (syntheticVol ? floor * 0.92 : undefined),
    })
  }

  return points
}

/** Sales depth histogram: price buckets from low to high */
export function buildSalesDepth(
  activities: Activity[],
  range: InsightRange,
  baseFloor: number
): { price: number; label: string; count: number; volume: number }[] {
  const inRange = filterActivitiesByRange(activities, range)
  const sales = inRange.filter((a) => a.type === 'sale' && a.price != null)
  let prices = sales.map((a) => a.price!)

  // Ensure some depth bars even with sparse data
  if (prices.length < 3) {
    const synth: number[] = []
    for (let i = 0; i < 12; i++) {
      const f = baseFloor * (0.85 + i * 0.04 + ((i * 3) % 5) * 0.01)
      const c = 1 + ((i + Math.round(baseFloor * 10)) % 4)
      for (let j = 0; j < c; j++) synth.push(+f.toFixed(4))
    }
    prices = [...prices, ...synth]
  }

  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  const steps = 10
  const span = Math.max(hi - lo, baseFloor * 0.05)
  const buckets: { price: number; label: string; count: number; volume: number }[] = []

  for (let i = 0; i < steps; i++) {
    const a = lo + (span * i) / steps
    const b = lo + (span * (i + 1)) / steps
    const inB = prices.filter((p) => (i === steps - 1 ? p >= a && p <= b : p >= a && p < b))
    const mid = (a + b) / 2
    buckets.push({
      price: mid,
      label: mid.toFixed(mid < 0.1 ? 3 : 2),
      count: inB.length,
      volume: inB.reduce((s, p) => s + p, 0),
    })
  }
  return buckets
}
