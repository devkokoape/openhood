import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck } from 'lucide-react'
import type { Collection } from '../../types'
import { formatPrice } from '../../data/mockData'
import { prefetchCollectionCatalog } from '../../lib/prefetchCatalog'
import { collectionMediaUrl } from '../../lib/mediaUrl'
import clsx from 'clsx'

interface Props {
  collection: Collection
  rank?: number
  className?: string
}

function isVideoUrl(url?: string) {
  return Boolean(url && /\.(mp4|webm|mov)(\?|$)/i.test(url))
}

function isStubUrl(url?: string) {
  if (!url) return true
  return url.includes('dicebear') || url.includes('seed=openhood')
}

/**
 * Marketplace-tier Discover card (OpenSea / Magic Eden style).
 * Tall media, soft chrome, floor + volume as primary stats.
 */
export function FeaturedCollectionCard({ collection, rank, className }: Props) {
  const logo = collectionMediaUrl(collection.slug, collection.image) || collection.image
  const bannerCandidate =
    collection.banner && !isVideoUrl(collection.banner) && !isStubUrl(collection.banner)
      ? collection.banner
      : logo

  const [bannerSrc, setBannerSrc] = useState(bannerCandidate)
  const [logoSrc, setLogoSrc] = useState(logo)

  const listed =
    collection.listedPct != null && collection.listedPct > 0
      ? `${collection.listedPct.toFixed(collection.listedPct < 10 ? 1 : 0)}% listed`
      : null

  return (
    <Link
      to={`/collection/${collection.slug}`}
      onMouseEnter={() => prefetchCollectionCatalog(collection)}
      onFocus={() => prefetchCollectionCatalog(collection)}
      className={clsx(
        'group relative flex flex-col shrink-0',
        'w-[min(78vw,248px)] sm:w-[268px] lg:w-[280px]',
        'rounded-2xl border border-edge bg-surface overflow-hidden',
        'shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out',
        'hover:border-hood/40 hover:shadow-[0_16px_40px_rgba(0,0,0,0.08)]',
        'dark:shadow-[0_1px_2px_rgba(0,0,0,0.3)]',
        'dark:hover:shadow-[0_16px_48px_rgba(0,0,0,0.45)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hood/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        className
      )}
    >
      {/* Banner */}
      <div className="relative h-[148px] sm:h-[156px] overflow-hidden bg-surface-2">
        <img
          src={bannerSrc}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          onError={() => {
            if (logo && bannerSrc !== logo) setBannerSrc(logo)
          }}
        />
        {/* Legibility gradient — product chrome, not decorative neon */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/25 to-black/10 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent pointer-events-none" />

        {rank != null && (
          <div
            className={clsx(
              'absolute top-2.5 left-2.5 min-w-[1.75rem] h-7 px-2 rounded-lg',
              'flex items-center justify-center text-[12px] font-bold tabular-nums tracking-tight',
              'backdrop-blur-md border shadow-sm',
              rank === 1
                ? 'bg-hood text-[var(--color-on-hood,#0b0e11)] border-hood/30 shadow-hood/20'
                : rank <= 3
                  ? 'bg-white/95 text-[#0b0e11] border-white/40 dark:bg-white/90'
                  : 'bg-black/55 text-white border-white/10'
            )}
          >
            {rank}
          </div>
        )}

        {listed && (
          <div className="absolute top-2.5 right-2.5 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-white/90 tabular-nums">
            {listed}
          </div>
        )}
      </div>

      {/* Overlapping avatar */}
      <div className="relative px-3.5 -mt-9 z-[1]">
        <div className="relative inline-block">
          <img
            src={logoSrc}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            className={clsx(
              'w-[64px] h-[64px] rounded-[14px] object-cover bg-surface-2',
              'border-[3px] border-surface',
              'shadow-[0_4px_16px_rgba(0,0,0,0.18)]',
              'ring-1 ring-black/5 dark:ring-white/10',
              'transition-transform duration-300 group-hover:scale-[1.03]'
            )}
            onError={() => {
              const fb = collection.image
              if (fb && logoSrc !== fb) setLogoSrc(fb)
            }}
          />
          {collection.verified && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-surface flex items-center justify-center ring-1 ring-edge"
              title="Verified"
            >
              <BadgeCheck className="w-3.5 h-3.5 text-hood" strokeWidth={2.5} />
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3.5 pt-2.5 pb-3.5 flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <h3 className="font-bold text-[15px] leading-snug text-ink truncate tracking-tight group-hover:text-hood transition-colors duration-200">
            {collection.name}
          </h3>
        </div>
        {collection.category ? (
          <p className="text-[11px] text-ink-3 mt-0.5 truncate capitalize">{collection.category}</p>
        ) : (
          <p className="text-[11px] text-ink-3 mt-0.5 line-clamp-1">
            {collection.description || `${collection.items.toLocaleString()} items`}
          </p>
        )}

        <div className="mt-auto pt-3 grid grid-cols-2 gap-2">
          <StatCell label="Floor" value={formatPrice(collection.floorPrice)} unit="ETH" accent />
          <StatCell label="24h vol" value={formatPrice(collection.volume24h)} unit="ETH" />
        </div>
      </div>
    </Link>
  )
}

function StatCell({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit: string
  accent?: boolean
}) {
  return (
    <div className="rounded-xl bg-surface-2/90 border border-edge/60 px-2.5 py-2 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 leading-none">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-0.5 min-w-0">
        <span
          className={clsx(
            'text-[13px] sm:text-sm font-bold tabular-nums tracking-tight truncate',
            accent ? 'text-ink' : 'text-ink'
          )}
        >
          {value}
        </span>
        <span
          className={clsx(
            'text-[10px] font-semibold shrink-0',
            accent ? 'text-hood' : 'text-ink-3'
          )}
        >
          {unit}
        </span>
      </div>
    </div>
  )
}
