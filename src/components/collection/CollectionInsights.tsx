import { useMemo, useState, type ReactNode } from 'react'
import {
  BarChart3,
  ExternalLink,
  LineChart,
  Rocket,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'
import type { Activity, Collection, OpenSeaIntervals } from '../../types'
import { formatPrice } from '../../data/mockData'
import {
  buildInsightSeries,
  buildSalesDepth,
  computeInsightStats,
  filterActivitiesByRange,
  INSIGHT_RANGES,
  type InsightRange,
} from '../../lib/insights'
import { OPENSEA_DOCS } from '../../lib/opensea'

interface Props {
  activities: Activity[]
  floorPrice: number
  collectionId: string
  /** OpenSea interval analytics when available */
  intervals?: OpenSeaIntervals
  openseaUrl?: string
  collectionName?: string
  source?: Collection['source']
}

/** Prefer OpenSea Analytics intervals for matching ranges */
function openSeaRangeStats(
  range: InsightRange,
  intervals?: OpenSeaIntervals
): { sales: number; volume: number; label: string } | null {
  if (!intervals) return null
  switch (range) {
    case '1d':
      return { sales: intervals.sales1d, volume: intervals.volume1d, label: 'OpenSea 1D' }
    case '7d':
      return { sales: intervals.sales7d, volume: intervals.volume7d, label: 'OpenSea 7D' }
    case '30d':
      return { sales: intervals.sales30d, volume: intervals.volume30d, label: 'OpenSea 30D' }
    case 'all':
    case '1y':
      return {
        sales: intervals.salesTotal,
        volume: intervals.volumeTotal,
        label: 'OpenSea total',
      }
    default:
      return null
  }
}

export function CollectionInsights({
  activities,
  floorPrice,
  collectionId,
  intervals,
  openseaUrl,
  collectionName,
  source,
}: Props) {
  const [range, setRange] = useState<InsightRange>('7d')
  const seed = Math.abs(collectionId.split('').reduce((h, c) => h + c.charCodeAt(0), 0))

  const filtered = useMemo(
    () => filterActivitiesByRange(activities, range),
    [activities, range]
  )

  const localStats = useMemo(() => computeInsightStats(filtered), [filtered])
  // OpenSea intervals only for OpenSea-sourced collections; demo/on-chain uses local activity
  const osStats =
    source === 'opensea' ? openSeaRangeStats(range, intervals) : null
  // Prefer indexed intervals for on-chain demo when activity volume is present
  const chainIntervalStats =
    source !== 'opensea' && intervals
      ? openSeaRangeStats(range, intervals)
      : null

  const salesCount =
    osStats?.sales ?? chainIntervalStats?.sales ?? localStats.salesCount
  const salesVolume =
    osStats?.volume ?? chainIntervalStats?.volume ?? localStats.salesVolume
  const avgSale = salesCount ? salesVolume / salesCount : 0

  const series = useMemo(
    () => buildInsightSeries(filtered, range, floorPrice, seed),
    [filtered, range, floorPrice, seed]
  )
  const depth = useMemo(
    () => buildSalesDepth(activities, range, floorPrice),
    [activities, range, floorPrice]
  )

  const maxVol = Math.max(1, ...series.map((p) => p.volume))
  const maxDepth = Math.max(1, ...depth.map((d) => d.count))
  const floors = series.map((p) => p.floor)
  const minFloor = Math.min(...floors)
  const maxFloor = Math.max(...floors)
  const floorSpan = Math.max(maxFloor - minFloor, floorPrice * 0.02 || 0.0001)
  const floorChange =
    series.length >= 2
      ? ((series[series.length - 1].floor - series[0].floor) / (series[0].floor || 1)) * 100
      : 0

  const floorPath = useMemo(() => {
    if (series.length === 0) return ''
    const w = 100
    const h = 100
    const pts = series.map((p, i) => {
      const x = series.length === 1 ? 50 : (i / (series.length - 1)) * w
      const y = h - ((p.floor - minFloor) / floorSpan) * (h * 0.85) - h * 0.08
      return `${x},${y}`
    })
    return `M ${pts.join(' L ')}`
  }, [series, minFloor, floorSpan])

  const floorArea = useMemo(() => {
    if (series.length === 0) return ''
    const w = 100
    const h = 100
    const pts = series.map((p, i) => {
      const x = series.length === 1 ? 50 : (i / (series.length - 1)) * w
      const y = h - ((p.floor - minFloor) / floorSpan) * (h * 0.85) - h * 0.08
      return `${x},${y}`
    })
    return `M 0,${h} L ${pts.join(' L ')} L ${w},${h} Z`
  }, [series, minFloor, floorSpan])

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-hood" />
            Insights
            {source === 'opensea' && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-hood-muted text-hood">
                OpenSea data
              </span>
            )}
          </h2>
          <p className="text-sm text-ink-3 mt-0.5">
            Sales & mints by range · floor chart · sales depth
            {collectionName ? ` · ${collectionName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-edge bg-surface-2 p-0.5">
            {INSIGHT_RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={clsx(
                  'px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors',
                  range === r.id
                    ? 'bg-hood text-[#0b0e11] shadow-sm'
                    : 'text-ink-3 hover:text-ink'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {openseaUrl && (
            <a
              href={openseaUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-edge text-xs font-semibold text-ink-2 hover:text-hood hover:border-hood/40"
            >
              OpenSea <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Volume intervals (OpenSea API or on-chain indexed) */}
      {intervals && (
        <div className="rounded-2xl border border-edge bg-surface-2 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-ink">
              {source === 'opensea' ? 'OpenSea analytics intervals' : 'On-chain volume'}
            </h3>
            {source === 'opensea' ? (
              <a
                href={OPENSEA_DOCS.stats}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-hood font-medium hover:underline"
              >
                API: collection stats →
              </a>
            ) : (
              <span className="text-[11px] text-ink-3 font-medium">From marketplace events</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: '1D volume', vol: intervals.volume1d, sales: intervals.sales1d },
              { label: '7D volume', vol: intervals.volume7d, sales: intervals.sales7d },
              { label: '30D volume', vol: intervals.volume30d, sales: intervals.sales30d },
              { label: 'All volume', vol: intervals.volumeTotal, sales: intervals.salesTotal },
            ].map((row) => (
              <div key={row.label} className="rounded-xl border border-edge bg-surface px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-ink-3">{row.label}</div>
                <div className="text-sm font-bold text-hood tabular-nums mt-0.5">
                  {formatPrice(row.vol)} ETH
                </div>
                <div className="text-[11px] text-ink-3 tabular-nums">
                  {row.sales.toLocaleString()} sales
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <StatCard
          icon={<ShoppingCart className="w-3.5 h-3.5" />}
          label={osStats ? `${osStats.label} sales` : 'Sales'}
          value={salesCount.toLocaleString()}
        />
        <StatCard
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="Sales volume"
          value={`${formatPrice(salesVolume)} ETH`}
          accent
        />
        <StatCard
          label="Avg sale"
          value={salesCount ? `${formatPrice(avgSale)} ETH` : '—'}
        />
        <StatCard
          icon={<Rocket className="w-3.5 h-3.5" />}
          label="Mints (feed)"
          value={String(localStats.mintsCount)}
        />
        <StatCard
          label="Mint volume"
          value={`${formatPrice(localStats.mintVolume)} ETH`}
        />
        <StatCard label="Unique buyers" value={String(localStats.uniqueBuyers)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-edge bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-hood" />
                Sales volume
              </h3>
              <p className="text-xs text-ink-3">Volume by period · sales depth bars</p>
            </div>
            <span className="text-xs text-ink-3 font-medium">{range.toUpperCase()}</span>
          </div>

          <div className="mt-4 h-44 flex items-end gap-1 sm:gap-1.5">
            {series.map((p, i) => (
              <div
                key={`${p.label}-${i}`}
                className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full justify-end group"
              >
                <div className="opacity-0 group-hover:opacity-100 text-[9px] text-ink-2 tabular-nums font-medium transition-opacity whitespace-nowrap">
                  {formatPrice(p.volume)}
                </div>
                <div className="w-full flex-1 flex items-end relative">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-hood to-hood/60 hover:to-hood transition-colors min-h-[3px]"
                    style={{ height: `${Math.max(3, (p.volume / maxVol) * 100)}%` }}
                    title={`${p.label}: ${formatPrice(p.volume)} ETH · ${p.sales} sales · ${p.mints} mints`}
                  />
                </div>
                <span className="text-[9px] text-ink-3 truncate w-full text-center">
                  {p.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-edge bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
                <LineChart className="w-4 h-4 text-hood" />
                Floor price
              </h3>
              <p className="text-xs text-ink-3">
                Current OpenSea floor {formatPrice(floorPrice)} ETH
              </p>
            </div>
            <div
              className={clsx(
                'inline-flex items-center gap-1 text-xs font-bold tabular-nums px-2 py-1 rounded-lg',
                floorChange >= 0
                  ? 'bg-hood-muted text-hood'
                  : 'bg-[rgba(255,80,0,0.12)] text-[var(--color-danger)]'
              )}
            >
              {floorChange >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {floorChange >= 0 ? '+' : ''}
              {floorChange.toFixed(1)}%
            </div>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-ink tabular-nums">
              {formatPrice(floorPrice)}
            </span>
            <span className="text-sm font-semibold text-hood">ETH</span>
          </div>

          <div className="mt-3 h-40 relative">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="w-full h-full overflow-visible"
            >
              <defs>
                <linearGradient id="floorFillOs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(0,200,5)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="rgb(0,200,5)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y * 100}
                  x2="100"
                  y2={y * 100}
                  stroke="currentColor"
                  className="text-[var(--color-border)]"
                  strokeWidth="0.3"
                />
              ))}
              <path d={floorArea} fill="url(#floorFillOs)" />
              <path
                d={floorPath}
                fill="none"
                stroke="rgb(0,200,5)"
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-edge bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-bold text-ink">Sales depth</h3>
            <p className="text-xs text-ink-3">
              Sales clustered by price ({range.toUpperCase()})
            </p>
          </div>
          <span className="text-xs text-ink-3">Floor ~ {formatPrice(floorPrice)} ETH</span>
        </div>

        <div className="mt-5 h-48 flex items-end gap-1 sm:gap-1.5">
          {depth.map((d, i) => {
            const nearFloor =
              floorPrice > 0 && Math.abs(d.price - floorPrice) / floorPrice < 0.12
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center gap-1 h-full justify-end min-w-0 group"
              >
                <span className="text-[9px] text-ink-2 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.count}
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={clsx(
                      'w-full rounded-t-md min-h-[3px] transition-colors',
                      nearFloor
                        ? 'bg-hood'
                        : 'bg-[var(--color-surface-3)] group-hover:bg-hood/50'
                    )}
                    style={{ height: `${Math.max(3, (d.count / maxDepth) * 100)}%` }}
                    title={`${d.label} ETH · ${d.count} sales`}
                  />
                </div>
                <span className="text-[8px] sm:text-[9px] text-ink-3 truncate w-full text-center tabular-nums">
                  {d.label}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <p className="text-[11px] text-ink-3 text-center">
        Stats via OpenSea{' '}
        <a href={OPENSEA_DOCS.analytics} className="text-hood hover:underline" target="_blank" rel="noreferrer">
          Analytics & Events
        </a>
        {' · '}
        Robinhood Chain collections from{' '}
        <a
          href={OPENSEA_DOCS.robinhoodChain}
          className="text-hood hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          opensea.io/collections/chain/robinhood
        </a>
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string
  value: string
  accent?: boolean
  icon?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface-2 px-3 py-3 relative overflow-hidden">
      {accent && (
        <div className="absolute inset-0 bg-gradient-to-br from-hood/10 to-transparent pointer-events-none" />
      )}
      <div className="text-[10px] uppercase tracking-wide text-ink-3 font-medium relative flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div
        className={clsx(
          'text-sm font-bold mt-0.5 tabular-nums relative',
          accent ? 'text-hood' : 'text-ink'
        )}
      >
        {value}
      </div>
    </div>
  )
}
