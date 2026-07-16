/**
 * Blur / OpenSea-style dense activity feed.
 * Single-line rows, type chips, right-aligned price + time.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRightLeft,
  Gavel,
  HandCoins,
  Rocket,
  ShoppingCart,
  Tag,
} from 'lucide-react'
import type { Activity, Collection, Nft } from '../../types'
import { formatPrice, timeAgo } from '../../data/mockData'
import clsx from 'clsx'

type FilterId = 'all' | 'sale' | 'listing' | 'mint' | 'bid'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sale', label: 'Sales' },
  { id: 'listing', label: 'Listings' },
  { id: 'mint', label: 'Mints' },
  { id: 'bid', label: 'Bids' },
]

function matchesFilter(a: Activity, f: FilterId): boolean {
  if (f === 'all') return true
  if (f === 'sale') return a.type === 'sale'
  if (f === 'listing') return a.type === 'listing'
  if (f === 'mint') return a.type === 'mint'
  if (f === 'bid')
    return a.type === 'bid' || a.type === 'offer' || a.type === 'collection_offer'
  return true
}

function typeMeta(type: Activity['type']): {
  label: string
  className: string
  Icon: typeof Tag
} {
  switch (type) {
    case 'sale':
      return {
        label: 'Sale',
        className: 'text-hood bg-hood-muted',
        Icon: ShoppingCart,
      }
    case 'listing':
      return {
        label: 'List',
        className: 'text-ink-2 bg-surface-3',
        Icon: Tag,
      }
    case 'mint':
      return {
        label: 'Mint',
        className: 'text-hood bg-hood-muted',
        Icon: Rocket,
      }
    case 'bid':
      return {
        label: 'Bid',
        className: 'text-[var(--color-bid)] bg-[rgba(81,133,255,0.12)]',
        Icon: Gavel,
      }
    case 'offer':
    case 'collection_offer':
      return {
        label: type === 'collection_offer' ? 'C-Offer' : 'Offer',
        className: 'text-[var(--color-bid)] bg-[rgba(81,133,255,0.12)]',
        Icon: HandCoins,
      }
    default:
      return {
        label: 'Xfer',
        className: 'text-ink-3 bg-surface-2',
        Icon: ArrowRightLeft,
      }
  }
}

function shortAddr(s: string): string {
  if (!s) return '—'
  if (s.length <= 12) return s
  if (s.includes('…')) return s
  return `${s.slice(0, 6)}…${s.slice(-4)}`
}

export function HomeActivityFeed({
  activities,
  collections,
  nfts,
  limit = 14,
}: {
  activities: Activity[]
  collections: Collection[]
  nfts: Nft[]
  limit?: number
}) {
  const [filter, setFilter] = useState<FilterId>('all')

  const rows = useMemo(() => {
    return activities.filter((a) => matchesFilter(a, filter)).slice(0, limit)
  }, [activities, filter, limit])

  const counts = useMemo(() => {
    const c: Record<FilterId, number> = {
      all: activities.length,
      sale: 0,
      listing: 0,
      mint: 0,
      bid: 0,
    }
    for (const a of activities) {
      if (a.type === 'sale') c.sale++
      else if (a.type === 'listing') c.listing++
      else if (a.type === 'mint') c.mint++
      else if (
        a.type === 'bid' ||
        a.type === 'offer' ||
        a.type === 'collection_offer'
      )
        c.bid++
    }
    return c
  }, [activities])

  return (
    <div className="rounded-xl sm:rounded-2xl border border-edge bg-surface overflow-hidden">
      {/* Filter bar — Blur-style compact chips */}
      <div className="flex items-center gap-1 px-2 sm:px-3 py-2 border-b border-edge bg-surface-2/40 overflow-x-auto hide-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={clsx(
              'shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
              filter === f.id
                ? 'bg-hood text-[#0b0e11]'
                : 'text-ink-3 hover:text-ink hover:bg-surface-2'
            )}
          >
            {f.label}
            {counts[f.id] > 0 && (
              <span
                className={clsx(
                  'tabular-nums text-[10px]',
                  filter === f.id ? 'text-[#0b0e11]/70' : 'text-ink-3'
                )}
              >
                {Math.min(counts[f.id], 99)}
                {counts[f.id] > 99 ? '+' : ''}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Column labels — desktop */}
      <div className="hidden md:grid grid-cols-[72px_1fr_100px_110px_72px] gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-ink-3 border-b border-edge">
        <div>Event</div>
        <div>Item</div>
        <div className="text-right">Price</div>
        <div>From</div>
        <div className="text-right">Time</div>
      </div>

      {rows.length === 0 ? (
        <p className="py-14 text-center text-sm text-ink-3">
          No {filter === 'all' ? '' : filter + ' '}activity yet.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] max-h-[min(28rem,60vh)] overflow-y-auto overscroll-contain">
          {rows.map((a) => {
            const col = collections.find((c) => c.id === a.collectionId)
            const nft = a.nftId ? nfts.find((n) => n.id === a.nftId) : undefined
            const meta = typeMeta(a.type)
            const Icon = meta.Icon
            const img = nft?.image || col?.image
            const title = nft?.name || col?.name || 'Unknown'
            const subtitle = nft && col ? col.name : undefined

            return (
              <li key={a.id}>
                <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[72px_1fr_100px_110px_72px] gap-2 md:gap-3 items-center px-3 sm:px-4 py-2.5 hover:bg-surface-2/70 transition-colors">
                  {/* Type */}
                  <div className="flex items-center">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide',
                        meta.className
                      )}
                    >
                      <Icon className="w-3 h-3 opacity-80 hidden sm:block" />
                      {meta.label}
                    </span>
                  </div>

                  {/* Item */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden bg-surface-3 shrink-0 ring-1 ring-edge">
                      {img ? (
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon className="w-4 h-4 text-ink-3" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      {a.nftId && nft ? (
                        <Link
                          to={`/nft/${a.nftId}`}
                          className="text-sm font-semibold text-ink hover:text-hood truncate block"
                        >
                          {title}
                        </Link>
                      ) : col ? (
                        <Link
                          to={`/collection/${col.slug}`}
                          className="text-sm font-semibold text-ink hover:text-hood truncate block"
                        >
                          {title}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-ink truncate block">
                          {title}
                        </span>
                      )}
                      {subtitle && (
                        <div className="text-[11px] text-ink-3 truncate">{subtitle}</div>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="text-right tabular-nums">
                    {a.price != null && a.price > 0 ? (
                      <span className="text-sm font-bold text-ink">
                        {formatPrice(a.price)}
                        <span className="text-hood text-[10px] ml-0.5 font-semibold">
                          ETH
                        </span>
                      </span>
                    ) : a.type === 'mint' ? (
                      <span className="text-xs font-bold text-hood">Free</span>
                    ) : (
                      <span className="text-ink-3 text-sm">—</span>
                    )}
                    {/* Mobile time under price */}
                    <div className="md:hidden text-[10px] text-ink-3 mt-0.5">
                      {timeAgo(a.timestamp)}
                    </div>
                  </div>

                  {/* From — desktop */}
                  <div className="hidden md:block text-[11px] font-mono text-ink-3 truncate">
                    {shortAddr(a.from)}
                  </div>

                  {/* Time — desktop */}
                  <div className="hidden md:block text-right text-[11px] text-ink-3 tabular-nums whitespace-nowrap">
                    {timeAgo(a.timestamp)}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
