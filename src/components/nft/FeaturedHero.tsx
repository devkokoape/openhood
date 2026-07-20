import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react'
import { AnimatedSparkles } from '../ui/AnimatedIcons'
import type { Collection } from '../../types'
import { formatPrice } from '../../data/mockData'
import { Button } from '../ui/Button'
import { CollectionBanner } from '../ui/CollectionBanner'
import { collectionMediaUrl } from '../../lib/mediaUrl'
import clsx from 'clsx'

export function FeaturedHero({ collections }: { collections: Collection[] }) {
  // Hero = real OpenSea only (never OpenHood testnet dicebear green)
  const openSea = collections.filter(
    (c) =>
      c.source === 'opensea' &&
      c.image &&
      !c.image.includes('dicebear') &&
      !c.image.includes('seed=openhood')
  )
  const slides = openSea.length > 0 ? openSea.slice(0, 5) : []
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (slides.length <= 1 || paused) return
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5000)
    return () => clearInterval(t)
  }, [slides.length, paused])

  if (slides.length === 0) {
    return (
      <section className="relative w-full rounded-2xl border border-edge bg-surface-2 h-[200px] flex items-center justify-center">
        <p className="text-sm text-ink-3">No collections to feature yet.</p>
      </section>
    )
  }

  // Guard against stale index when list shrinks (e.g. search filter)
  const safeIndex = index % slides.length
  const active = slides[safeIndex]

  const prev = () => setIndex((i) => (i - 1 + slides.length) % slides.length)
  const next = () => setIndex((i) => (i + 1) % slides.length)

  return (
    <section
      className="relative w-full rounded-2xl md:rounded-3xl overflow-hidden border border-edge group/hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slides */}
      <div className="relative h-[min(72vw,320px)] min-h-[260px] sm:h-[340px] md:h-[400px] lg:h-[440px]">
        {slides.map((c, i) => (
          <div
            key={c.id}
            className={clsx(
              'absolute inset-0 transition-all duration-700 ease-out',
              i === safeIndex ? 'opacity-100 scale-100 z-10' : 'opacity-0 scale-105 z-0 pointer-events-none'
            )}
          >
            <CollectionBanner
              src={c.banner}
              fallbackSrc={collectionMediaUrl(c.slug, c.image) || c.image}
              alt=""
            />
            {/* OpenSea-style multi-stop gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent pointer-events-none" />
            {/* Subtle green tint for Robinhood brand */}
            <div className="absolute inset-0 bg-gradient-to-tr from-[rgba(0,200,5,0.12)] via-transparent to-transparent pointer-events-none" />
          </div>
        ))}

        {/* Content */}
        <div className="absolute inset-0 z-20 flex flex-col justify-end p-3.5 sm:p-8 md:p-10 pb-8 sm:pb-10">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 max-w-2xl w-full">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider mb-2 sm:mb-3">
                <AnimatedSparkles className="text-hood" size="sm" />
                Discover
              </div>

              <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                <img
                  src={collectionMediaUrl(active.slug, active.image) || active.image}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 sm:w-16 sm:h-16 md:w-[72px] md:h-[72px] rounded-xl sm:rounded-2xl border-2 border-white/30 shadow-2xl object-cover ring-2 ring-hood/40 shrink-0 bg-surface-2"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/collection/${active.slug}`}
                    className="flex items-center gap-1.5 sm:gap-2 group/title min-w-0"
                  >
                    <h2 className="text-xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight truncate drop-shadow-lg group-hover/title:text-hood transition-colors">
                      {active.name}
                    </h2>
                    {active.verified && (
                      <BadgeCheck className="w-5 h-5 sm:w-7 sm:h-7 text-hood shrink-0 drop-shadow" />
                    )}
                  </Link>
                  <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-white/70 line-clamp-1 sm:line-clamp-2 max-w-lg">
                    {active.description}
                  </p>
                </div>
              </div>

              {/* Stats chips — horizontal scroll on tiny screens */}
              <div className="mt-3 sm:mt-4 flex gap-1.5 sm:gap-3 overflow-x-auto hide-scrollbar scroll-x pb-0.5 -mx-0.5 px-0.5">
                <StatChip label="Floor" value={`${formatPrice(active.floorPrice)} ETH`} highlight />
                <StatChip label="24h vol" value={`${formatPrice(active.volume24h)} ETH`} />
                <StatChip label="Items" value={active.items.toLocaleString()} />
                <StatChip label="Owners" value={active.owners.toLocaleString()} />
              </div>

              <div className="mt-3 sm:mt-5 flex flex-wrap gap-2">
                <Link to={`/collection/${active.slug}`} className="min-w-0 flex-1 sm:flex-none">
                  <Button size="md" className="shadow-lg shadow-hood/25 w-full sm:w-auto sm:h-12 sm:px-6 sm:text-base sm:rounded-xl">
                    View collection
                  </Button>
                </Link>
                <Link to={`/degen/bulk?collection=${active.slug}`} className="min-w-0 flex-1 sm:flex-none">
                  <Button
                    size="md"
                    variant="secondary"
                    className="!bg-white/10 !text-white border border-white/20 hover:!bg-white/20 backdrop-blur-md w-full sm:w-auto sm:h-12 sm:px-6"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span className="sm:hidden">Bulk</span>
                    <span className="hidden sm:inline">Degen bulk</span>
                  </Button>
                </Link>
              </div>
            </div>

            {/* Rank badge */}
            <div className="hidden md:flex flex-col items-end gap-2 shrink-0 pb-1">
              <div className="px-3 py-1.5 rounded-full bg-hood text-[#0b0e11] text-xs font-bold shadow-lg shadow-hood/30">
                #{safeIndex + 1} Trending
              </div>
            </div>
          </div>
        </div>

        {/* Nav arrows */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/45 hover:bg-black/60 backdrop-blur border border-white/15 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover/hero:opacity-100 transition-opacity cursor-pointer"
              aria-label="Previous"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/45 hover:bg-black/60 backdrop-blur border border-white/15 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover/hero:opacity-100 transition-opacity cursor-pointer"
              aria-label="Next"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Dots + progress */}
      {slides.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-30 flex justify-center gap-1.5 pb-3 pointer-events-none">
          {slides.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setIndex(i)}
              className={clsx(
                'h-1 rounded-full transition-all pointer-events-auto cursor-pointer',
                i === safeIndex ? 'w-8 bg-hood' : 'w-3 bg-white/35 hover:bg-white/55'
              )}
              aria-label={`Go to ${c.name}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function StatChip({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl bg-white/10 backdrop-blur-md border border-white/15 shrink-0">
      <div className="text-[9px] sm:text-[10px] uppercase tracking-wide text-white/55 font-medium whitespace-nowrap">
        {label}
      </div>
      <div
        className={clsx(
          'text-xs sm:text-sm font-bold tabular-nums whitespace-nowrap',
          highlight ? 'text-hood' : 'text-white'
        )}
      >
        {value}
      </div>
    </div>
  )
}
