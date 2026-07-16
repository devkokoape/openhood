import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Check, Gavel, Tag } from 'lucide-react'
import type { Nft } from '../../types'
import { formatPrice } from '../../data/mockData'
import { useMarketplace } from '../../context/MarketplaceContext'

interface Props {
  nft: Nft
  selectable?: boolean
  selected?: boolean
  onSelect?: (id: string) => void
  showCollection?: boolean
  /** Dense grid — smaller padding / text */
  compact?: boolean
}

function auctionLabel(nft: Nft): string {
  if (nft.auctionHighBid != null && nft.auctionHighBid > 0) {
    return `${formatPrice(nft.auctionHighBid)} ETH bid`
  }
  if (nft.auctionReserve != null) {
    return `${formatPrice(nft.auctionReserve)} ETH min`
  }
  if (nft.auctionPrice != null) {
    return `${formatPrice(nft.auctionPrice)} ETH`
  }
  return 'Auction'
}

function endsSoon(iso?: string): boolean {
  if (!iso) return false
  const ms = new Date(iso).getTime() - Date.now()
  return ms > 0 && ms < 3_600_000 // < 1h
}

export function NftCard({
  nft,
  selectable,
  selected,
  onSelect,
  showCollection = true,
  compact = false,
}: Props) {
  const { collections } = useMarketplace()
  const col = collections.find((c) => c.id === nft.collectionId)
  const inAuction = Boolean(nft.inAuction)
  const isListed = Boolean(nft.listed && !inAuction)

  const body = (
    <>
      <div className="relative aspect-square bg-surface-2 overflow-hidden">
        <img
          src={nft.image}
          alt={nft.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Status badges */}
        {inAuction && (
          <div
            className={clsx(
              'absolute top-2 left-2 inline-flex items-center gap-1 rounded-md font-bold uppercase tracking-wide',
              'bg-amber-500 text-[#0b0e11] shadow-md',
              compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
            )}
          >
            <Gavel className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
            Auction
          </div>
        )}
        {isListed && !selectable && (
          <div
            className={clsx(
              'absolute top-2 left-2 inline-flex items-center gap-1 rounded-md font-bold uppercase tracking-wide',
              'bg-hood text-[#0b0e11] shadow-md',
              compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
            )}
          >
            <Tag className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
            Listed
          </div>
        )}

        {selectable && (
          <div
            className={clsx(
              'absolute top-2 left-2 rounded-md border-2 flex items-center justify-center transition-colors z-10',
              compact ? 'w-5 h-5' : 'w-6 h-6',
              selected
                ? 'bg-hood border-hood text-[#0b0e11]'
                : 'bg-black/40 border-white/50 backdrop-blur-sm'
            )}
          >
            {selected && (
              <Check className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} strokeWidth={3} />
            )}
          </div>
        )}

        {/* Price pill */}
        {inAuction && (
          <div
            className={clsx(
              'absolute bottom-2 right-2 rounded-md bg-amber-500/95 text-[#0b0e11] font-bold shadow',
              compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
            )}
          >
            {auctionLabel(nft)}
          </div>
        )}
        {isListed && nft.price != null && (
          <div
            className={clsx(
              'absolute bottom-2 right-2 rounded-md bg-black/60 backdrop-blur text-white font-semibold',
              compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
            )}
          >
            {formatPrice(nft.price)} ETH
          </div>
        )}
      </div>

      <div className={compact ? 'p-2' : 'p-3'}>
        {showCollection && col && (
          <div className="text-[11px] text-ink-3 truncate mb-0.5">{col.name}</div>
        )}
        <div
          className={clsx(
            'font-medium text-ink truncate',
            compact ? 'text-xs' : 'text-sm'
          )}
        >
          {nft.name}
        </div>
        <div
          className={clsx(
            'mt-1 flex items-center justify-between gap-1',
            compact ? 'text-[10px]' : 'text-xs'
          )}
        >
          <span className="truncate">
            {inAuction ? (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                {nft.auctionHighBid != null && nft.auctionHighBid > 0
                  ? `Bid ${formatPrice(nft.auctionHighBid)}`
                  : `Reserve ${formatPrice(nft.auctionReserve ?? nft.price)}`}{' '}
                ETH
              </span>
            ) : isListed ? (
              <span className="text-hood font-semibold">
                {formatPrice(nft.price)} ETH
              </span>
            ) : (
              <span className="text-ink-3">Not listed</span>
            )}
          </span>
          {inAuction && nft.auctionEndsAt && !compact && (
            <span
              className={clsx(
                'shrink-0 tabular-nums',
                endsSoon(nft.auctionEndsAt)
                  ? 'text-orange-500 font-semibold'
                  : 'text-ink-3'
              )}
            >
              {endsSoon(nft.auctionEndsAt) ? 'Ending soon' : 'Live'}
            </span>
          )}
          {!compact && !inAuction && nft.lastSale != null && (
            <span className="text-ink-3 shrink-0">Last {formatPrice(nft.lastSale)}</span>
          )}
        </div>
      </div>
    </>
  )

  const shell = clsx(
    'group border-2 bg-surface overflow-hidden transition-all duration-200 min-w-0',
    compact ? 'rounded-xl' : 'rounded-2xl',
    selected && 'ring-2 ring-hood/40 shadow-md',
    // Distinct borders by market state (hover lift only on fine pointers via CSS)
    inAuction && !selected &&
      'border-amber-500/80 shadow-[0_0_0_1px_rgba(245,158,11,0.25)] sm:hover:border-amber-400',
    isListed && !selected && !inAuction &&
      'border-hood/50 sm:hover:border-hood',
    !inAuction && !isListed && !selected &&
      'border-edge sm:hover:shadow-lg sm:hover:shadow-black/5 dark:sm:hover:shadow-black/40',
    selected && inAuction && 'border-amber-500',
    selected && isListed && !inAuction && 'border-hood',
    selected && !inAuction && !isListed && 'border-hood'
  )

  if (selectable) {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(nft.id)}
        className={clsx(shell, 'text-left w-full cursor-pointer')}
      >
        {body}
      </button>
    )
  }

  return (
    <Link to={`/nft/${nft.id}`} className={clsx(shell, 'block')}>
      {body}
    </Link>
  )
}
