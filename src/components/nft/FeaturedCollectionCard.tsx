import { Link } from 'react-router-dom'
import { BadgeCheck, TrendingUp } from 'lucide-react'
import type { Collection } from '../../types'
import { formatPrice } from '../../data/mockData'
import { prefetchCollectionCatalog } from '../../lib/prefetchCatalog'
import clsx from 'clsx'

interface Props {
  collection: Collection
  rank?: number
  className?: string
}

/** OpenSea-style tall featured card with large banner + floating avatar */
export function FeaturedCollectionCard({ collection, rank, className }: Props) {
  const volChange = ((collection.volume24h / Math.max(collection.volumeTotal, 1)) * 100).toFixed(1)

  return (
    <Link
      to={`/collection/${collection.slug}`}
      onMouseEnter={() => prefetchCollectionCatalog(collection)}
      onFocus={() => prefetchCollectionCatalog(collection)}
      className={clsx(
        'group relative flex flex-col shrink-0 w-[min(72vw,240px)] sm:w-[260px] lg:w-[272px] rounded-2xl border border-edge bg-surface overflow-hidden',
        'transition-all duration-300 hover:-translate-y-1 hover:border-hood/50 hover:shadow-[0_12px_40px_rgba(0,200,5,0.12)]',
        className
      )}
    >
      {/* Banner */}
      <div className="relative h-[140px] sm:h-[150px] overflow-hidden bg-surface-2">
        <img
          src={collection.banner}
          alt=""
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent opacity-80" />
        {rank != null && (
          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/55 backdrop-blur-sm text-white text-[11px] font-bold tabular-nums border border-white/10">
            #{rank}
          </div>
        )}
        <div className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-hood/90 text-[#0b0e11] text-[10px] font-bold">
          <TrendingUp className="w-3 h-3" />
          {volChange}%
        </div>
      </div>

      {/* Avatar overlapping banner */}
      <div className="relative px-3.5 -mt-8">
        <div className="relative inline-block">
          <img
            src={collection.image}
            alt={collection.name}
            className="w-[60px] h-[60px] rounded-xl border-[3px] border-surface shadow-lg object-cover ring-1 ring-edge"
          />
          {collection.verified && (
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface flex items-center justify-center">
              <BadgeCheck className="w-4 h-4 text-hood" />
            </span>
          )}
        </div>
      </div>

      <div className="px-3.5 pt-2 pb-3.5 flex-1 flex flex-col">
        <h3 className="font-bold text-ink truncate group-hover:text-hood transition-colors">
          {collection.name}
        </h3>
        <p className="text-[11px] text-ink-3 line-clamp-1 mt-0.5">{collection.description}</p>

        <div className="mt-auto pt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
            <div className="text-[10px] text-ink-3 font-medium uppercase tracking-wide">Floor</div>
            <div className="text-sm font-bold text-ink tabular-nums">
              {formatPrice(collection.floorPrice)}
              <span className="text-hood text-[10px] ml-0.5">ETH</span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
            <div className="text-[10px] text-ink-3 font-medium uppercase tracking-wide">24h vol</div>
            <div className="text-sm font-bold text-ink tabular-nums">
              {formatPrice(collection.volume24h)}
              <span className="text-ink-3 text-[10px] ml-0.5">ETH</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
