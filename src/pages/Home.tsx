import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { FeaturedHero } from '../components/nft/FeaturedHero'
import { DiscoverSection } from '../components/nft/DiscoverSection'
import {
  TrendingTable,
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
  const { collections, nfts, activities, offers } = useMarketplace()
  const [params] = useSearchParams()
  const q = (params.get('q') || '').toLowerCase()

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

  /** Notable = 150+ ETH total volume on Robinhood, ranked by lifetime vol */
  const NOTABLE_MIN_VOLUME_ETH = 150
  const notableCollections = useMemo(() => {
    return [...collections]
      .map((c) => ({
        c,
        volumeTotal: c.volumeTotal || collectionVolume(c, 'all'),
        volume7d: collectionVolume(c, '7d'),
      }))
      .filter((x) => x.volumeTotal >= NOTABLE_MIN_VOLUME_ETH)
      .sort((a, b) => b.volumeTotal - a.volumeTotal)
      .slice(0, 4)
  }, [collections])

  return (
    <div className="animate-fade-in w-full overflow-x-hidden">
      {/* Edge-to-edge content — tight side gutters like major marketplaces */}
      <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 pt-3 sm:pt-4 pb-2">
        <FeaturedHero collections={featured} />
      </div>

      <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-5 sm:py-6 space-y-8 sm:space-y-10">
        <DiscoverSection collections={collections} searchQuery={q} />

        {/* Trending + Degen — fixed shell height so list/cards never reflows */}
        <section className="grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] gap-4 sm:gap-5 items-start">
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-3 gap-3 h-9">
              <div className="flex items-center gap-2 min-w-0">
                <AnimatedIconBadge tone="hood" className="w-8 h-8">
                  <AnimatedFlame className="text-hood" size="md" />
                </AnimatedIconBadge>
                <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">
                  Trending
                </h2>
              </div>
              <Link
                to="/collections"
                className="text-xs sm:text-sm font-bold text-hood hover:underline inline-flex items-center gap-1 shrink-0"
              >
                See all
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <TrendingTable
              collections={collections}
              offers={offers}
              nfts={nfts}
              activities={activities}
              defaultLimit={10}
            />
          </div>

          {/* Degen bulk mint / buy promo — fixed height, animated */}
          <aside className="trending-degen-aside degen-promo rounded-2xl border border-hood/25 overflow-hidden relative bg-surface-2 flex flex-col justify-end p-5">
            <div className="absolute inset-0 pointer-events-none">
              {featured[0] && (
                <img
                  src={featured[0].banner}
                  alt=""
                  className="w-full h-full object-cover opacity-30"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)]/88 to-[var(--color-surface)]/40" />
              <div className="absolute inset-0 degen-promo-mesh" />
              <div className="absolute inset-0 degen-promo-grid" />
              <div className="degen-promo-orb degen-promo-orb-a" />
              <div className="degen-promo-orb degen-promo-orb-b" />
              <div className="degen-promo-scan" />
            </div>

            <div className="relative z-[1] flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-hood/20 border border-hood/30 text-hood text-[10px] font-bold uppercase tracking-wider">
                  <AnimatedZap size="sm" className="text-hood" />
                  Degen Mode
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-danger)] bg-[rgba(255,80,0,0.12)] border border-[rgba(255,80,0,0.2)] px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger)] animate-pulse" />
                  Live
                </span>
              </div>

              <div>
                <h3 className="text-xl font-black text-ink tracking-tight leading-tight">
                  Bulk mint
                  <span className="text-hood"> & </span>
                  buy
                </h3>
                <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">
                  Sweep floors, multi-mint drops, and move fast on Robinhood Chain.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { t: 'Floor sweeps', s: 'Bulk buy' },
                  { t: 'Live mints', s: '1–20 / tx' },
                  { t: 'Speed first', s: 'Degen UI' },
                  { t: 'Testnet ready', s: '2.5% fee' },
                ].map((chip) => (
                  <div
                    key={chip.t}
                    className="rounded-xl border border-edge/80 bg-surface/55 backdrop-blur-sm px-2.5 py-2"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                      {chip.t}
                    </div>
                    <div className="text-xs font-bold text-ink mt-0.5">{chip.s}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 pt-0.5">
                <Link
                  to="/degen/bulk"
                  className="inline-flex items-center justify-center h-11 px-4 rounded-xl bg-hood text-[#0b0e11] text-sm font-extrabold shadow-lg shadow-hood/25 hover:opacity-95 w-full"
                >
                  Open bulk buy
                </Link>
                <Link
                  to="/degen/mints"
                  className="inline-flex items-center justify-center h-10 px-4 rounded-xl border border-hood/35 bg-hood-muted/40 text-hood text-sm font-bold hover:bg-hood-muted w-full"
                >
                  Browse mints
                </Link>
              </div>
            </div>
          </aside>
        </section>

        {/* Notable — continuous brand stage: copy + creative bridge + cards */}
        <section className="notable-panel relative rounded-2xl overflow-hidden border border-edge">
          <div className="notable-panel-wash" aria-hidden />
          <div className="notable-panel-inner relative z-[1] flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-2 p-4 sm:p-5">
            {/* Copy shifted right toward the cards */}
            <div className="notable-panel-copy relative z-[2] shrink-0 w-full lg:w-[200px] xl:w-[220px] lg:ml-6 xl:ml-10 lg:mr-1 p-1">
              <div className="w-10 h-10 rounded-xl bg-hood flex items-center justify-center shadow-md shadow-hood/25 mb-3">
                <AnimatedTrophy size="md" className="text-[#0b0e11]" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-hood mb-1">
                150+ ETH club
              </p>
              <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight leading-snug">
                Notable collections
              </h2>
              <p className="mt-1.5 text-[12px] text-ink-2 leading-relaxed">
                Proven liquidity on Robinhood Chain — lifetime volume over 150 ETH.
              </p>
              <Link
                to="/collections"
                className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-hood hover:underline"
              >
                Explore marketplace
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Bridge */}
            <div className="notable-bridge hidden lg:flex flex-col items-center justify-center shrink-0 self-stretch w-16 xl:w-[4.5rem]">
              <div className="notable-bridge-rail" aria-hidden />
              <div className="notable-bridge-core relative z-[1]">
                <div className="notable-bridge-avatars">
                  {notableCollections.map(({ c }, i) => (
                    <img
                      key={c.id}
                      src={c.image}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="notable-bridge-avatar"
                      style={{ zIndex: 4 - i, marginLeft: i === 0 ? 0 : -10 }}
                    />
                  ))}
                  {notableCollections.length === 0 && (
                    <div className="w-9 h-9 rounded-full bg-hood/20 border border-hood/30" />
                  )}
                </div>
                <div className="notable-bridge-pill">
                  <span className="notable-bridge-pill-dot" />
                  150+
                </div>
                <p className="notable-bridge-caption tabular-nums">
                  {notableCollections.length > 0
                    ? `${notableCollections.length} elite`
                    : 'waiting'}
                </p>
              </div>
            </div>

            {/* Exactly 4 cards, equal slots, fill the stage */}
            <div className="notable-panel-stage relative z-[2] min-w-0 flex-1 flex items-center">
              {notableCollections.length === 0 ? (
                <div className="w-full min-h-[140px] flex items-center justify-center text-[13px] text-ink-3 text-center px-3">
                  No collections with 150+ ETH volume yet.
                </div>
              ) : (
                <div className="notable-panel-cards notable-panel-cards-four w-full">
                  {notableCollections.map(({ c, volumeTotal, volume7d }, i) => (
                    <div key={c.id} className="notable-panel-card-slot min-w-0">
                      <NotableCollectionCard
                        collection={c}
                        rank={i + 1}
                        volumeTotal={volumeTotal}
                        volume7d={volume7d}
                        compact
                        className="w-full max-w-none"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
