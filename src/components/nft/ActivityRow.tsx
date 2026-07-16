import { Link } from 'react-router-dom'
import {
  Gavel,
  ShoppingCart,
  Tag,
  ArrowLeftRight,
  HandCoins,
  Layers,
  Rocket,
} from 'lucide-react'
import type { Activity } from '../../types'
import { formatPrice, timeAgo } from '../../data/mockData'
import { Badge } from '../ui/Badge'
import { useMarketplace } from '../../context/MarketplaceContext'
import { parseOnChainTokenId } from '../../lib/marketplace'

const typeMeta: Record<
  Activity['type'],
  { label: string; tone: 'green' | 'blue' | 'orange' | 'default' | 'muted'; icon: typeof Tag }
> = {
  sale: { label: 'Sale', tone: 'green', icon: ShoppingCart },
  listing: { label: 'Listing', tone: 'default', icon: Tag },
  bid: { label: 'Bid', tone: 'blue', icon: Gavel },
  offer: { label: 'Offer', tone: 'blue', icon: HandCoins },
  collection_offer: { label: 'Coll. Offer', tone: 'blue', icon: Layers },
  transfer: { label: 'Transfer', tone: 'muted', icon: ArrowLeftRight },
  mint: { label: 'Mint', tone: 'green', icon: Rocket },
}

function fallbackNftImage(nftId?: string): string | undefined {
  if (!nftId) return undefined
  const tid = parseOnChainTokenId(nftId)
  if (tid == null) return undefined
  return `https://api.dicebear.com/7.x/shapes/svg?seed=oh-${tid}&backgroundColor=00c805,0b0e11`
}

export function ActivityRow({ activity }: { activity: Activity }) {
  const { collections, nfts } = useMarketplace()
  const meta = typeMeta[activity.type]
  const Icon = meta.icon
  const col = collections.find(
    (c) => c.id === activity.collectionId || c.slug === activity.collectionId
  )
  const nft = activity.nftId
    ? nfts.find((n) => n.id === activity.nftId)
    : undefined
  const image =
    nft?.image ||
    fallbackNftImage(activity.nftId) ||
    col?.image

  const nftLabel =
    nft?.name ||
    (activity.nftId && parseOnChainTokenId(activity.nftId) != null
      ? `OpenHood Demo #${parseOnChainTokenId(activity.nftId)}`
      : undefined)

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-2.5 sm:py-3 border-b border-edge last:border-0 hover:bg-surface-2/60 transition-colors min-w-0">
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-surface-3 flex items-center justify-center shrink-0 overflow-hidden">
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : (
          <Icon className="w-4 h-4 text-ink-3" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {nftLabel && activity.nftId ? (
            <Link
              to={`/nft/${activity.nftId}`}
              className="text-xs sm:text-sm font-medium text-ink hover:text-hood truncate max-w-[10rem] sm:max-w-none"
            >
              {nftLabel}
            </Link>
          ) : col ? (
            <Link
              to={`/collection/${col.slug}`}
              className="text-xs sm:text-sm font-medium text-ink hover:text-hood truncate max-w-[10rem] sm:max-w-none"
            >
              {col.name}
            </Link>
          ) : null}
        </div>
        <div className="text-[10px] sm:text-xs text-ink-3 mt-0.5 truncate font-mono">
          {activity.from}
          {activity.to && (
            <>
              {' '}
              → {activity.to}
            </>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 pl-1">
        {activity.price != null && (
          <div className="text-xs sm:text-sm font-semibold text-ink tabular-nums">
            {activity.price === 0 && activity.type === 'mint' ? (
              <span className="text-hood text-xs">Free</span>
            ) : (
              <>
                {formatPrice(activity.price)}{' '}
                <span className="text-hood text-[10px] sm:text-xs">ETH</span>
              </>
            )}
          </div>
        )}
        <div className="text-[10px] sm:text-[11px] text-ink-3 whitespace-nowrap">
          {timeAgo(activity.timestamp)}
        </div>
      </div>
    </div>
  )
}
