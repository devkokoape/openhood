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
import { formatPrice, getCollection, getNft, timeAgo } from '../../data/mockData'
import { Badge } from '../ui/Badge'

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

export function ActivityRow({ activity }: { activity: Activity }) {
  const meta = typeMeta[activity.type]
  const Icon = meta.icon
  const col = getCollection(activity.collectionId)
  const nft = activity.nftId ? getNft(activity.nftId) : undefined

  return (
    <div className="flex items-center gap-3 px-3 py-3 border-b border-edge last:border-0 hover:bg-surface-2/60 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center shrink-0 overflow-hidden">
        {nft ? (
          <img src={nft.image} alt="" className="w-full h-full object-cover" />
        ) : col ? (
          <img src={col.image} alt="" className="w-full h-full object-cover" />
        ) : (
          <Icon className="w-4 h-4 text-ink-3" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {nft ? (
            <Link to={`/nft/${nft.id}`} className="text-sm font-medium text-ink hover:text-hood truncate">
              {nft.name}
            </Link>
          ) : col ? (
            <Link
              to={`/collection/${col.slug}`}
              className="text-sm font-medium text-ink hover:text-hood truncate"
            >
              {col.name}
            </Link>
          ) : null}
        </div>
        <div className="text-xs text-ink-3 mt-0.5 truncate">
          {activity.from}
          {activity.to && (
            <>
              {' '}
              → {activity.to}
            </>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        {activity.price != null && (
          <div className="text-sm font-semibold text-ink tabular-nums">
            {formatPrice(activity.price)} <span className="text-hood text-xs">ETH</span>
          </div>
        )}
        <div className="text-[11px] text-ink-3">{timeAgo(activity.timestamp)}</div>
      </div>
    </div>
  )
}
