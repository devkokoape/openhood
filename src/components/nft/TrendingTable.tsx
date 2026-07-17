import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Crown, TrendingUp } from 'lucide-react'
import type { Collection } from '../../types'
import { formatPrice } from '../../data/mockData'
import { prefetchCollectionCatalog } from '../../lib/prefetchCatalog'
import clsx from 'clsx'

export type TrendingRange = '24h' | '1d' | '7d' | '30d' | 'all'

const RANGES: { id: TrendingRange; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '1d', label: '1d' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'all', label: 'All' },
]

export function collectionVolume(c: Collection, range: TrendingRange): number {
  const i = c.intervals
  switch (range) {
    case '24h':
    case '1d':
      return i?.volume1d ?? c.volume24h
    case '7d':
      return i?.volume7d ?? c.volume24h * 4.5
    case '30d':
      return i?.volume30d ?? c.volumeTotal * 0.35
    case 'all':
      return i?.volumeTotal ?? c.volumeTotal
    default:
      return c.volume24h
  }
}

export function collectionSales(c: Collection, range: TrendingRange): number {
  const i = c.intervals
  switch (range) {
    case '24h':
    case '1d':
      return i?.sales1d ?? 0
    case '7d':
      return i?.sales7d ?? 0
    case '30d':
      return i?.sales30d ?? 0
    case 'all':
      return i?.salesTotal ?? c.salesTotal ?? 0
    default:
      return 0
  }
}

function rankStyle(rank: number) {
  if (rank === 1)
    return 'bg-gradient-to-br from-hood to-[#00a804] text-[#0b0e11] shadow-md shadow-hood/25'
  if (rank === 2)
    return 'bg-gradient-to-br from-zinc-300 to-zinc-400 text-zinc-900 dark:from-zinc-500 dark:to-zinc-600 dark:text-white'
  if (rank === 3)
    return 'bg-gradient-to-br from-amber-600/90 to-amber-800 text-white'
  return 'bg-surface-3 text-ink-3'
}

/** Stylish ranking board with time-range pills */
export function TrendingTable({
  collections,
  limit = 10,
}: {
  collections: Collection[]
  limit?: number
}) {
  const [range, setRange] = useState<TrendingRange>('24h')

  const rows = useMemo(() => {
    return [...collections]
      .map((c) => ({
        c,
        vol: collectionVolume(c, range),
        sales: collectionSales(c, range),
      }))
      .sort((a, b) => b.vol - a.vol)
      .slice(0, limit)
  }, [collections, range, limit])

  const maxVol = Math.max(1, ...rows.map((r) => r.vol))
  const totalVol = rows.reduce((s, r) => s + r.vol, 0)

  return (
    <div className="rounded-2xl border border-edge overflow-hidden bg-surface relative">
      {/* Soft brand glow */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-hood/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 w-40 h-40 rounded-full bg-hood/5 blur-3xl" />

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 sm:px-4 py-3 border-b border-edge bg-gradient-to-r from-surface-2/90 via-surface-2/50 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-hood/15 border border-hood/25 flex items-center justify-center shrink-0">
            <Crown className="w-4 h-4 text-hood" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-ink leading-tight">Leaderboard</div>
            <div className="text-[11px] text-ink-3 tabular-nums">
              {range === 'all' ? 'All-time' : range} vol · {formatPrice(totalVol)} ETH
            </div>
          </div>
        </div>

        <div className="flex gap-0.5 p-1 rounded-xl bg-surface border border-edge shadow-inner overflow-x-auto hide-scrollbar shrink-0">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={clsx(
                'px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold tabular-nums transition-all cursor-pointer shrink-0',
                range === r.id
                  ? 'bg-hood text-[#0b0e11] shadow-sm shadow-hood/30 scale-[1.02]'
                  : 'text-ink-3 hover:text-ink hover:bg-surface-2'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rows as stylish cards */}
      <div className="relative divide-y divide-[var(--color-border)]">
        {rows.map(({ c, vol, sales }, i) => {
          const rank = i + 1
          const share = (vol / maxVol) * 100
          return (
            <Link
              key={c.id}
              to={`/collection/${c.slug}`}
              onMouseEnter={() => prefetchCollectionCatalog(c)}
              onFocus={() => prefetchCollectionCatalog(c)}
              className="group flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-hood-muted/30 transition-colors relative overflow-hidden"
            >
              {/* Volume share bar background */}
              <div
                className="absolute inset-y-0 left-0 bg-hood/[0.04] dark:bg-hood/[0.07] transition-all duration-500 pointer-events-none"
                style={{ width: `${share}%` }}
              />

              <div
                className={clsx(
                  'relative z-[1] w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-[11px] sm:text-xs font-extrabold tabular-nums shrink-0',
                  rankStyle(rank)
                )}
              >
                {rank}
              </div>

              <img
                src={c.image}
                alt=""
                className="relative z-[1] w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover shrink-0 ring-1 ring-edge group-hover:ring-hood/40 transition-all"
              />

              <div className="relative z-[1] flex-1 min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="font-bold text-sm text-ink truncate group-hover:text-hood transition-colors">
                    {c.name}
                  </span>
                  {c.verified && (
                    <BadgeCheck className="w-3.5 h-3.5 text-hood shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-ink-3">
                  <span className="tabular-nums">
                    Floor{' '}
                    <span className="font-semibold text-ink">
                      {formatPrice(c.floorPrice)}
                    </span>
                  </span>
                  <span className="text-edge">·</span>
                  <span className="tabular-nums hidden sm:inline">
                    {c.owners.toLocaleString()} owners
                  </span>
                  {sales > 0 && (
                    <>
                      <span className="text-edge sm:hidden">·</span>
                      <span className="tabular-nums sm:hidden">
                        {sales.toLocaleString()} sales
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="relative z-[1] text-right shrink-0 pl-1">
                <div className="inline-flex items-center gap-1 justify-end">
                  {rank <= 3 && vol > 0 && (
                    <TrendingUp className="w-3 h-3 text-hood shrink-0" />
                  )}
                  <span className="text-sm font-extrabold tabular-nums text-ink">
                    {formatPrice(vol)}
                  </span>
                  <span className="text-[10px] font-bold text-hood">ETH</span>
                </div>
                <div className="text-[10px] text-ink-3 tabular-nums mt-0.5">
                  {range === 'all' ? 'total' : `${range}`} vol
                  {sales > 0 && (
                    <span className="hidden sm:inline">
                      {' '}
                      · {sales.toLocaleString()} sales
                    </span>
                  )}
                </div>
              </div>
            </Link>
          )
        })}

        {rows.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-ink-3">No collections yet.</p>
        )}
      </div>
    </div>
  )
}
