import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import type { Nft } from '../../types'
import { formatPrice, getCollection } from '../../data/mockData'

interface Props {
  nft: Nft
  selectable?: boolean
  selected?: boolean
  onSelect?: (id: string) => void
  showCollection?: boolean
  /** Dense grid — smaller padding / text */
  compact?: boolean
}

export function NftCard({
  nft,
  selectable,
  selected,
  onSelect,
  showCollection = true,
  compact = false,
}: Props) {
  const col = getCollection(nft.collectionId)

  const body = (
    <>
      <div className="relative aspect-square bg-surface-2 overflow-hidden">
        <img
          src={nft.image}
          alt={nft.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {selectable && (
          <div
            className={clsx(
              'absolute top-2 left-2 rounded-md border-2 flex items-center justify-center transition-colors',
              compact ? 'w-5 h-5' : 'w-6 h-6',
              selected
                ? 'bg-hood border-hood text-[#0b0e11]'
                : 'bg-black/40 border-white/50 backdrop-blur-sm'
            )}
          >
            {selected && <Check className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} strokeWidth={3} />}
          </div>
        )}
        {nft.listed && nft.price != null && (
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
        <div className={clsx('mt-1 flex items-center justify-between', compact ? 'text-[10px]' : 'text-xs')}>
          <span className="text-ink-3">
            {nft.listed ? (
              <span className="text-hood font-semibold">{formatPrice(nft.price)} ETH</span>
            ) : (
              'Not listed'
            )}
          </span>
          {!compact && nft.lastSale != null && (
            <span className="text-ink-3">Last {formatPrice(nft.lastSale)}</span>
          )}
        </div>
      </div>
    </>
  )

  const shell = clsx(
    'group border bg-surface overflow-hidden transition-all duration-200',
    compact ? 'rounded-xl' : 'rounded-2xl',
    selected
      ? 'border-hood ring-2 ring-hood/30 shadow-md'
      : 'border-edge hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40 hover:-translate-y-0.5'
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
