/**
 * OpenSea / Blur-style listing card — uniform grid, price-first, light chrome.
 * Used on Discover "Notable listings" (not the thick bordered NftCard).
 */
import { Link } from 'react-router-dom'
import { BadgeCheck } from 'lucide-react'
import type { Collection, Nft } from '../../types'
import { formatPrice } from '../../data/mockData'
import clsx from 'clsx'

interface Props {
  nft: Nft
  collection?: Collection
  /** Show "Buy" affordance on hover (desktop) */
  showBuyCue?: boolean
}

export function ListingCard({ nft, collection, showBuyCue = true }: Props) {
  const price = nft.inAuction
    ? nft.auctionHighBid && nft.auctionHighBid > 0
      ? nft.auctionHighBid
      : nft.auctionReserve ?? nft.price
    : nft.price

  return (
    <Link
      to={`/nft/${nft.id}`}
      className={clsx(
        'group flex flex-col bg-surface border border-edge rounded-xl overflow-hidden',
        'transition-[border-color,box-shadow,transform] duration-200',
        'hover:border-ink-3/40 dark:hover:border-ink-3/50',
        'hover:shadow-[0_8px_28px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.35)]'
      )}
    >
      {/* Media */}
      <div className="relative aspect-square bg-surface-2 overflow-hidden">
        <img
          src={nft.image}
          alt={nft.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        {/* Bottom gradient for price legibility on bright art */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent opacity-0 sm:opacity-100 pointer-events-none" />

        {nft.inAuction && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-black/70 text-white backdrop-blur-sm">
            Auction
          </span>
        )}

        {price != null && (
          <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-1">
            <span className="text-white text-xs sm:text-sm font-bold tabular-nums drop-shadow-md">
              {formatPrice(price)}{' '}
              <span className="text-[10px] font-semibold text-hood">ETH</span>
            </span>
            {showBuyCue && (
              <span className="hidden sm:inline-flex opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-hood text-[#0b0e11]">
                {nft.inAuction ? 'Bid' : 'Buy'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Meta — OpenSea density */}
      <div className="px-2.5 py-2 sm:px-3 sm:py-2.5 min-w-0">
        {collection && (
          <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-ink-3 truncate mb-0.5">
            <span className="truncate">{collection.name}</span>
            {collection.verified && (
              <BadgeCheck className="w-3 h-3 text-hood shrink-0" />
            )}
          </div>
        )}
        <div className="text-xs sm:text-sm font-semibold text-ink truncate group-hover:text-hood transition-colors">
          {nft.name}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] sm:text-[11px]">
          <span className="text-ink-3 truncate">
            {nft.lastSale != null ? (
              <>
                Last{' '}
                <span className="tabular-nums text-ink-2 font-medium">
                  {formatPrice(nft.lastSale)}
                </span>
              </>
            ) : (
              <span className="opacity-0">—</span>
            )}
          </span>
          {price != null && (
            <span className="sm:hidden font-bold tabular-nums text-hood shrink-0">
              {formatPrice(price)} Ξ
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
