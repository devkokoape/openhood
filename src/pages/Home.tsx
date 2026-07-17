import { useMemo, useRef, type RefObject } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { FeaturedHero } from '../components/nft/FeaturedHero'
import { DiscoverSection } from '../components/nft/DiscoverSection'
import { MarketPulse } from '../components/nft/MarketPulse'
import {
  TrendingTable,
  collectionSales,
  collectionVolume,
} from '../components/nft/TrendingTable'
import { NotableCollectionCard } from '../components/nft/NotableCollectionCard'
import { HomeActivityFeed } from '../components/nft/HomeActivityFeed'
import {
  AnimatedActivity,
  AnimatedFlame,
  AnimatedIconBadge,
  AnimatedTrophy,
  AnimatedZap,
} from '../components/ui/AnimatedIcons'

export function Home() {
  const { collections, nfts, activities, chainAuctions } = useMarketplace()
  const [params] = useSearchParams()
  const q = (params.get('q') || '').toLowerCase()
  const notableRef = useRef<HTMLDivElement>(null)

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

  /** Top collections by 7-day sales (fallback: 7d volume) — single row */
  const notableCollections = useMemo(() => {
    return [...collections]
      .map((c) => ({
        c,
        sales7d: collectionSales(c, '7d'),
        volume7d: collectionVolume(c, '7d'),
      }))
      .sort((a, b) => {
        if (b.sales7d !== a.sales7d) return b.sales7d - a.sales7d
        return b.volume7d - a.volume7d
      })
      .slice(0, 10)
  }, [collections])

  const marketStats = useMemo(() => {
    const vol24h = collections.reduce((s, c) => s + (c.volume24h || 0), 0)
    const vol7d = collections.reduce(
      (s, c) => s + (c.intervals?.volume7d ?? c.volume24h * 4.5),
      0
    )
    const listed =
      collections.reduce((s, c) => {
        if (c.listedPct && c.items)
          return s + Math.round((c.listedPct / 100) * c.items)
        return s
      }, 0) || nfts.filter((n) => n.listed).length

    const nftAuctions = nfts.filter((n) => n.inAuction).length
    const onChainActive = (chainAuctions || []).filter(
      (a) => a && a.active && !a.settled
    ).length
    const auctions = Math.max(nftAuctions, onChainActive)

    return {
      vol24h,
      vol7d,
      collections: collections.length,
      listed,
      auctions,
    }
  }, [collections, nfts, chainAuctions])

  const scrollBy = (dir: -1 | 1, ref: RefObject<HTMLDivElement | null>) => {
    const el = ref.current
    if (!el) return
    const card = el.querySelector<HTMLElement>(':scope > *')
    const step = card ? card.offsetWidth + 14 : 300
    el.scrollBy({ left: dir * step * 2, behavior: 'smooth' })
  }

  return (
    <div className="animate-fade-in w-full overflow-x-hidden">
      {/* Edge-to-edge content — tight side gutters like major marketplaces */}
      <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 pt-3 sm:pt-4 pb-2">
        <FeaturedHero collections={featured} />
      </div>

      <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-5 sm:py-6 space-y-8 sm:space-y-10">
        <MarketPulse stats={marketStats} />

        <DiscoverSection collections={collections} searchQuery={q} />

        {/* Trending + Degen */}
        <section className="grid lg:grid-cols-[1fr_min(320px,30%)] gap-4 sm:gap-5">
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-2.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AnimatedIconBadge tone="hood" className="w-8 h-8">
                  <AnimatedFlame className="text-hood" size="md" />
                </AnimatedIconBadge>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">
                    Trending
                  </h2>
                  <p className="text-[11px] text-ink-3 hidden sm:block">
                    Ranked by volume · switch time range
                  </p>
                </div>
              </div>
              <Link
                to="/collections"
                className="text-xs sm:text-sm font-bold text-hood hover:underline inline-flex items-center gap-1 shrink-0"
              >
                All
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <TrendingTable collections={collections} limit={10} />
          </div>

          <aside className="rounded-2xl border border-edge overflow-hidden relative min-h-[220px] lg:min-h-full flex flex-col justify-end p-5 bg-surface-2">
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
                <AnimatedZap size="sm" className="text-hood" />
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

        {/* Notable collections — top 7d sales, single row */}
        <section>
          <div className="flex items-end justify-between mb-3 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <AnimatedIconBadge tone="solid-hood" className="w-8 h-8">
                <AnimatedTrophy size="md" />
              </AnimatedIconBadge>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">
                  Notable collections
                </h2>
                <p className="text-xs sm:text-sm text-ink-3 mt-0.5">
                  Highest sales in the last 7 days
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="hidden sm:flex gap-1">
                <button
                  type="button"
                  onClick={() => scrollBy(-1, notableRef)}
                  className="w-8 h-8 rounded-full border border-edge bg-surface hover:border-hood hover:text-hood flex items-center justify-center cursor-pointer"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollBy(1, notableRef)}
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

          {notableCollections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-edge py-10 text-center text-sm text-ink-3">
              No collection stats yet.
            </div>
          ) : (
            <div
              ref={notableRef}
              className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth hide-scrollbar -mx-2 px-2 sm:-mx-3 sm:px-3 lg:-mx-4 lg:px-4"
            >
              {notableCollections.map(({ c, sales7d, volume7d }, i) => (
                <div key={c.id} className="snap-start">
                  <NotableCollectionCard
                    collection={c}
                    rank={i + 1}
                    sales7d={sales7d}
                    volume7d={volume7d}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Live activity — Blur/OpenSea dense feed */}
        <section>
          <div className="flex items-end justify-between mb-3 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <AnimatedIconBadge tone="default" className="w-8 h-8">
                <AnimatedActivity className="text-hood" size="md" />
              </AnimatedIconBadge>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">
                  Activity
                </h2>
                <p className="text-xs sm:text-sm text-ink-3 mt-0.5">
                  Real-time sales, lists & mints
                </p>
              </div>
            </div>
            <Link
              to="/activity"
              className="text-xs sm:text-sm font-bold text-hood hover:underline shrink-0 inline-flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <HomeActivityFeed
            activities={activities}
            collections={collections}
            nfts={nfts}
            limit={16}
          />
        </section>
      </div>
    </div>
  )
}
