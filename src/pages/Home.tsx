import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Activity as ActivityIcon,
  Flame,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { FeaturedHero } from '../components/nft/FeaturedHero'
import { FeaturedCollectionCard } from '../components/nft/FeaturedCollectionCard'
import { TrendingTable } from '../components/nft/TrendingTable'
import { NftCard } from '../components/nft/NftCard'
import { formatPrice, timeAgo } from '../data/mockData'
import { ONCHAIN_COLLECTION_SLUG, isMarketplaceDeployed } from '../lib/marketplace'
import clsx from 'clsx'

export function Home() {
  const { collections, nfts, activities } = useMarketplace()
  const [params] = useSearchParams()
  const q = (params.get('q') || '').toLowerCase()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [listingHover, setListingHover] = useState<string | null>(null)

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

  const listed = useMemo(() => {
    return nfts
      .filter((n) => n.listed && n.price != null)
      .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
      .slice(0, 12)
  }, [nfts])

  const recent = activities.slice(0, 12)
  const totalVol = collections.reduce((s, c) => s + c.volume24h, 0)

  const scrollBy = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })
  }

  return (
    <div className="animate-fade-in w-full overflow-x-hidden">
      {/* Edge-to-edge content — tight side gutters like major marketplaces */}
      <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 pt-3 sm:pt-4 pb-2">
        {isMarketplaceDeployed() && (
          <div className="mb-3 rounded-xl border border-hood/30 bg-gradient-to-r from-hood-muted via-surface-2 to-surface-2 px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="w-4 h-4 text-hood shrink-0" />
              <p className="text-xs sm:text-sm text-ink-2 truncate">
                <span className="font-bold text-ink">Testnet live</span>
                <span className="text-ink-3"> · mint, list & auction with 2.5% fee</span>
              </p>
            </div>
            <Link
              to={`/collection/${ONCHAIN_COLLECTION_SLUG}`}
              className="inline-flex items-center justify-center h-9 px-3.5 rounded-lg bg-hood text-[#0b0e11] text-xs sm:text-sm font-bold shrink-0"
            >
              Open testnet →
            </Link>
          </div>
        )}
        <FeaturedHero collections={featured} />
      </div>

      <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-5 sm:py-6 space-y-8 sm:space-y-10">
        {/* Market pulse — denser strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2">
          {[
            { label: '24h volume', value: `${formatPrice(totalVol)} ETH`, accent: true },
            { label: 'Collections', value: String(collections.length) },
            { label: 'Listed', value: String(nfts.filter((n) => n.listed).length) },
            { label: 'Network', value: 'Robinhood' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-edge bg-surface-2/70 px-3 py-2.5 relative overflow-hidden"
            >
              {s.accent && (
                <div className="absolute inset-0 bg-gradient-to-br from-hood/12 to-transparent pointer-events-none" />
              )}
              <div className="text-[10px] uppercase tracking-wide text-ink-3 font-semibold relative">
                {s.label}
              </div>
              <div
                className={clsx(
                  'text-base sm:text-lg font-extrabold mt-0.5 tabular-nums relative',
                  s.accent ? 'text-hood' : 'text-ink'
                )}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Discover collections carousel */}
        <section>
          <div className="flex items-end justify-between mb-3 gap-3">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">
                {q ? `Results for “${q}”` : 'Discover'}
              </h2>
              <p className="text-xs sm:text-sm text-ink-3 mt-0.5">
                Top collections by 24h volume on Robinhood Chain
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="hidden sm:flex gap-1">
                <button
                  type="button"
                  onClick={() => scrollBy(-1)}
                  className="w-8 h-8 rounded-full border border-edge bg-surface hover:border-hood hover:text-hood flex items-center justify-center cursor-pointer"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollBy(1)}
                  className="w-8 h-8 rounded-full border border-edge bg-surface hover:border-hood hover:text-hood flex items-center justify-center cursor-pointer"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <Link
                to="/collections"
                className="text-xs sm:text-sm font-bold text-hood hover:underline inline-flex items-center gap-1"
              >
                View all
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {featured.length === 0 ? (
            <p className="text-ink-3 text-sm py-8 text-center">No collections match your search.</p>
          ) : (
            <div
              ref={scrollerRef}
              className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth hide-scrollbar -mx-2 px-2 sm:-mx-3 sm:px-3 lg:-mx-4 lg:px-4"
            >
              {featured.map((c, i) => (
                <div key={c.id} className="snap-start">
                  <FeaturedCollectionCard collection={c} rank={i + 1} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Trending + Degen */}
        <section className="grid lg:grid-cols-[1fr_min(340px,32%)] gap-4 sm:gap-5">
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-2.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Flame className="w-4 h-4 text-hood shrink-0" />
                <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">
                  Trending
                </h2>
              </div>
              <Link
                to="/collections"
                className="text-xs sm:text-sm font-bold text-hood hover:underline inline-flex items-center gap-1 shrink-0"
              >
                All collections
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <TrendingTable collections={collections} limit={12} />
          </div>

          <aside className="rounded-2xl border border-edge overflow-hidden relative min-h-[200px] lg:min-h-full flex flex-col justify-end p-5 bg-surface-2">
            <div className="absolute inset-0">
              {featured[0] && (
                <img
                  src={featured[0].banner}
                  alt=""
                  className="w-full h-full object-cover opacity-35"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)]/90 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-br from-hood/20 via-transparent to-[rgba(255,80,0,0.08)]" />
            </div>
            <div className="relative">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-hood/15 text-hood text-[10px] font-bold uppercase tracking-wider mb-2">
                <Zap className="w-3 h-3" />
                Degen Mode
              </div>
              <h3 className="text-lg font-extrabold text-ink">Mint & bulk buy</h3>
              <p className="text-sm text-ink-2 mt-1 mb-4 leading-relaxed">
                Live mints, multi-mint, and floor sweeps — built for speed.
              </p>
              <Link
                to="/degen"
                className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-hood text-[#0b0e11] text-sm font-bold hover:opacity-90 w-full sm:w-auto"
              >
                Enter Degen Mode
              </Link>
            </div>
          </aside>
        </section>

        {/* Notable listings — cooler mosaic */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-hood/15 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-hood" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">
                  Notable listings
                </h2>
                <p className="text-[11px] sm:text-xs text-ink-3">
                  High-signal asks across the market
                </p>
              </div>
            </div>
            <Link
              to="/degen/bulk"
              className="text-xs sm:text-sm font-bold text-hood hover:underline shrink-0"
            >
              Sweep floors →
            </Link>
          </div>

          {listed.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-edge py-12 text-center text-sm text-ink-3">
              No listings right now — check back after the next refresh.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-2.5">
              {listed.map((n, i) => {
                const col = collections.find((c) => c.id === n.collectionId)
                const featuredSlot = i === 0
                return (
                  <div
                    key={n.id}
                    className={clsx(
                      'relative group',
                      featuredSlot && 'col-span-2 row-span-1 sm:row-span-2'
                    )}
                    onMouseEnter={() => setListingHover(n.id)}
                    onMouseLeave={() => setListingHover(null)}
                  >
                    <div
                      className={clsx(
                        'h-full rounded-2xl transition-shadow duration-300',
                        listingHover === n.id && 'shadow-[0_0_0_1px_var(--color-hood),0_12px_40px_rgba(0,200,5,0.12)]'
                      )}
                    >
                      <NftCard nft={n} showCollection compact={!featuredSlot} />
                    </div>
                    {featuredSlot && col && (
                      <div className="pointer-events-none absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-hood text-[#0b0e11] text-[10px] font-bold uppercase tracking-wide shadow">
                        Spotlight
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Live activity — timeline style */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-2 border border-edge flex items-center justify-center shrink-0">
                <ActivityIcon className="w-4 h-4 text-hood" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight flex items-center gap-2">
                  Live activity
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-hood-muted text-hood text-[10px] font-bold uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-hood animate-pulse" />
                    Feed
                  </span>
                </h2>
                <p className="text-[11px] sm:text-xs text-ink-3">
                  Sales, listings & mints as they land
                </p>
              </div>
            </div>
            <Link
              to="/activity"
              className="text-xs sm:text-sm font-bold text-hood hover:underline shrink-0"
            >
              Full feed →
            </Link>
          </div>

          <div className="rounded-2xl border border-edge bg-surface overflow-hidden">
            {/* Desktop header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-ink-3 border-b border-edge bg-surface-2/50">
              <div className="col-span-2">Event</div>
              <div className="col-span-4">Item</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-2">From</div>
              <div className="col-span-2 text-right">When</div>
            </div>

            {recent.length === 0 ? (
              <p className="py-12 text-center text-sm text-ink-3">No recent activity yet.</p>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {recent.map((a) => {
                  const col = collections.find((c) => c.id === a.collectionId)
                  const nft = a.nftId ? nfts.find((n) => n.id === a.nftId) : undefined
                  const typeColor =
                    a.type === 'sale'
                      ? 'text-hood bg-hood-muted'
                      : a.type === 'listing'
                        ? 'text-ink bg-surface-3'
                        : a.type === 'mint'
                          ? 'text-hood bg-hood-muted'
                          : a.type === 'bid' || a.type === 'offer'
                            ? 'text-[var(--color-bid)] bg-[rgba(81,133,255,0.12)]'
                            : 'text-ink-2 bg-surface-2'

                  return (
                    <div
                      key={a.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-3 hover:bg-surface-2/60 transition-colors items-center"
                    >
                      <div className="sm:col-span-2 flex items-center gap-2">
                        <span
                          className={clsx(
                            'px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide',
                            typeColor
                          )}
                        >
                          {a.type.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="sm:col-span-4 flex items-center gap-2.5 min-w-0">
                        {(nft?.image || col?.image) && (
                          <img
                            src={nft?.image || col?.image}
                            alt=""
                            className="w-9 h-9 rounded-lg object-cover shrink-0 ring-1 ring-edge"
                          />
                        )}
                        <div className="min-w-0">
                          {nft && a.nftId ? (
                            <Link
                              to={`/nft/${a.nftId}`}
                              className="text-sm font-semibold text-ink hover:text-hood truncate block"
                            >
                              {nft.name}
                            </Link>
                          ) : col ? (
                            <Link
                              to={`/collection/${col.slug}`}
                              className="text-sm font-semibold text-ink hover:text-hood truncate block"
                            >
                              {col.name}
                            </Link>
                          ) : (
                            <span className="text-sm text-ink-3">—</span>
                          )}
                          {col && nft && (
                            <div className="text-[11px] text-ink-3 truncate">{col.name}</div>
                          )}
                        </div>
                      </div>
                      <div className="sm:col-span-2 sm:text-right">
                        {a.price != null ? (
                          <span className="text-sm font-bold tabular-nums text-ink">
                            {a.price === 0 && a.type === 'mint' ? (
                              <span className="text-hood text-xs">Free</span>
                            ) : (
                              <>
                                {formatPrice(a.price)}{' '}
                                <span className="text-hood text-[10px]">ETH</span>
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-ink-3 text-sm">—</span>
                        )}
                      </div>
                      <div className="sm:col-span-2 text-[11px] font-mono text-ink-3 truncate hidden sm:block">
                        {a.from}
                      </div>
                      <div className="sm:col-span-2 sm:text-right text-[11px] text-ink-3 tabular-nums">
                        {timeAgo(a.timestamp)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
