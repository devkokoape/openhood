import { Link } from 'react-router-dom'
import { BadgeCheck } from 'lucide-react'
import type { Collection } from '../../types'
import { formatPrice } from '../../data/mockData'

/** Compact OpenSea-style ranking table */
export function TrendingTable({ collections }: { collections: Collection[] }) {
  const rows = [...collections].sort((a, b) => b.volume24h - a.volume24h).slice(0, 8)

  return (
    <div className="rounded-2xl border border-edge overflow-hidden bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3 border-b border-edge bg-surface-2/80">
              <th className="px-3 py-2.5 font-semibold w-10">#</th>
              <th className="px-3 py-2.5 font-semibold">Collection</th>
              <th className="px-3 py-2.5 font-semibold text-right">Floor</th>
              <th className="px-3 py-2.5 font-semibold text-right">24h vol</th>
              <th className="px-3 py-2.5 font-semibold text-right hidden sm:table-cell">Owners</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr
                key={c.id}
                className="border-b border-edge last:border-0 hover:bg-surface-2/80 transition-colors"
              >
                <td className="px-3 py-3 text-ink-3 tabular-nums font-medium">{i + 1}</td>
                <td className="px-3 py-3">
                  <Link
                    to={`/collection/${c.slug}`}
                    className="flex items-center gap-2.5 group min-w-0"
                  >
                    <img
                      src={c.image}
                      alt=""
                      className="w-9 h-9 rounded-lg object-cover shrink-0 ring-1 ring-edge"
                    />
                    <span className="font-semibold text-ink group-hover:text-hood truncate flex items-center gap-1">
                      {c.name}
                      {c.verified && <BadgeCheck className="w-3.5 h-3.5 text-hood shrink-0" />}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink">
                  {formatPrice(c.floorPrice)}{' '}
                  <span className="text-hood text-[10px]">ETH</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink">
                  {formatPrice(c.volume24h)}{' '}
                  <span className="text-ink-3 text-[10px]">ETH</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-2 hidden sm:table-cell">
                  {c.owners.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
