import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMarketplace } from '../context/MarketplaceContext'
import { profiles } from '../data/mockData'
import { NftCard } from '../components/nft/NftCard'
import { ActivityRow } from '../components/nft/ActivityRow'
import { Tabs } from '../components/ui/Tabs'
import { Badge } from '../components/ui/Badge'
import { formatPrice } from '../data/mockData'

export function ProfilePage() {
  const { address } = useParams()
  const { user, nfts, activities, collections, offers } = useMarketplace()
  const addr = address || user
  const profile = profiles[addr] || {
    address: addr,
    displayName: addr,
    avatar: '',
    bio: 'OpenHood trader',
    joinedAt: '2026-01-01',
  }

  const [tab, setTab] = useState('collected')

  const owned = useMemo(() => nfts.filter((n) => n.owner === addr), [nfts, addr])

  const byCollection = useMemo(() => {
    const map = new Map<string, typeof owned>()
    for (const n of owned) {
      const list = map.get(n.collectionId) || []
      list.push(n)
      map.set(n.collectionId, list)
    }
    return [...map.entries()].map(([colId, items]) => ({
      collection: collections.find((c) => c.id === colId)!,
      items,
    }))
  }, [owned, collections])

  const userActivity = useMemo(
    () => activities.filter((a) => a.from === addr || a.to === addr),
    [activities, addr]
  )

  const userOffers = useMemo(() => offers.filter((o) => o.offerer === addr), [offers, addr])

  const estValue = owned.reduce((s, n) => {
    const col = collections.find((c) => c.id === n.collectionId)
    return s + (n.price ?? col?.floorPrice ?? 0)
  }, 0)

  return (
    <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 py-6 animate-fade-in">
      <div className="rounded-2xl border border-edge bg-surface-2 p-6 md:p-8 flex flex-col sm:flex-row gap-5 items-start">
        <div className="w-20 h-20 rounded-2xl bg-hood overflow-hidden shrink-0">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#0b0e11] font-bold text-xl">
              {profile.displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-ink">{profile.displayName}</h1>
          <p className="font-mono text-sm text-ink-3 mt-0.5">{profile.address}</p>
          <p className="text-sm text-ink-2 mt-2 max-w-xl">{profile.bio}</p>
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <div>
              <span className="text-ink font-semibold">{owned.length}</span>{' '}
              <span className="text-ink-3">NFTs</span>
            </div>
            <div>
              <span className="text-ink font-semibold">{byCollection.length}</span>{' '}
              <span className="text-ink-3">Collections</span>
            </div>
            <div>
              <span className="text-ink font-semibold tabular-nums">{formatPrice(estValue)}</span>{' '}
              <span className="text-hood">ETH</span>{' '}
              <span className="text-ink-3">est. value</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Tabs
          tabs={[
            { id: 'collected', label: 'Collected', count: owned.length },
            { id: 'collections', label: 'By collection', count: byCollection.length },
            { id: 'offers', label: 'Offers', count: userOffers.length },
            { id: 'activity', label: 'Activity', count: userActivity.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'collected' && (
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {owned.length === 0 && (
            <p className="col-span-full text-ink-3 text-sm py-8 text-center">No NFTs yet.</p>
          )}
          {owned.map((n) => (
            <NftCard key={n.id} nft={n} />
          ))}
        </div>
      )}

      {tab === 'collections' && (
        <div className="mt-5 space-y-8">
          {byCollection.length === 0 && (
            <p className="text-ink-3 text-sm py-8 text-center">No collections held.</p>
          )}
          {byCollection.map(({ collection, items }) => (
            <section key={collection.id}>
              <div className="flex items-center gap-3 mb-3">
                <img
                  src={collection.image}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover"
                />
                <div>
                  <Link
                    to={`/collection/${collection.slug}`}
                    className="font-semibold text-ink hover:text-hood"
                  >
                    {collection.name}
                  </Link>
                  <div className="text-xs text-ink-3">
                    {items.length} owned · floor {formatPrice(collection.floorPrice)} ETH
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {items.map((n) => (
                  <NftCard key={n.id} nft={n} showCollection={false} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === 'offers' && (
        <div className="mt-5 rounded-2xl border border-edge overflow-hidden">
          {userOffers.length === 0 && (
            <p className="p-6 text-sm text-ink-3 text-center">No active offers.</p>
          )}
          {userOffers.map((o) => {
            const col = collections.find((c) => c.id === o.collectionId)
            const nft = o.nftId ? nfts.find((n) => n.id === o.nftId) : undefined
            return (
              <div
                key={o.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-edge last:border-0"
              >
                <Badge tone={o.type === 'collection' ? 'blue' : 'green'}>
                  {o.type === 'collection' ? 'Collection' : 'Item'}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink truncate">
                    {nft?.name || col?.name}
                  </div>
                  {o.quantity && o.quantity > 1 && (
                    <div className="text-xs text-ink-3">Qty {o.quantity}</div>
                  )}
                </div>
                <div className="font-semibold text-hood tabular-nums">
                  {formatPrice(o.price)} ETH
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'activity' && (
        <div className="mt-5 rounded-2xl border border-edge overflow-hidden">
          {userActivity.length === 0 ? (
            <p className="p-6 text-sm text-ink-3 text-center">No activity.</p>
          ) : (
            userActivity.map((a) => <ActivityRow key={a.id} activity={a} />)
          )}
        </div>
      )}
    </div>
  )
}
