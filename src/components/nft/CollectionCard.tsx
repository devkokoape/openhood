import { Link } from 'react-router-dom'
import { BadgeCheck } from 'lucide-react'
import type { Collection } from '../../types'
import { formatPrice } from '../../data/mockData'
import { prefetchCollectionCatalog } from '../../lib/prefetchCatalog'
import { collectionMediaUrl } from '../../lib/mediaUrl'

export function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <Link
      to={`/collection/${collection.slug}`}
      onMouseEnter={() => prefetchCollectionCatalog(collection)}
      onFocus={() => prefetchCollectionCatalog(collection)}
      className="group block rounded-2xl border border-edge bg-surface overflow-hidden card-hover"
    >
      <div className="relative h-28 bg-surface-2 overflow-hidden">
        <img
          src={
            collection.banner &&
            !/\.(mp4|webm)(\?|$)/i.test(collection.banner) &&
            !collection.banner.includes('dicebear')
              ? collection.banner
              : collection.image && !collection.image.includes('dicebear')
                ? collection.image
                : collectionMediaUrl(collection.slug, collection.image) ||
                  collection.image
          }
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            const el = e.currentTarget
            if (collection.image && el.src !== collection.image) {
              el.src = collection.image
            }
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
      </div>
      <div className="px-4 pb-4 -mt-8 relative">
        <img
          src={
            collection.image && !collection.image.includes('dicebear')
              ? collection.image
              : collectionMediaUrl(collection.slug, collection.image) ||
                collection.image
          }
          alt={collection.name}
          referrerPolicy="no-referrer"
          className="w-14 h-14 rounded-xl border-2 border-surface shadow-md object-cover bg-surface-2"
        />
        <div className="mt-2 flex items-center gap-1.5">
          <h3 className="font-semibold text-ink truncate group-hover:text-hood transition-colors">
            {collection.name}
          </h3>
          {collection.verified && <BadgeCheck className="w-4 h-4 text-hood shrink-0" />}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-ink-3">Floor</div>
            <div className="font-semibold text-ink tabular-nums">
              {formatPrice(collection.floorPrice)} <span className="text-hood text-[10px]">ETH</span>
            </div>
          </div>
          <div>
            <div className="text-ink-3">24h Vol</div>
            <div className="font-semibold text-ink tabular-nums">
              {formatPrice(collection.volume24h)} <span className="text-ink-3 text-[10px]">ETH</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
