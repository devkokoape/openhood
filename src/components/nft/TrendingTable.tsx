import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, TrendingUp } from 'lucide-react'
import type { Collection } from '../../types'
import { formatPrice } from '../../data/mockData'
import clsx from 'clsx'

export type TrendingRange = '24h' | '1d' | '7d' | '30d' | 'all'

const RANGES: { id: TrendingRange; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '1d', label: '1d' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'all', label: 'All' },
]

/** Volume for a collection in a given window (OpenSea intervals when present). */
export function collectionVolume(c: Collection, range: TrendingRange): number {
  const i = c.intervals
  switch (range) {
    case '24h':
      return i?.volume1d ?? c.volume24h
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

/** Compact OpenSea-style ranking table with time-range tabs */
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

  return (
    <div className="rounded-2xl border border-edge overflow-hidden bg-surface">
      {/* Range tabs */}
      <div className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 border-b border-edge bg-surface-2/60">
        <div className="flex gap-0.5 p-0.5 rounded-xl bg-surface border border-edge overflow-x-auto hide-scrollbar">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={clsx(
                'px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold tabular-nums transition-colors cursor-pointer shrink-0',
                range === r.id
                  ? 'bg-hood text-[#0b0e11] shadow-sm'
                  : 'text-ink-3 hover:text-ink'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-ink-3 font-medium uppercase tracking-wide hidden sm:inline shrink-0">
          By volume
        </span>
      </div>

      <div className="overflow-x-auto table-scroll">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3 border-b border-edge bg-surface-2/40">
              <th className="px-3 py-2.5 font-semibold w-10">#</th>
              <th className="px-3 py-2.5 font-semibold">Collection</th>
              <th className="px-3 py-2.5 font-semibold text-right">Floor</th>
              <th className="px-3 py-2.5 font-semibold text-right">
                {range === 'all' ? 'Total vol' : `${range} vol`}
              </th>
              <th className="px-3 py-2.5 font-semibold text-right hidden md:table-cell">
                Sales
              </th>
              <th className="px-3 py-2.5 font-semibold text-right hidden sm:table-cell w-[22%]">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, vol, sales }, i) => (
              <tr
                key={c.id}
                className="border-b border-edge last:border-0 hover:bg-surface-2/80 transition-colors group"
              >
                <td className="px-3 py-3 text-ink-3 tabular-nums font-medium">{i + 1}</td>
                <td className="px-3 py-3">
                  <Link
                    to={`/collection/${c.slug}`}
                    className="flex items-center gap-2.5 group/link min-w-0"
                  >
                    <img
                      src={c.image}
                      alt=""
                      className="w-9 h-9 rounded-lg object-cover shrink-0 ring-1 ring-edge"
                    />
                    <span className="font-semibold text-ink group-hover/link:text-hood truncate flex items-center gap-1">
                      {c.name}
                      {c.verified && (
                        <BadgeCheck className="w-3.5 h-3.5 text-hood shrink-0" />
                      )}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink">
                  {formatPrice(c.floorPrice)}{' '}
                  <span className="text-hood text-[10px]">ETH</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink">
                  <span className="inline-flex items-center gap-1 justify-end">
                    {i < 3 && vol > 0 && (
                      <TrendingUp className="w-3 h-3 text-hood shrink-0" />
                    )}
                    {formatPrice(vol)}{' '}
                    <span className="text-ink-3 text-[10px]">ETH</span>
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-2 hidden md:table-cell">
                  {sales > 0 ? sales.toLocaleString() : '—'}
                </td>
                <td className="px-3 py-3 hidden sm:table-cell">
                  <div className="flex items-center gap-2 justify-end">
                    <div className="flex-1 max-w-[100px] h-1.5 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-hood/80 transition-all duration-500"
                        style={{ width: `${Math.min(100, (vol / maxVol) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-ink-3 tabular-nums w-8 text-right">
                      {((vol / maxVol) * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-ink-3 text-sm">
                  No collections yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
