/**
 * Compact one-row collection tile for "Notable collections" (7d sales leaders).
 */
import { Link } from 'react-router-dom'
import { BadgeCheck, Flame } from 'lucide-react'
import type { Collection } from '../../types'
import { formatPrice } from '../../data/mockData'
import { prefetchCollectionCatalog } from '../../lib/prefetchCatalog'
import clsx from 'clsx'

interface Props {
  collection: Collection
  rank: number
  sales7d: number
  volume7d: number
  className?: string
}

export function NotableCollectionCard({
  collection,
  rank,
  sales7d,
  volume7d,
  className,
}: Props) {
  return (
    <Link
      to={`/collection/${collection.slug}`}
      onMouseEnter={() => prefetchCollectionCatalog(collection)}
      onFocus={() => prefetchCollectionCatalog(collection)}
      className={clsx(
        'group relative flex flex-col shrink-0 w-[min(78vw,200px)] sm:w-[210px] lg:w-[220px]',
        'rounded-2xl border border-edge bg-surface overflow-hidden',
        'transition-all duration-300',
        'hover:border-hood/45 hover:shadow-[0_12px_36px_rgba(0,200,5,0.1)] hover:-translate-y-0.5',
        className
      )}
    >
      <div className="relative h-[88px] sm:h-[96px] overflow-hidden bg-surface-2">
        <img
          src={collection.banner || collection.image}
          alt=""
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
        <div
          className={clsx(
            'absolute top-2 left-2 min-w-[1.5rem] h-6 px-1.5 rounded-md flex items-center justify-center',
            'text-[11px] font-extrabold tabular-nums border',
            rank <= 3
              ? 'bg-hood text-[#0b0e11] border-hood/30 shadow-md shadow-hood/20'
              : 'bg-black/55 text-white border-white/10 backdrop-blur-sm'
          )}
        >
          #{rank}
        </div>
        {rank === 1 && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-[9px] font-bold text-hood uppercase tracking-wide">
            <Flame className="w-2.5 h-2.5" />
            Top
          </div>
        )}
      </div>

      <div className="relative px-3 -mt-6">
        <img
          src={collection.image}
          alt=""
          className="w-11 h-11 rounded-xl border-[2.5px] border-surface shadow-md object-cover ring-1 ring-edge"
        />
      </div>

      <div className="px-3 pt-1.5 pb-3 flex flex-col min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <h3 className="font-bold text-sm text-ink truncate group-hover:text-hood transition-colors">
            {collection.name}
          </h3>
          {collection.verified && (
            <BadgeCheck className="w-3.5 h-3.5 text-hood shrink-0" />
          )}
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <div className="rounded-lg bg-surface-2 px-2 py-1.5 min-w-0">
            <div className="text-[9px] uppercase tracking-wide text-ink-3 font-semibold">
              7d sales
            </div>
            <div className="text-sm font-extrabold text-hood tabular-nums truncate">
              {sales7d > 0 ? sales7d.toLocaleString() : '—'}
            </div>
          </div>
          <div className="rounded-lg bg-surface-2 px-2 py-1.5 min-w-0">
            <div className="text-[9px] uppercase tracking-wide text-ink-3 font-semibold">
              7d vol
            </div>
            <div className="text-sm font-extrabold text-ink tabular-nums truncate">
              {formatPrice(volume7d)}
              <span className="text-[9px] text-ink-3 ml-0.5 font-bold">ETH</span>
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-3">
          <span>
            Floor{' '}
            <span className="font-semibold text-ink tabular-nums">
              {formatPrice(collection.floorPrice)}
            </span>
          </span>
          <span className="tabular-nums">{collection.owners.toLocaleString()} owners</span>
        </div>
      </div>
    </Link>
  )
}
