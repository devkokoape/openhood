import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Filter,
  Globe,
  Grid2x2,
  Grid3x3,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Pencil,
  Share2,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { useMarketplace } from '../context/MarketplaceContext'
import { NftCard } from '../components/nft/NftCard'
import { ActivityRow } from '../components/nft/ActivityRow'
import { OfferModal } from '../components/nft/OfferModal'
import { TraitFilterPanel } from '../components/nft/TraitFilterPanel'
import { CollectionAnalytics } from '../components/collection/CollectionAnalytics'
import { CollectionInsights } from '../components/collection/CollectionInsights'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { formatPrice, timeAgo } from '../data/mockData'
import {
  activeFilterCount,
  buildTraitStats,
  filterByTraits,
  rankByRarity,
  type TraitFilterMap,
} from '../lib/traits'
import type { ActivityType } from '../types'
import { ONCHAIN_COLLECTION_ID, parseOnChainTokenId } from '../lib/marketplace'
import { useMarketplaceTx } from '../hooks/useOnChainMarket'
import { useOpenSeaCollectionNfts } from '../hooks/useOpenSeaCollectionNfts'
import { useVisibleNftEnrich } from '../hooks/useVisibleNftEnrich'
import { TxToast } from '../components/wallet/TxToast'
import { RiskBadge } from '../components/nft/RiskBadge'
import { CollectionBanner } from '../components/ui/CollectionBanner'
import {
  resolveOpenSeaCollectionBySlug,
  upgradeOpenSeaImageUrl,
} from '../lib/opensea'
import {
  fetchIndexerCollection,
  hasIndexerUrl,
} from '../lib/indexerApi'
import { withRisk } from '../lib/indexer'
import type { Collection } from '../types'

type SortKey = 'price_asc' | 'price_desc' | 'id' | 'rarity_asc' | 'rarity_desc'
type GridSize = 'sm' | 'md' | 'lg'
type BannerSize = 'sm' | 'md' | 'lg'

const gridClass: Record<GridSize, string> = {
  sm: 'grid-cols-2 min-[400px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-1.5 sm:gap-2',
  md: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3',
  lg: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4',
}

const bannerHeight: Record<BannerSize, string> = {
  sm: 'h-[88px] sm:h-[100px] md:h-[120px]',
  md: 'h-[160px] sm:h-[200px] md:h-[240px]',
  lg: 'h-[220px] sm:h-[280px] md:h-[360px]',
}

const avatarOffset: Record<BannerSize, string> = {
  sm: '-mt-8 sm:-mt-10',
  md: '-mt-12 sm:-mt-14',
  lg: '-mt-14 sm:-mt-16',
}

const activityFilters: { id: string; label: string; types?: ActivityType[] }[] = [
  { id: 'all', label: 'All' },
  { id: 'sale', label: 'Sales', types: ['sale'] },
  { id: 'listing', label: 'Listings', types: ['listing'] },
  { id: 'bid', label: 'Bids & offers', types: ['bid', 'offer', 'collection_offer'] },
  { id: 'mint', label: 'Mints', types: ['mint'] },
  { id: 'transfer', label: 'Transfers', types: ['transfer'] },
]

const mainTabs = [
  { id: 'items', label: 'Items' },
  { id: 'offers', label: 'Offers' },
  { id: 'insights', label: 'Insights' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'activity', label: 'Activity' },
  { id: 'traits', label: 'Traits' },
] as const

export function CollectionPage() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    collections,
    nfts,
    offers,
    activities,
    user,
    bulkBuy,
    connected,
    connect,
    isFounderOf,
    isOwnerOf,
    actor,
    chainEnabled,
    listingByToken,
    refreshChain,
    openSeaStatus,
  } = useMarketplace()
  const [tab, setTab] = useState('items')
  const [offerOpen, setOfferOpen] = useState(false)
  const [sort, setSort] = useState<SortKey>('price_asc')
  const [filters, setFilters] = useState<TraitFilterMap>({})
  const [mobileFilters, setMobileFilters] = useState(false)
  const [showDesc, setShowDesc] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [grid, setGrid] = useState<GridSize>(() => {
    const g = localStorage.getItem('openhood-grid') as GridSize | null
    return g === 'sm' || g === 'md' || g === 'lg' ? g : 'md'
  })
  const [bannerSize, setBannerSize] = useState<BannerSize>(() => {
    const b = localStorage.getItem('openhood-banner') as BannerSize | null
    return b === 'sm' || b === 'md' || b === 'lg' ? b : 'md'
  })
  const [sweepMode, setSweepMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ msg: string; hash?: string; pending?: boolean } | null>(
    null
  )
  const [activityFilter, setActivityFilter] = useState('all')
  const { buyOnChain, mintDemo, isPending, isConfirming, waitReceipt } = useMarketplaceTx()

  // Resolve any Robinhood collection by slug — even if not yet in Discover catalog
  const [resolved, setResolved] = useState<Collection | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  const fromCatalog = collections.find((c) => c.slug === slug || c.id === slug)
  const collection = fromCatalog || resolved
  const isOnChainCol = collection?.id === ONCHAIN_COLLECTION_ID && chainEnabled
  const inCatalog = Boolean(fromCatalog)

  useEffect(() => {
    if (!slug || inCatalog) {
      setResolved(null)
      setResolveError(null)
      setResolving(false)
      return
    }
    // Unknown slug: fetch OpenSea + Fly so deep links work for every RH collection
    let cancelled = false
    setResolving(true)
    setResolveError(null)
    ;(async () => {
      try {
        // Prefer Fly shell (may already have listings meta)
        if (hasIndexerUrl()) {
          const remote = await fetchIndexerCollection(slug, {
            lite: true,
            limit: 1,
          })
          if (
            !cancelled &&
            remote &&
            (remote.name ||
              remote.contractAddress ||
              (remote.nfts && remote.nfts.length))
          ) {
            setResolved(
              withRisk({
                id: remote.collectionId || `os-${slug}`,
                name: remote.name || slug,
                slug,
                description:
                  remote.description ||
                  `${remote.name || slug} on Robinhood Chain`,
                image: remote.image || '',
                banner: remote.banner || remote.image || '',
                floorPrice: remote.floorPrice ?? 0,
                volume24h: remote.volume24h ?? 0,
                volumeTotal: remote.volumeTotal ?? 0,
                items: remote.items ?? 0,
                owners: remote.owners ?? 0,
                founder: 'OpenSea',
                verified: false,
                openseaUrl: `https://opensea.io/collection/${slug}`,
                chain: remote.chain || 'robinhood',
                contractAddress: remote.contractAddress,
                listedPct: remote.listedPct,
                source: 'opensea',
              })
            )
            setResolving(false)
            // Still refine from OpenSea in background
          }
        }
        const os = await resolveOpenSeaCollectionBySlug(slug)
        if (cancelled) return
        if (os) {
          setResolved((prev) =>
            prev
              ? {
                  ...prev,
                  ...os,
                  image: os.image || prev.image,
                  banner: os.banner || prev.banner,
                  contractAddress: os.contractAddress || prev.contractAddress,
                }
              : os
          )
          setResolveError(null)
        } else if (!cancelled) {
          setResolveError('Collection not found on OpenSea / Robinhood')
        }
      } catch (e) {
        if (!cancelled) {
          setResolveError(
            e instanceof Error ? e.message : 'Failed to load collection'
          )
        }
      } finally {
        if (!cancelled) setResolving(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, inCatalog])

  useEffect(() => {
    localStorage.setItem('openhood-grid', grid)
  }, [grid])

  useEffect(() => {
    localStorage.setItem('openhood-banner', bannerSize)
  }, [bannerSize])

  const shrinkBanner = () =>
    setBannerSize((s) => (s === 'lg' ? 'md' : s === 'md' ? 'sm' : 'sm'))
  const growBanner = () =>
    setBannerSize((s) => (s === 'sm' ? 'md' : s === 'md' ? 'lg' : 'lg'))

  useEffect(() => {
    const trait = searchParams.get('trait')
    const value = searchParams.get('value')
    if (trait && value) {
      setFilters({ [trait]: [value] })
      setTab('items')
    }
    // Only clear filters when URL explicitly had trait and it was removed
    // (don't wipe multi-select filters that aren't mirrored in the URL)
    if (searchParams.get('sweep') === '1') {
      setSweepMode(true)
      setTab('items')
    }
  }, [searchParams])

  useEffect(() => {
    setSelected(new Set())
  }, [collection?.id, sweepMode])

  // Any resolved OpenSea / RH collection loads market data (not only pre-cataloged ones)
  const isOpenSeaCol =
    collection?.source === 'opensea' ||
    Boolean(resolved && collection && collection.id === resolved.id)
  const openSeaNfts = useOpenSeaCollectionNfts(
    isOpenSeaCol ? collection?.slug || slug : undefined,
    isOpenSeaCol ? collection?.id || (slug ? `os-${slug}` : undefined) : undefined,
    Boolean(isOpenSeaCol && (collection || slug)),
    isOpenSeaCol && collection
      ? {
          namePrefix: collection.name,
          fallbackImage: collection.image,
          contractAddress: collection.contractAddress,
          chain: collection.chain || 'robinhood',
          totalSupply: collection.items,
        }
      : isOpenSeaCol && slug
        ? {
            namePrefix: slug,
            chain: 'robinhood',
          }
        : undefined
  )

  const collectionNfts = useMemo(() => {
    if (!collection) return []
    // Live OpenSea catalog (full paginated) — not the old 18 mock stubs
    if (collection.source === 'opensea') {
      return openSeaNfts.nfts
    }
    return nfts.filter((n) => n.collectionId === collection.id)
  }, [collection, nfts, openSeaNfts.nfts])

  // Progressive art for remaining placeholders (bulk catalog pages + per-token)
  useVisibleNftEnrich(collectionNfts, {
    enabled: Boolean(isOpenSeaCol && collection),
    slug: collection?.slug,
    collectionId: collection?.id,
    contractAddress: collection?.contractAddress,
    chain: collection?.chain || 'robinhood',
    collectionImage: collection?.image,
    onPatch: openSeaNfts.replaceNfts,
  })

  const traitStats = useMemo(() => buildTraitStats(collectionNfts), [collectionNfts])

  const rarityMap = useMemo(() => {
    const ranked = rankByRarity(collectionNfts)
    return new Map(ranked.map((r) => [r.nft.id, r]))
  }, [collectionNfts])

  const items = useMemo(() => {
    let list = filterByTraits(collectionNfts, filters)
    list = [...list]
    const sortPrice = (n: typeof list[0]) =>
      n.price ?? n.auctionPrice ?? (n.inAuction ? 0 : 1e9)
    if (sort === 'price_asc')
      list.sort((a, b) => sortPrice(a) - sortPrice(b))
    if (sort === 'price_desc')
      list.sort((a, b) => (b.price ?? b.auctionPrice ?? 0) - (a.price ?? a.auctionPrice ?? 0))
    if (sort === 'id') list.sort((a, b) => a.tokenId - b.tokenId)
    if (sort === 'rarity_asc')
      list.sort(
        (a, b) =>
          (rarityMap.get(a.id)?.rarityRank ?? 9999) - (rarityMap.get(b.id)?.rarityRank ?? 9999)
      )
    if (sort === 'rarity_desc')
      list.sort(
        (a, b) =>
          (rarityMap.get(b.id)?.rarityRank ?? 0) - (rarityMap.get(a.id)?.rarityRank ?? 0)
      )
    // Surface auctions near the top when sorting by id (default discovery)
    if (sort === 'id') {
      list.sort((a, b) => Number(b.inAuction) - Number(a.inAuction) || a.tokenId - b.tokenId)
    }
    return list
  }, [collectionNfts, filters, sort, rarityMap])

  const sweepable = useMemo(() => {
    return items
      .filter((n) => {
        if (!n.listed || n.price == null) return false
        // Exclude own listings (logical owner = seller when escrowed)
        if (isOwnerOf(n.owner)) return false
        if (actor && n.owner.toLowerCase() === actor.toLowerCase()) return false
        if (user && n.owner === user) return false
        return true
      })
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  }, [items, user, actor, isOwnerOf])

  const colOffers = useMemo(() => {
    if (!collection) return []
    // Prefer live OpenSea offers for this collection (cached + refreshed)
    if (isOpenSeaCol && openSeaNfts.offers.length > 0) {
      return openSeaNfts.offers
    }
    return offers.filter((o) => o.collectionId === collection.id)
  }, [collection, offers, isOpenSeaCol, openSeaNfts.offers])

  const colActivity = useMemo(() => {
    if (!collection) return []
    const global = activities.filter((a) => a.collectionId === collection.id)
    if (!isOpenSeaCol) return global
    // Merge local collection events (instant cache + live) with global feed
    const map = new Map<string, (typeof global)[0]>()
    for (const a of openSeaNfts.activities) map.set(a.id, a)
    for (const a of global) if (!map.has(a.id)) map.set(a.id, a)
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [collection, activities, isOpenSeaCol, openSeaNfts.activities])

  const filteredActivity = useMemo(() => {
    const f = activityFilters.find((x) => x.id === activityFilter)
    if (!f?.types) return colActivity
    return colActivity.filter((a) => f.types!.includes(a.type))
  }, [colActivity, activityFilter])

  const filterCount = activeFilterCount(filters)
  const selectedNfts = sweepable.filter((n) => selected.has(n.id))
  const sweepTotal = selectedNfts.reduce((s, n) => s + (n.price ?? 0), 0)
  const listedCount = isOpenSeaCol
    ? openSeaNfts.listedCount || collectionNfts.filter((n) => n.listed).length
    : collectionNfts.filter((n) => n.listed).length
  const listedPct =
    collection && collection.items > 0
      ? +((listedCount / collection.items) * 100).toFixed(1)
      : collection?.listedPct ?? 0
  const auctionCount = collectionNfts.filter((n) => n.inAuction).length

  const onFiltersChange = (next: TraitFilterMap) => {
    setFilters(next)
    const entries = Object.entries(next)
    if (entries.length === 1 && entries[0][1].length === 1) {
      setSearchParams({ trait: entries[0][0], value: entries[0][1][0] }, { replace: true })
    } else if (entries.length === 0) {
      setSearchParams({}, { replace: true })
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectFloor = (n: number) => setSelected(new Set(sweepable.slice(0, n).map((x) => x.id)))
  const selectAllListed = () => setSelected(new Set(sweepable.map((x) => x.id)))
  const clearSelection = () => setSelected(new Set())

  const doSweep = async () => {
    if (!connected) {
      connect()
      return
    }
    if (selected.size === 0) return

    if (isOnChainCol) {
      setToast({ msg: `Buying ${selected.size} on-chain…`, pending: true })
      let ok = 0
      let lastHash: string | undefined
      for (const n of selectedNfts) {
        if (isOwnerOf(n.owner)) continue
        const tid = parseOnChainTokenId(n.id)
        if (tid == null) continue
        const L = listingByToken.get(String(tid))
        if (!L?.active) continue
        try {
          const h = await buyOnChain(L.listingId, L.price)
          lastHash = h
          try {
            await waitReceipt(h)
          } catch {
            /* continue; listing may still settle */
          }
          ok++
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Buy failed'
          if (/reject|denied|cancel|user rejected/i.test(msg)) {
            setToast({ msg: 'Rejected in wallet' })
            return
          }
          break
        }
      }
      await refreshChain()
      setSelected(new Set())
      setToast({ msg: `Bought ${ok} on-chain`, hash: lastHash })
      setTimeout(() => setToast(null), 5000)
      return
    }

    const count = bulkBuy([...selected])
    setToast({
      msg: `Swept ${count} NFT${count === 1 ? '' : 's'} for ${formatPrice(sweepTotal)} ETH (demo)`,
    })
    setSelected(new Set())
    setTimeout(() => setToast(null), 3000)
  }

  const handleMintDemo = async () => {
    if (!connected) {
      connect()
      return
    }
    setToast({ msg: 'Minting… confirm in wallet', pending: true })
    try {
      const h = await mintDemo(1)
      setToast({ msg: 'Mint submitted — waiting…', hash: h, pending: true })
      try {
        await waitReceipt(h)
      } catch {
        /* still refresh */
      }
      await refreshChain()
      setToast({ msg: 'Mint confirmed', hash: h })
      setTimeout(() => setToast(null), 5000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Mint failed'
      if (/reject|denied|cancel|user rejected/i.test(msg)) {
        setToast({ msg: 'Rejected in wallet' })
      } else {
        setToast({ msg: msg.slice(0, 100) })
      }
      setTimeout(() => setToast(null), 4000)
    }
  }

  const toggleSweep = () => {
    setSweepMode((s) => !s)
    setSelected(new Set())
  }

  if (!collection) {
    return (
      <div className="mx-auto max-w-[1920px] px-4 py-20 text-center">
        {resolving ? (
          <p className="text-ink-2">Loading Robinhood collection…</p>
        ) : (
          <>
            <p className="text-ink-2">
              {resolveError || 'Collection not found.'}
            </p>
            <p className="text-ink-3 text-sm mt-2">
              Any OpenSea collection on Robinhood Chain is supported — check the slug.
            </p>
          </>
        )}
        <Link to="/" className="text-hood text-sm mt-2 inline-block">
          Back to explore
        </Link>
      </div>
    )
  }

  const isFounder =
    isFounderOf(collection.founder) ||
    (collection.slug === 'open-pixels' && connected) // demo founder tools
  const descLong = collection.description.length > 140

  return (
    <div
      className={clsx(
        'animate-fade-in overflow-x-hidden',
        sweepMode && selected.size > 0 && 'pb-32 sm:pb-28'
      )}
    >
      {toast && (
        <TxToast
          message={toast.msg}
          hash={toast.hash}
          pending={toast.pending || isPending || isConfirming}
          onClose={() => setToast(null)}
        />
      )}

      {/* —— Banner (resizable) —— */}
      <div
        className={clsx(
          'relative w-full bg-surface-3 overflow-hidden transition-all duration-300 ease-out',
          bannerHeight[bannerSize]
        )}
      >
        <CollectionBanner
          src={collection.banner}
          fallbackSrc={collection.image}
          alt=""
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10 pointer-events-none" />

        {/* Banner size controls — hide on very small screens to reduce clutter */}
        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 flex items-center gap-0.5 sm:gap-1 rounded-lg sm:rounded-xl bg-black/45 backdrop-blur-md border border-white/15 p-0.5 sm:p-1 scale-90 sm:scale-100 origin-top-right">
          <button
            type="button"
            onClick={shrinkBanner}
            disabled={bannerSize === 'sm'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Smaller banner"
            aria-label="Smaller banner"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-0.5 px-0.5">
            {(['sm', 'md', 'lg'] as BannerSize[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setBannerSize(s)}
                title={s === 'sm' ? 'Small' : s === 'md' ? 'Medium' : 'Large'}
                className={clsx(
                  'rounded-full transition-all cursor-pointer',
                  s === 'sm' && 'w-1.5 h-1.5',
                  s === 'md' && 'w-2 h-2',
                  s === 'lg' && 'w-2.5 h-2.5',
                  bannerSize === s ? 'bg-hood' : 'bg-white/40 hover:bg-white/70'
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={growBanner}
            disabled={bannerSize === 'lg'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Larger banner"
            aria-label="Larger banner"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="absolute bottom-2 left-2 sm:left-3 z-10 px-2 py-0.5 rounded-md bg-black/40 backdrop-blur text-[10px] font-semibold text-white/80 uppercase tracking-wide hidden sm:block">
          Banner {bannerSize}
        </div>
      </div>

      {/* —— Header block —— */}
      <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4">
        {/* Avatar + actions row */}
        <div
          className={clsx(
            'relative flex flex-col sm:flex-row sm:items-end gap-4 transition-all duration-300',
            avatarOffset[bannerSize]
          )}
        >
          <div className="relative shrink-0">
            <img
              src={upgradeOpenSeaImageUrl(collection.image, 512) || collection.image}
              alt={collection.name}
              className={clsx(
                'rounded-2xl object-cover border-4 border-surface shadow-xl bg-surface transition-all duration-300',
                bannerSize === 'sm'
                  ? 'w-16 h-16 sm:w-20 sm:h-20'
                  : bannerSize === 'lg'
                    ? 'w-[110px] h-[110px] sm:w-[128px] sm:h-[128px]'
                    : 'w-[100px] h-[100px] sm:w-[120px] sm:h-[120px]'
              )}
              decoding="async"
            />
            {collection.verified && (
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-surface flex items-center justify-center shadow">
                <BadgeCheck className="w-5 h-5 text-hood" />
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0 pb-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight flex items-center gap-2 flex-wrap">
                  {collection.name}
                  <RiskBadge risk={collection.risk} />
                </h1>
                {collection.riskReasons && collection.riskReasons.length > 0 && (
                  <p className="text-[11px] text-ink-3 mt-1 max-w-xl">
                    {collection.riskReasons[0]}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
                  <span>
                    by{' '}
                    <Link
                      to={`/profile/${encodeURIComponent(collection.founder)}`}
                      className="text-ink font-medium hover:text-hood"
                    >
                      {collection.founder}
                    </Link>
                  </span>
                  <span className="text-edge hidden sm:inline">·</span>
                  <span className="text-ink-3">Robinhood Chain</span>
                  {collection.source === 'opensea' && (
                    <>
                      <span className="text-edge hidden sm:inline">·</span>
                      <span
                        className={clsx(
                          'text-xs font-semibold inline-flex items-center gap-1',
                          openSeaStatus.live ? 'text-hood' : 'text-ink-3'
                        )}
                      >
                        <span
                          className={clsx(
                            'w-1.5 h-1.5 rounded-full',
                            openSeaStatus.live ? 'bg-hood animate-pulse' : 'bg-ink-3'
                          )}
                        />
                        {openSeaStatus.live ? 'OpenSea live · 1s' : 'OpenSea snapshot'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap w-full sm:w-auto justify-start sm:justify-end">
                {collection.openseaUrl && (
                  <a
                    href={collection.openseaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 px-2.5 rounded-xl border border-edge bg-surface hover:bg-surface-2 flex items-center justify-center text-[11px] font-bold text-ink-2 hover:text-hood transition-colors shrink-0"
                    title="View on OpenSea"
                  >
                    OS
                  </a>
                )}
                {collection.website && (
                  <a
                    href={collection.website}
                    target="_blank"
                    rel="noreferrer"
                    className="w-9 h-9 rounded-xl border border-edge bg-surface hover:bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink transition-colors"
                    title="Website"
                  >
                    <Globe className="w-4 h-4" />
                  </a>
                )}
                {collection.twitter && (
                  <a
                    href={`https://x.com/${collection.twitter}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-9 h-9 rounded-xl border border-edge bg-surface hover:bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink transition-colors text-xs font-bold"
                    title="X / Twitter"
                  >
                    𝕏
                  </a>
                )}
                <button
                  type="button"
                  className="w-9 h-9 rounded-xl border border-edge bg-surface hover:bg-surface-2 flex items-center justify-center text-ink-2 cursor-pointer"
                  title="Share"
                  onClick={() => {
                    void navigator.clipboard?.writeText(window.location.href)
                    setToast({ msg: 'Link copied' })
                    setTimeout(() => setToast(null), 1500)
                  }}
                >
                  <Share2 className="w-4 h-4" />
                </button>
                {isFounder && (
                  <Link
                    to={`/collection/${collection.slug}/edit`}
                    className="w-9 h-9 rounded-xl border border-edge bg-surface hover:bg-surface-2 flex items-center justify-center text-ink-2"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </Link>
                )}
                {isOnChainCol && (
                  <Button size="sm" variant="secondary" onClick={() => void handleMintDemo()}>
                    <span className="sm:hidden">Mint</span>
                    <span className="hidden sm:inline">Mint demo NFT</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={sweepMode ? 'primary' : 'outline'}
                  onClick={() => {
                    setTab('items')
                    toggleSweep()
                  }}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>{sweepMode ? 'Exit' : 'Sweep'}</span>
                </Button>
                {!isOnChainCol && collection.source !== 'opensea' && (
                  <Button size="sm" onClick={() => setOfferOpen(true)}>
                    <span className="sm:hidden">Offer</span>
                    <span className="hidden sm:inline">Make offer</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mt-4 max-w-3xl">
          <p className={clsx('text-sm text-ink-2 leading-relaxed', !showDesc && 'line-clamp-2')}>
            {collection.description}
          </p>
          {descLong && (
            <button
              type="button"
              onClick={() => setShowDesc((s) => !s)}
              className="mt-1 text-xs font-semibold text-hood hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              {showDesc ? (
                <>
                  Show less <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  Show more <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
        </div>

        {/* OpenSea-style stat strip — 2-col grid on mobile, wrap on larger */}
        <div className="mt-5 grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:flex lg:flex-wrap gap-2 sm:gap-x-6 sm:gap-y-3">
          {[
            { label: 'Floor', value: formatPrice(collection.floorPrice), unit: 'ETH', accent: true },
            { label: '24h vol', value: formatPrice(collection.volume24h), unit: 'ETH' },
            { label: 'Total vol', value: formatPrice(collection.volumeTotal), unit: 'ETH' },
            { label: 'Items', value: collection.items.toLocaleString(), unit: '' },
            { label: 'Owners', value: collection.owners.toLocaleString(), unit: '' },
            {
              label: 'Listed',
              value:
                listedPct > 0
                  ? `${listedPct}%`
                  : listedCount > 0
                    ? String(listedCount)
                    : '—',
              unit: listedPct > 0 && listedCount > 0 ? `(${listedCount.toLocaleString()})` : '',
              accent: listedCount > 0,
            },
            ...(isOnChainCol
              ? [{ label: 'Auctions', value: String(auctionCount), unit: '', accent: auctionCount > 0 }]
              : []),
            ...(colOffers[0]
              ? [
                  {
                    label: 'Top offer',
                    value: formatPrice(colOffers[0].price),
                    unit: 'ETH',
                    accent: false as boolean | undefined,
                  },
                ]
              : []),
          ].map((s) => (
            <div
              key={s.label}
              className="min-w-0 rounded-xl border border-edge bg-surface-2/50 px-3 py-2 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:min-w-[72px]"
            >
              <div className="text-[10px] sm:text-[11px] text-ink-3 font-medium truncate">
                {s.label}
              </div>
              <div
                className={clsx(
                  'text-sm sm:text-base lg:text-lg font-bold tabular-nums mt-0.5 truncate',
                  s.accent ? 'text-hood' : 'text-ink'
                )}
              >
                {s.value}
                {s.unit && (
                  <span className="text-[10px] sm:text-xs font-semibold text-ink-3 ml-0.5 sm:ml-1">
                    {s.unit}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* —— Sticky tabs (OpenSea style) —— */}
      <div className="sticky sticky-under-nav z-30 mt-5 sm:mt-6 border-b border-edge bg-surface/95 backdrop-blur-xl">
        <div className="mx-auto max-w-[1920px] px-2 sm:px-4 lg:px-6 flex items-center gap-0.5 overflow-x-auto hide-scrollbar scroll-x">
          {mainTabs.map((t) => {
            const count =
              t.id === 'items'
                ? items.length
                : t.id === 'offers'
                  ? colOffers.length
                  : t.id === 'activity'
                    ? colActivity.length
                    : undefined
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id)
                  if (t.id !== 'items') setSweepMode(false)
                }}
                className={clsx(
                  'relative px-3 sm:px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0',
                  tab === t.id ? 'text-ink' : 'text-ink-3 hover:text-ink'
                )}
              >
                {t.label}
                {count != null && (
                  <span className="ml-1.5 text-xs font-medium text-ink-3 tabular-nums">
                    {count}
                  </span>
                )}
                {tab === t.id && (
                  <span className="absolute bottom-0 left-2 right-2 h-[3px] rounded-full bg-hood" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-4 pb-12">
        {/* —— ITEMS —— */}
        {tab === 'items' && (
          <div>
            {sweepMode && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-hood/30 bg-hood-muted px-3 py-2">
                <ShoppingCart className="w-4 h-4 text-hood" />
                <span className="text-sm font-semibold text-ink">Sweep mode</span>
                <span className="text-xs text-ink-2">{sweepable.length} listed available</span>
                <div className="flex flex-wrap gap-1.5 ml-auto">
                  {[3, 5, 10].map((n) => (
                    <Button key={n} size="sm" variant="secondary" onClick={() => selectFloor(n)}>
                      Top {n}
                    </Button>
                  ))}
                  <Button size="sm" variant="secondary" onClick={selectAllListed}>
                    All
                  </Button>
                  {selected.size > 0 && (
                    <Button size="sm" variant="ghost" onClick={clearSelection}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Sticky toolbar */}
            <div className="sticky sticky-under-nav-toolbar z-20 -mx-1 px-1 py-2 mb-3 bg-surface/95 backdrop-blur-md flex flex-wrap items-center gap-2 border-b border-edge">
              <button
                type="button"
                onClick={() => {
                  if (window.matchMedia('(min-width: 1024px)').matches) {
                    setSidebarOpen((o) => !o)
                  } else {
                    setMobileFilters(true)
                  }
                }}
                className={clsx(
                  'inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl border text-xs sm:text-sm font-medium cursor-pointer transition-colors shrink-0',
                  sidebarOpen || filterCount > 0
                    ? 'border-hood/40 bg-hood-muted text-hood'
                    : 'border-edge bg-surface-2 text-ink'
                )}
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {filterCount > 0 && (
                  <span className="px-1.5 rounded-md bg-hood text-[#0b0e11] text-[10px] font-bold">
                    {filterCount}
                  </span>
                )}
              </button>

              <div className="text-[11px] sm:text-xs text-ink-3 tabular-nums min-w-0 truncate">
                {items.length.toLocaleString()}
                {isOpenSeaCol && collection.items > 0 && (
                  <> / {collection.items.toLocaleString()}</>
                )}
                <span className="hidden xs:inline"> items</span>
                {openSeaNfts.loading && '…'}
                {isOpenSeaCol && listedCount > 0 && (
                  <span className="ml-1 text-hood/90">
                    · {listedCount.toLocaleString()} listed
                    {listedPct > 0 ? ` (${listedPct}%)` : ''}
                  </span>
                )}
                {isOpenSeaCol && openSeaNfts.refreshing && !openSeaNfts.loading && (
                  <span className="ml-1 text-hood/80">· updating</span>
                )}
                {isOpenSeaCol && openSeaNfts.enriching && (
                  <span className="ml-1 text-ink-3/80">· images</span>
                )}
                {isOpenSeaCol && openSeaNfts.fromCache && !openSeaNfts.refreshing && !openSeaNfts.loading && (
                  <span className="ml-1 text-ink-3/80">· local</span>
                )}
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 ml-auto min-w-0">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-9 px-2 sm:px-3 rounded-xl bg-surface-2 border border-edge text-xs sm:text-sm text-ink max-w-[7.5rem] sm:max-w-[160px] min-w-0"
                >
                  <option value="price_asc">Price low to high</option>
                  <option value="price_desc">Price high to low</option>
                  <option value="rarity_asc">Rarity rare first</option>
                  <option value="rarity_desc">Rarity common first</option>
                  <option value="id">Token ID</option>
                </select>

                <div className="flex rounded-xl border border-edge bg-surface-2 p-0.5">
                  {(
                    [
                      { id: 'sm' as const, icon: LayoutGrid, title: 'Small' },
                      { id: 'md' as const, icon: Grid3x3, title: 'Medium' },
                      { id: 'lg' as const, icon: Grid2x2, title: 'Large' },
                    ] as const
                  ).map(({ id, icon: Icon, title }) => (
                    <button
                      key={id}
                      type="button"
                      title={title}
                      onClick={() => setGrid(id)}
                      className={clsx(
                        'w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer',
                        grid === id ? 'bg-surface text-hood shadow-sm' : 'text-ink-3 hover:text-ink'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>

                {!sweepMode && (
                  <Button size="sm" variant="outline" onClick={() => setSweepMode(true)}>
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Sweep</span>
                  </Button>
                )}
              </div>
            </div>

            <div
              className={clsx(
                'grid gap-4',
                sidebarOpen ? 'lg:grid-cols-[260px_1fr]' : 'lg:grid-cols-1'
              )}
            >
              {sidebarOpen && (
                <div className="hidden lg:block">
                  <div className="sticky top-[10.5rem]">
                    <TraitFilterPanel
                      stats={traitStats}
                      filters={filters}
                      onChange={onFiltersChange}
                    />
                  </div>
                </div>
              )}

              <div>
                {isOnChainCol && (listedCount > 0 || auctionCount > 0) && (
                  <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px] text-ink-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded border-2 border-hood/60 bg-surface" />
                      Listed ({listedCount})
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded border-2 border-amber-500/80 bg-surface" />
                      Auction ({auctionCount})
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded border-2 border-edge bg-surface" />
                      Unlisted
                    </span>
                  </div>
                )}
                {isOpenSeaCol &&
                items.length === 0 &&
                (openSeaNfts.loading || openSeaNfts.refreshing || !openSeaNfts.ready) ? (
                  <div className="rounded-2xl border border-edge py-20 text-center">
                    <p className="text-ink font-medium">Loading marketplace…</p>
                    <p className="text-sm text-ink-3 mt-1">
                      {openSeaNfts.fromCache
                        ? 'Refreshing listings, offers & activity…'
                        : `Loading live listings for ${collection.name}`}
                    </p>
                  </div>
                ) : items.length === 0 ? (
                  <div className="rounded-2xl border border-edge py-20 text-center">
                    <p className="text-ink font-medium">No items found</p>
                    <p className="text-sm text-ink-3 mt-1">
                      {openSeaNfts.error
                        ? openSeaNfts.error
                        : 'Try clearing trait filters'}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4"
                      onClick={() => onFiltersChange({})}
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className={clsx('grid', gridClass[grid])}>
                      {items.map((n) => {
                        const rank = rarityMap.get(n.id)?.rarityRank ?? n.rarityRank
                        const canSelect =
                          sweepMode &&
                          n.listed &&
                          n.price != null &&
                          sweepable.some((s) => s.id === n.id)
                        return (
                          <div key={n.id} className="relative">
                            {rank != null && !sweepMode && (
                              <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-md bg-black/55 backdrop-blur text-white text-[10px] font-bold tabular-nums">
                                #{rank}
                              </div>
                            )}
                            {sweepMode ? (
                              canSelect ? (
                                <NftCard
                                  nft={n}
                                  showCollection={false}
                                  selectable
                                  selected={selected.has(n.id)}
                                  onSelect={toggleSelect}
                                  compact={grid === 'sm'}
                                />
                              ) : (
                                <div className="opacity-35 pointer-events-none">
                                  <NftCard nft={n} showCollection={false} compact={grid === 'sm'} />
                                </div>
                              )
                            ) : (
                              <NftCard nft={n} showCollection={false} compact={grid === 'sm'} />
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Listings book + optional unlisted catalog */}
                    {isOpenSeaCol && (
                      <div className="mt-6 flex flex-col items-center gap-3">
                        <p className="text-xs text-ink-3 text-center">
                          {listedCount > 0 ? (
                            <>
                              {listedCount.toLocaleString()} active listings
                              {listedPct > 0 ? ` (${listedPct}%)` : ''}
                              {collection.items > 0 && (
                                <> · {collection.items.toLocaleString()} supply</>
                              )}
                            </>
                          ) : (
                            <>
                              Showing {collectionNfts.length.toLocaleString()}
                              {collection.items > 0 && (
                                <> of {collection.items.toLocaleString()}</>
                              )}{' '}
                              from OpenSea
                            </>
                          )}
                          {openSeaNfts.enriching && ' · loading artwork…'}
                        </p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {openSeaNfts.hasMore && (
                            <Button
                              size="md"
                              variant="secondary"
                              disabled={openSeaNfts.loadingMore}
                              onClick={() => void openSeaNfts.loadMore()}
                            >
                              {openSeaNfts.loadingMore
                                ? 'Loading…'
                                : 'Load more'}
                            </Button>
                          )}
                          {openSeaNfts.hasMore && (
                            <Button
                              size="md"
                              variant="outline"
                              disabled={openSeaNfts.loadingMore}
                              onClick={() => void openSeaNfts.loadAll()}
                            >
                              {openSeaNfts.loadingMore
                                ? 'Loading…'
                                : 'Load more pages'}
                            </Button>
                          )}
                        </div>
                        {openSeaNfts.error && (
                          <p className="text-xs text-orange-500">{openSeaNfts.error}</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* —— OFFERS —— */}
        {tab === 'offers' && (
          <div className="rounded-2xl border border-edge overflow-hidden">
            {isOnChainCol ? (
              <div className="py-16 px-6 text-center">
                <p className="text-ink font-medium">On-chain offers not available yet</p>
                <p className="text-sm text-ink-3 mt-2 max-w-md mx-auto">
                  The testnet marketplace supports fixed-price sales and English auctions.
                  Off-chain/demo offers are for catalog collections only.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setTab('items')}>
                    Browse items
                  </Button>
                  <Button size="sm" onClick={() => void handleMintDemo()}>
                    Mint demo NFT
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-edge bg-surface-2">
                  <h2 className="text-sm font-bold text-ink">Offers</h2>
                  <Button size="sm" onClick={() => setOfferOpen(true)}>
                    Make collection offer
                  </Button>
                </div>
                <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3 border-b border-edge">
                  <div className="col-span-2">Type</div>
                  <div className="col-span-3">Item</div>
                  <div className="col-span-2">Price</div>
                  <div className="col-span-1">Qty</div>
                  <div className="col-span-2">From</div>
                  <div className="col-span-2">Expires</div>
                </div>
                {colOffers.length === 0 && (
                  <div className="py-16 text-center">
                    <p className="text-ink font-medium">No offers yet</p>
                    <p className="text-sm text-ink-3 mt-1">Be the first to make an offer</p>
                    <Button size="sm" className="mt-4" onClick={() => setOfferOpen(true)}>
                      Make offer
                    </Button>
                  </div>
                )}
                {colOffers.map((o) => {
                  const nft = o.nftId
                    ? collectionNfts.find((n) => n.id === o.nftId) ||
                      nfts.find((n) => n.id === o.nftId)
                    : undefined
                  return (
                    <div
                      key={o.id}
                      className="grid grid-cols-2 sm:grid-cols-12 gap-2 px-4 py-3.5 text-sm border-b border-edge last:border-0 items-center hover:bg-surface-2/50"
                    >
                      <div className="sm:col-span-2">
                        <Badge tone={o.type === 'collection' ? 'blue' : 'green'}>
                          {o.type === 'collection' ? 'Collection' : 'Item'}
                        </Badge>
                      </div>
                      <div className="sm:col-span-3 flex items-center gap-2 min-w-0">
                        {nft && (
                          <img src={nft.image} alt="" className="w-8 h-8 rounded-lg object-cover" />
                        )}
                        <span className="truncate font-medium text-ink">
                          {nft ? nft.name : collection.name}
                        </span>
                      </div>
                      <div className="sm:col-span-2 font-bold text-hood tabular-nums">
                        {formatPrice(o.price)} ETH
                      </div>
                      <div className="sm:col-span-1 text-ink-2">{o.quantity ?? 1}</div>
                      <div className="sm:col-span-2 text-ink-3 font-mono text-xs truncate">
                        {o.offerer}
                      </div>
                      <div className="sm:col-span-2 text-ink-3 text-xs">
                        {timeAgo(o.createdAt)} · exp {timeAgo(o.expiresAt).replace(' ago', '')}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* —— INSIGHTS —— */}
        {tab === 'insights' && (
          <CollectionInsights
            activities={colActivity}
            floorPrice={collection.floorPrice}
            collectionId={collection.id}
            intervals={collection.intervals}
            openseaUrl={collection.openseaUrl}
            collectionName={collection.name}
            source={collection.source}
          />
        )}

        {/* —— ANALYTICS —— */}
        {tab === 'analytics' && (
          <CollectionAnalytics
            nfts={collectionNfts}
            activities={colActivity}
            floorPrice={collection.floorPrice}
            volume24h={collection.volume24h}
            volumeTotal={collection.volumeTotal}
            owners={collection.owners}
            itemsTotal={collection.items}
          />
        )}

        {/* —— ACTIVITY —— */}
        {tab === 'activity' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-sm font-bold text-ink">Activity</h2>
                <p className="text-xs text-ink-3">Only activity for {collection.name}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {activityFilters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActivityFilter(f.id)}
                    className={clsx(
                      'px-2.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors',
                      activityFilter === f.id
                        ? 'bg-hood text-[#0b0e11]'
                        : 'bg-surface-2 text-ink-2 border border-edge hover:text-ink'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-edge overflow-hidden">
              {filteredActivity.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-ink-3 text-sm">
                    {isOnChainCol
                      ? 'Loading on-chain activity… or no events yet. Mint, list, or buy to generate history.'
                      : 'No activity yet'}
                  </p>
                  {isOnChainCol && (
                    <Button size="sm" className="mt-3" onClick={() => void handleMintDemo()}>
                      Mint demo NFT
                    </Button>
                  )}
                </div>
              ) : (
                filteredActivity.map((a) => <ActivityRow key={a.id} activity={a} />)
              )}
            </div>
          </div>
        )}

        {/* —— TRAITS —— */}
        {tab === 'traits' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              Trait rarity for this collection. Click a value to filter items.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {traitStats.map((stat) => (
                <div
                  key={stat.trait_type}
                  className="rounded-2xl border border-edge overflow-hidden bg-surface"
                >
                  <div className="px-4 py-2.5 bg-surface-2 border-b border-edge flex items-center justify-between">
                    <span className="font-semibold text-sm text-ink">{stat.trait_type}</span>
                    <span className="text-xs text-ink-3">{stat.values.length} values</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border)]">
                    {stat.values.map((v, i) => (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => {
                          onFiltersChange({ [stat.trait_type]: [v.value] })
                          setTab('items')
                          setSidebarOpen(true)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 cursor-pointer text-sm"
                      >
                        <span className="w-6 text-[11px] font-bold text-ink-3 tabular-nums">
                          {i + 1}
                        </span>
                        <span className="flex-1 font-medium text-ink truncate">{v.value}</span>
                        <span className="text-xs text-ink-3 tabular-nums">{v.count}</span>
                        <Badge tone={v.rarity < 15 ? 'green' : 'muted'}>
                          {v.rarity.toFixed(1)}%
                        </Badge>
                        <span className="text-xs font-semibold text-hood tabular-nums w-14 text-right">
                          {v.floor != null ? formatPrice(v.floor) : '—'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky sweep cart */}
      {sweepMode && selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-edge bg-surface/95 backdrop-blur-xl shadow-[0_-8px_30px_rgba(0,0,0,0.15)] pb-safe">
          <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <div className="flex -space-x-2">
                {selectedNfts.slice(0, 4).map((n) => (
                  <img
                    key={n.id}
                    src={n.image}
                    alt=""
                    className="w-9 h-9 rounded-lg border-2 border-surface object-cover"
                  />
                ))}
              </div>
              <div>
                <div className="text-sm font-bold text-ink">
                  {selected.size} item{selected.size === 1 ? '' : 's'}
                </div>
                <div className="text-xs text-ink-3">
                  Sweep {collection.name} · avg {formatPrice(sweepTotal / selected.size)} ETH
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] uppercase text-ink-3">Total</div>
                <div className="text-lg font-extrabold text-ink tabular-nums">
                  {formatPrice(sweepTotal)} <span className="text-hood text-sm">ETH</span>
                </div>
              </div>
              <Button
                size="lg"
                onClick={() => void doSweep()}
                disabled={isPending || isConfirming}
              >
                <ShoppingCart className="w-4 h-4" />
                {isOnChainCol ? 'Buy on-chain' : 'Buy now'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile filters */}
      {mobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileFilters(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(100%,340px)] bg-surface shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-3 py-3 border-b border-edge">
              <span className="font-bold text-ink">Filters</span>
              <button
                type="button"
                onClick={() => setMobileFilters(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-surface-2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TraitFilterPanel
                stats={traitStats}
                filters={filters}
                onChange={onFiltersChange}
                className="border-0 rounded-none"
              />
            </div>
            <div className="p-3 border-t border-edge">
              <Button fullWidth onClick={() => setMobileFilters(false)}>
                Show {items.length} items
              </Button>
            </div>
          </div>
        </div>
      )}

      <OfferModal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        collectionId={collection.id}
        collectionName={collection.name}
        floorPrice={collection.floorPrice}
        collectionOfferOnly
      />
    </div>
  )
}
