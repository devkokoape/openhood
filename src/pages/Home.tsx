import { useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { FeaturedHero } from '../components/nft/FeaturedHero'
import { FeaturedCollectionCard } from '../components/nft/FeaturedCollectionCard'
import { TrendingTable } from '../components/nft/TrendingTable'
import { NftCard } from '../components/nft/NftCard'
import { ActivityRow } from '../components/nft/ActivityRow'
import { formatPrice } from '../data/mockData'

export function Home() {
  const { collections, nfts, activities } = useMarketplace()
  const [params] = useSearchParams()
  const q = (params.get('q') || '').toLowerCase()
  const scrollerRef = useRef<HTMLDivElement>(null)

  const featured = useMemo(() => {
    let list = [...collections].sort((a, b) => b.volume24h - a.volume24h)
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.slug.includes(q) ||
          c.description.toLowerCase().includes(q)
      )
    }
    return list
  }, [collections, q])

  const listed = nfts.filter((n) => n.listed).slice(0, 12)
  const recent = activities.slice(0, 8)
  const totalVol = collections.reduce((s, c) => s + c.volume24h, 0)

  const scrollBy = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' })
  }

  return (
    <div className="animate-fade-in">
      {/* Full-bleed-ish hero area */}
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 pt-4 pb-2">
        <FeaturedHero collections={featured} />
      </div>

      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 py-6 space-y-10">
        {/* Market pulse strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: '24h volume', value: `${formatPrice(totalVol)} ETH`, accent: true },
            { label: 'Collections', value: String(collections.length) },
            { label: 'Listed items', value: String(nfts.filter((n) => n.listed).length) },
            { label: 'Network', value: 'Robinhood Chain' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-edge bg-surface-2/60 px-3.5 py-3 relative overflow-hidden"
            >
              {s.accent && (
                <div className="absolute inset-0 bg-gradient-to-br from-hood/10 to-transparent pointer-events-none" />
              )}
              <div className="text-[11px] uppercase tracking-wide text-ink-3 font-medium relative">
                {s.label}
              </div>
              <div
                className={`text-base sm:text-lg font-bold mt-0.5 tabular-nums relative ${
                  s.accent ? 'text-hood' : 'text-ink'
                }`}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Horizontal featured carousel — OpenSea style */}
        <section>
          <div className="flex items-center justify-between mb-4 gap-3">
            <div>
              <h2 className="text-xl font-bold text-ink tracking-tight">
                {q ? `Results for “${q}”` : 'Discover collections'}
              </h2>
              <p className="text-sm text-ink-3 mt-0.5">Explore top movers by 24h volume</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex gap-1">
                <button
                  type="button"
                  onClick={() => scrollBy(-1)}
                  className="w-9 h-9 rounded-full border border-edge bg-surface hover:border-hood hover:text-hood flex items-center justify-center cursor-pointer transition-colors"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollBy(1)}
                  className="w-9 h-9 rounded-full border border-edge bg-surface hover:border-hood hover:text-hood flex items-center justify-center cursor-pointer transition-colors"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <Link
                to="/collections"
                className="text-sm font-semibold text-hood hover:underline inline-flex items-center gap-1"
              >
                View all
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {featured.length === 0 ? (
            <p className="text-ink-3 text-sm py-8 text-center">No collections match your search.</p>
          ) : (
            <div className="relative">
              <div
                ref={scrollerRef}
                className="flex gap-3.5 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth hide-scrollbar"
              >
                {featured.map((c, i) => (
                  <div key={c.id} className="snap-start">
                    <FeaturedCollectionCard collection={c} rank={i + 1} />
                  </div>
                ))}
              </div>
              {/* Fade edges */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-surface to-transparent hidden sm:block" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent hidden sm:block" />
            </div>
          )}
        </section>

        {/* Trending rankings + CTA */}
        <section className="grid lg:grid-cols-[1fr_320px] gap-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-ink tracking-tight">Trending</h2>
              <Link
                to="/collections"
                className="text-sm font-semibold text-hood hover:underline inline-flex items-center gap-1"
              >
                Rankings
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <TrendingTable collections={collections} />
          </div>

          <aside className="rounded-2xl border border-edge overflow-hidden relative min-h-[220px] flex flex-col justify-end p-5 bg-surface-2">
            <div className="absolute inset-0">
              {featured[0] && (
                <img
                  src={featured[0].banner}
                  alt=""
                  className="w-full h-full object-cover opacity-40"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)]/85 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-br from-hood/15 via-transparent to-transparent" />
            </div>
            <div className="relative">
              <div className="text-xs font-semibold uppercase tracking-wider text-hood mb-1">
                Degen Mode
              </div>
              <h3 className="text-lg font-bold text-ink">Mint & bulk buy</h3>
              <p className="text-sm text-ink-2 mt-1 mb-4">
                Live mint pages, multi-mint, and floor sweeps in one place.
              </p>
              <Link
                to="/degen"
                className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-hood text-[#0b0e11] text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Enter Degen Mode
              </Link>
            </div>
          </aside>
        </section>

        {/* Listings */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-hood" />
              <h2 className="text-xl font-bold text-ink tracking-tight">Notable listings</h2>
            </div>
            <Link to="/degen/bulk" className="text-sm font-semibold text-hood hover:underline">
              Degen bulk →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
            {listed.map((n) => (
              <NftCard key={n.id} nft={n} />
            ))}
          </div>
        </section>

        {/* Activity */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-ink tracking-tight">Live activity</h2>
            <Link to="/activity" className="text-sm font-semibold text-hood hover:underline">
              View all →
            </Link>
          </div>
          <div className="rounded-2xl border border-edge bg-surface overflow-hidden">
            {recent.map((a) => (
              <ActivityRow key={a.id} activity={a} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
