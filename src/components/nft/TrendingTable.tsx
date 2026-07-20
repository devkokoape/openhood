/**
 * Trending list inspired by marketplace suggestion mocks:
 * - not hovered.png → default row (.trending-row-not-hovered)
 * - hovered.png     → hover row   (.trending-row-hovered)
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, LayoutGrid, List } from 'lucide-react'
import type { Activity, Collection, Nft, Offer } from '../../types'
import { formatPrice } from '../../data/mockData'
import { prefetchCollectionCatalog } from '../../lib/prefetchCatalog'
import { collectionMediaUrl, nftMediaUrl } from '../../lib/mediaUrl'
import clsx from 'clsx'

export type TrendingRange = '24h' | '1d' | '7d' | '30d' | 'all'

const LIMITS = [10, 25, 50] as const
type ViewMode = 'list' | 'cards'

export function collectionVolume(c: Collection, range: TrendingRange): number {
  const i = c.intervals
  switch (range) {
    case '24h':
    case '1d':
      return i?.volume1d ?? c.volume24h
    case '7d':
      return i?.volume7d ?? c.volume24h * 4.5
    case '30d':
      return i?.volume30d ?? c.volumeTotal * 0.35
    case 'all':
      return i?.volumeTotal ?? c.volumeTotal
    default:
      return c.volume24h
  }
}

export function collectionSales(c: Collection, range: TrendingRange): number {
  const i = c.intervals
  switch (range) {
    case '24h':
    case '1d':
      return i?.sales1d ?? 0
    case '7d':
      return i?.sales7d ?? 0
    case '30d':
      return i?.sales30d ?? 0
    case 'all':
      return i?.salesTotal ?? c.salesTotal ?? 0
    default:
      return 0
  }
}

export function floorChange7dPct(c: Collection): number {
  const v1 = c.intervals?.volume1d ?? c.volume24h
  const v7 = c.intervals?.volume7d ?? c.volume24h * 4.5
  const avg = v7 / 7
  if (avg <= 0) return 0
  return Math.max(-99.9, Math.min(999, ((v1 - avg) / avg) * 100))
}

function listedCount(c: Collection): number {
  if (c.listedPct != null && c.items > 0) {
    return Math.round((c.listedPct / 100) * c.items)
  }
  return 0
}

function ChangePct({ value }: { value: number }) {
  const flat = Math.abs(value) < 0.05
  const up = value > 0
  return (
    <span
      className={clsx(
        'text-[11px] font-semibold tabular-nums',
        flat && 'text-ink-3',
        !flat && up && 'text-hood',
        !flat && !up && 'text-[var(--color-danger)]'
      )}
    >
      {flat ? '0%' : `${up ? '+' : ''}${value.toFixed(1)}%`}
    </span>
  )
}

type Row = {
  c: Collection
  vol30: number
  sales30: number
  listed: number
  floorChg: number
  topOffer: number | null
  topSale: number | null
  topSaleImage: string | null
  previewImages: string[]
}

export function TrendingTable({
  collections,
  offers = [],
  nfts = [],
  activities = [],
  defaultLimit = 10,
}: {
  collections: Collection[]
  offers?: Offer[]
  nfts?: Nft[]
  activities?: Activity[]
  defaultLimit?: number
}) {
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(
    defaultLimit === 25 || defaultLimit === 50 ? defaultLimit : 10
  )
  const [view, setView] = useState<ViewMode>('list')

  const offersByCollection = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of offers) {
      const prev = map.get(o.collectionId) ?? 0
      if (o.price > prev) map.set(o.collectionId, o.price)
    }
    return map
  }, [offers])

  const nftsByCollection = useMemo(() => {
    const map = new Map<string, Nft[]>()
    for (const n of nfts) {
      const list = map.get(n.collectionId) ?? []
      list.push(n)
      map.set(n.collectionId, list)
    }
    return map
  }, [nfts])

  const topSaleByCollection = useMemo(() => {
    const map = new Map<string, { price: number; image?: string }>()
    // Prefer sale activities with price
    for (const a of activities) {
      if (a.type !== 'sale' || a.price == null) continue
      const prev = map.get(a.collectionId)
      if (!prev || a.price > prev.price) {
        const nft = a.nftId ? nfts.find((n) => n.id === a.nftId) : undefined
        map.set(a.collectionId, {
          price: a.price,
          image: nft?.image,
        })
      }
    }
    // Fallback: highest lastSale on nfts
    for (const [cid, list] of nftsByCollection) {
      let best: Nft | null = null
      for (const n of list) {
        if (n.lastSale == null) continue
        if (!best || (best.lastSale ?? 0) < n.lastSale) best = n
      }
      if (best?.lastSale != null) {
        const prev = map.get(cid)
        if (!prev || best.lastSale > prev.price) {
          map.set(cid, { price: best.lastSale, image: best.image })
        }
      }
    }
    return map
  }, [activities, nfts, nftsByCollection])

  const ranked: Row[] = useMemo(() => {
    return [...collections]
      .map((c) => {
        const colNfts = nftsByCollection.get(c.id) ?? []
        const previews = colNfts
          .slice(0, 10)
          .map((n) => nftMediaUrl(c.slug, n.tokenId, n.image) || n.image)
          .filter(Boolean)
        const top = offersByCollection.get(c.id)
        const sale = topSaleByCollection.get(c.id)
        return {
          c,
          vol30: collectionVolume(c, '30d'),
          sales30: collectionSales(c, '30d'),
          listed: listedCount(c),
          floorChg: floorChange7dPct(c),
          topOffer: top != null && top > 0 ? top : null,
          topSale: sale?.price ?? null,
          topSaleImage: sale?.image
            ? nftMediaUrl(c.slug, undefined, sale.image) || sale.image
            : previews[0] ?? null,
          previewImages: previews,
        }
      })
      .sort((a, b) => b.vol30 - a.vol30 || b.c.volume24h - a.c.volume24h)
  }, [collections, offersByCollection, nftsByCollection, topSaleByCollection])

  const listRows = useMemo(() => ranked.slice(0, limit), [ranked, limit])
  /** Enough cards to overflow the fixed shell so wheel/touch scroll works */
  const cardRows = useMemo(() => ranked.slice(0, 24), [ranked])

  return (
    <div className="trending-panel w-full flex flex-col">
      {/* Exact fixed height — list/cards scroll inside (wheel + touch) */}
      <div
        className="trending-view-shell"
        tabIndex={0}
        role="region"
        aria-label={view === 'list' ? 'Trending list' : 'Trending cards'}
      >
        {view === 'list' ? (
          <SuggestionList rows={listRows} />
        ) : (
          <TrendingCards rows={cardRows} />
        )}
      </div>

      {/* Fixed-height controls row (same chrome in both views) */}
      <div className="trending-view-controls mt-2.5 flex items-center justify-between gap-2 h-8 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {view === 'list' ? (
            <>
              <span className="text-[11px] text-ink-3 font-medium shrink-0">Show top</span>
              <div className="inline-flex rounded-lg border border-edge bg-surface-2 p-0.5">
                {LIMITS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setLimit(n)}
                    className={clsx(
                      'h-7 min-w-[2rem] px-2 rounded-md text-[11px] font-bold tabular-nums transition-colors cursor-pointer',
                      limit === n
                        ? 'bg-surface text-ink shadow-sm'
                        : 'text-ink-3 hover:text-ink'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <span className="text-[11px] text-ink-3 font-medium tabular-nums">
              Top {cardRows.length} collections · scroll
            </span>
          )}
        </div>

        <div className="inline-flex rounded-lg border border-edge bg-surface-2 p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-label="List view"
            aria-pressed={view === 'list'}
            className={clsx(
              'h-7 w-8 rounded-md flex items-center justify-center cursor-pointer transition-colors',
              view === 'list' ? 'bg-surface text-hood shadow-sm' : 'text-ink-3 hover:text-ink'
            )}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView('cards')}
            aria-label="Card grid scrollable"
            aria-pressed={view === 'cards'}
            className={clsx(
              'h-7 w-8 rounded-md flex items-center justify-center cursor-pointer transition-colors',
              view === 'cards' ? 'bg-surface text-hood shadow-sm' : 'text-ink-3 hover:text-ink'
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Matches suggestion mocks:
 * not hovered = .trending-row-not-hovered
 * hovered     = .trending-row-hovered (via :hover)
 */
function SuggestionList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="h-full min-h-[inherit] rounded-xl border border-dashed border-edge py-10 text-center text-sm text-ink-3 flex items-center justify-center">
        No collections yet.
      </div>
    )
  }

  return (
    <div className="trending-suggestion rounded-xl border border-edge bg-surface overflow-hidden min-h-full">
      {/* Header — matches mock column labels */}
      <div className="hidden lg:grid trending-suggestion-cols gap-3 px-3 py-2.5 border-b border-edge text-[10px] font-semibold uppercase tracking-wide text-ink-3">
        <div className="flex items-center gap-3">
          <span className="w-5 text-center">#</span>
          <span>Collection</span>
        </div>
        <div className="text-right">Floor</div>
        <div className="text-right">30d volume</div>
        <div className="text-right">Top offer</div>
        <div className="text-right">30d top sale</div>
      </div>

      <ul>
        {rows.map((row, i) => (
          <SuggestionRow key={row.c.id} row={row} rank={i + 1} />
        ))}
      </ul>
    </div>
  )
}

function SuggestionRow({ row, rank }: { row: Row; rank: number }) {
  const { c } = row
  const logo = collectionMediaUrl(c.slug, c.image) || c.image
  const listedLabel =
    row.listed > 0 && c.items > 0
      ? `${row.listed.toLocaleString()} / ${c.items.toLocaleString()}`
      : c.items > 0
        ? `— / ${c.items.toLocaleString()}`
        : null

  // Enough tiles for a seamless RTL marquee (duplicate sequence in CSS half-width trick)
  const marqueeBase =
    row.previewImages.length > 0
      ? row.previewImages
      : [logo, c.banner, logo].filter(
          (src): src is string => Boolean(src) && !/\.(mp4|webm|mov)(\?|$)/i.test(src)
        )
  const marqueeTiles =
    marqueeBase.length === 0
      ? [logo]
      : Array.from({ length: Math.max(12, marqueeBase.length * 2) }, (_, i) =>
          marqueeBase[i % marqueeBase.length]
        )

  return (
    <li>
      <Link
        to={`/collection/${c.slug}`}
        onMouseEnter={() => prefetchCollectionCatalog(c)}
        onFocus={() => prefetchCollectionCatalog(c)}
        className={clsx(
          /* Named after mock files: not hovered.png / hovered.png */
          'trending-row-not-hovered group relative block',
          'border-b border-edge/60 last:border-0',
          'px-3 py-2.5 transition-colors duration-150'
        )}
      >
        {/* Desktop layout */}
        <div className="hidden lg:grid trending-suggestion-cols gap-3 items-center relative">
          {/* Collection — marquee only here, stops before Floor */}
          <div className="flex items-center gap-3 min-w-0 relative overflow-hidden">
            {/* B/W low-opacity strip, fades into dark before Floor column */}
            <div className="trending-marquee pointer-events-none" aria-hidden>
              <div className="trending-marquee-track">
                {[0, 1].map((copy) => (
                  <div key={copy} className="trending-marquee-seq">
                    {marqueeTiles.map((src, idx) => (
                      <div key={`${copy}-${idx}`} className="trending-marquee-tile">
                        <img
                          src={src}
                          alt=""
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="trending-marquee-fade" />
            </div>

            <span className="relative z-[1] w-5 text-center text-[13px] font-medium tabular-nums text-ink-3 shrink-0">
              {rank}
            </span>
            <img
              src={logo}
              alt=""
              referrerPolicy="no-referrer"
              className="relative z-[1] w-10 h-10 rounded-full object-cover shrink-0 bg-surface-3 ring-1 ring-edge"
            />
            <div className="relative z-[1] min-w-0 flex-1">
              <div className="flex items-center gap-1 min-w-0">
                {/* Name sits above marquee; strip fades out as it reaches here */}
                <span className="trending-row-name text-[13px] font-semibold text-ink truncate group-hover:text-hood transition-colors">
                  {c.name}
                </span>
                {c.verified && (
                  <BadgeCheck className="w-3.5 h-3.5 text-hood shrink-0" />
                )}
              </div>
              {listedLabel && (
                <div className="text-[11px] text-ink-3 tabular-nums mt-0.5">
                  {listedLabel}
                </div>
              )}
            </div>
          </div>

          {/* Floor + % */}
          <div className="text-right">
            <EthLine value={c.floorPrice} />
            <div className="mt-0.5">
              <ChangePct value={row.floorChg} />
            </div>
          </div>

          {/* 30d volume + sales */}
          <div className="text-right">
            <EthLine value={row.vol30} />
            <div className="mt-0.5 text-[11px] text-ink-3 tabular-nums">
              {row.sales30 > 0 ? `${row.sales30.toLocaleString()} sales` : '— sales'}
            </div>
          </div>

          {/* Top offer */}
          <div className="text-right">
            {row.topOffer != null ? (
              <>
                <EthLine value={row.topOffer} />
                <div className="mt-0.5 text-[11px] text-ink-3 tabular-nums">
                  offer
                </div>
              </>
            ) : (
              <span className="text-[13px] text-ink-3">—</span>
            )}
          </div>

          {/* 30d top sale + thumb */}
          <div className="flex items-center justify-end gap-2">
            <div className="text-right">
              {row.topSale != null ? (
                <EthLine value={row.topSale} />
              ) : (
                <span className="text-[13px] text-ink-3">—</span>
              )}
            </div>
            {row.topSaleImage ? (
              <img
                src={row.topSaleImage}
                alt=""
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-md object-cover bg-surface-3 ring-1 ring-edge shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-md bg-surface-2 border border-edge shrink-0" />
            )}
          </div>
        </div>

        {/* Mobile / tablet compact */}
        <div className="lg:hidden relative z-[1]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-4 text-[12px] font-medium tabular-nums text-ink-3 shrink-0">
              {rank}
            </span>
            <img
              src={logo}
              alt=""
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover shrink-0 bg-surface-3"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-[13px] font-semibold text-ink truncate">
                  {c.name}
                </span>
                {c.verified && (
                  <BadgeCheck className="w-3.5 h-3.5 text-hood shrink-0" />
                )}
              </div>
              {listedLabel && (
                <div className="text-[10px] text-ink-3 tabular-nums">{listedLabel}</div>
              )}
            </div>
            {row.topSaleImage && (
              <img
                src={row.topSaleImage}
                alt=""
                className="w-8 h-8 rounded-md object-cover shrink-0 ring-1 ring-edge"
              />
            )}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 pl-6 text-[11px]">
            <div>
              <div className="text-[9px] text-ink-3">Floor</div>
              <div className="font-semibold tabular-nums text-ink">
                {formatPrice(c.floorPrice)}
              </div>
              <ChangePct value={row.floorChg} />
            </div>
            <div>
              <div className="text-[9px] text-ink-3">30d vol</div>
              <div className="font-semibold tabular-nums text-ink">
                {formatPrice(row.vol30)}
              </div>
              <div className="text-[10px] text-ink-3">
                {row.sales30 > 0 ? `${row.sales30} sales` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-ink-3">Offer</div>
              <div className="font-semibold tabular-nums text-ink">
                {row.topOffer != null ? formatPrice(row.topOffer) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-ink-3">Top sale</div>
              <div className="font-semibold tabular-nums text-ink">
                {row.topSale != null ? formatPrice(row.topSale) : '—'}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </li>
  )
}

function EthLine({ value }: { value: number }) {
  return (
    <div className="inline-flex items-baseline justify-end gap-0.5 tabular-nums">
      <span className="text-[13px] font-semibold text-ink">{formatPrice(value)}</span>
      <span className="text-[10px] font-bold text-hood">ETH</span>
    </div>
  )
}

function TrendingCards({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="h-full min-h-[inherit] rounded-xl border border-dashed border-edge py-10 text-center text-sm text-ink-3 flex items-center justify-center">
        No collections yet.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 content-start pb-1">
      {rows.map((row) => {
        const { c } = row
        const logo = collectionMediaUrl(c.slug, c.image) || c.image
        const bg =
          c.banner && !/\.(mp4|webm|mov)(\?|$)/i.test(c.banner)
            ? c.banner
            : logo

        return (
          <Link
            key={c.id}
            to={`/collection/${c.slug}`}
            onMouseEnter={() => prefetchCollectionCatalog(c)}
            className="relative overflow-hidden rounded-xl border border-edge p-2.5 min-h-[5.5rem]"
          >
            {/* Collection banner: dark fades right → left for readable stats */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <img
                src={bg}
                alt=""
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover scale-105 brightness-[0.55]"
              />
              <div className="absolute inset-0 trending-card-bg-fade" />
            </div>

            <div className="relative z-[1]">
              <div className="flex items-center gap-2">
                <img
                  src={logo}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover ring-1 ring-edge shadow-sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[13px] font-semibold text-ink truncate">
                      {c.name}
                    </span>
                    {c.verified && (
                      <BadgeCheck className="w-3.5 h-3.5 text-hood shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-ink-3 tabular-nums">
                    {row.listed > 0 && c.items > 0
                      ? `${row.listed.toLocaleString()} / ${c.items.toLocaleString()}`
                      : c.items > 0
                        ? `${c.items.toLocaleString()} items`
                        : ''}
                  </div>
                </div>
                <ChangePct value={row.floorChg} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <div>
                  <span className="text-ink-3">Floor </span>
                  <span className="font-semibold tabular-nums text-ink">
                    {formatPrice(c.floorPrice)}
                  </span>
                </div>
                <div>
                  <span className="text-ink-3">30d </span>
                  <span className="font-semibold tabular-nums text-ink">
                    {formatPrice(row.vol30)}
                  </span>
                </div>
                <div>
                  <span className="text-ink-3">Offer </span>
                  <span className="font-semibold tabular-nums text-ink">
                    {row.topOffer != null ? formatPrice(row.topOffer) : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-3">Top sale </span>
                  <span className="font-semibold tabular-nums text-ink">
                    {row.topSale != null ? formatPrice(row.topSale) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
