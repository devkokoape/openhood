import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Package } from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { profiles, formatPrice } from '../data/mockData'
import { NftCard } from '../components/nft/NftCard'
import { ActivityRow } from '../components/nft/ActivityRow'
import { Tabs } from '../components/ui/Tabs'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { AddressDisplay } from '../components/ui/AddressDisplay'
import { ConnectWallet } from '../components/wallet/ConnectWallet'

export function ProfilePage() {
  const { address: routeAddress } = useParams()
  const {
    user,
    address: walletAddress,
    actor,
    connected,
    nfts,
    activities,
    collections,
    offers,
    isOwnerOf,
  } = useMarketplace()
  // Prefer full wallet address for self profile
  const addr = routeAddress || walletAddress || actor || user || ''
  const profile = profiles[addr] || profiles[user] || {
    address: addr,
    displayName: connected && !routeAddress ? 'Your wallet' : addr || 'Not connected',
    avatar: '',
    bio: connected
      ? 'Connected on Robinhood Chain · OpenHood'
      : 'Connect a wallet to view your holdings',
    joinedAt: '2026-01-01',
  }

  const [tab, setTab] = useState('collected')

  const owned = useMemo(() => {
    if (!addr && !actor) return []
    // Self profile: match by ownership helper; other profiles: exact / sameAddress
    if (!routeAddress && connected) {
      return nfts.filter((n) => isOwnerOf(n.owner))
    }
    return nfts.filter(
      (n) =>
        n.owner === addr ||
        n.owner.toLowerCase() === addr.toLowerCase() ||
        (actor && n.owner === actor)
    )
  }, [nfts, addr, actor, routeAddress, connected, isOwnerOf])

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

  const userActivity = useMemo(() => {
    if (!routeAddress && connected) {
      return activities.filter(
        (a) => isOwnerOf(a.from) || (a.to ? isOwnerOf(a.to) : false)
      )
    }
    return activities.filter(
      (a) =>
        a.from === addr ||
        a.to === addr ||
        a.from.toLowerCase() === addr.toLowerCase() ||
        (a.to && a.to.toLowerCase() === addr.toLowerCase())
    )
  }, [activities, addr, routeAddress, connected, isOwnerOf])

  const userOffers = useMemo(() => {
    if (!routeAddress && connected) {
      return offers.filter((o) => isOwnerOf(o.offerer))
    }
    return offers.filter(
      (o) => o.offerer === addr || o.offerer.toLowerCase() === addr.toLowerCase()
    )
  }, [offers, addr, routeAddress, connected, isOwnerOf])

  const listedOwned = useMemo(
    () => owned.filter((n) => n.listed || n.inAuction),
    [owned]
  )

  const estValue = owned.reduce((s, n) => {
    const col = collections.find((c) => c.id === n.collectionId)
    return s + (n.price ?? col?.floorPrice ?? 0)
  }, 0)

  return (
    <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-6 animate-fade-in">
      <div className="rounded-2xl border border-edge bg-surface-2 p-5 sm:p-6 md:p-8 flex flex-col sm:flex-row gap-5 items-start relative overflow-hidden">
        <div className="pointer-events-none absolute -top-20 -right-16 w-56 h-56 rounded-full bg-hood/10 blur-3xl" />
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-hood overflow-hidden shrink-0 relative z-[1]">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#0b0e11] font-bold text-xl">
              {profile.displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 relative z-[1]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold text-ink">
                {profile.displayName}
              </h1>
              <div className="mt-1 text-sm text-ink-3">
                {addr ? (
                  <AddressDisplay address={addr} showCopy={addr.startsWith('0x')} />
                ) : (
                  '—'
                )}
              </div>
              <p className="text-sm text-ink-2 mt-2 max-w-xl">{profile.bio}</p>
            </div>
            {!connected && !routeAddress && <ConnectWallet />}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {[
              { label: 'NFTs', value: String(owned.length) },
              { label: 'Collections', value: String(byCollection.length) },
              { label: 'Listed', value: String(listedOwned.length) },
              {
                label: 'Est. value',
                value: `${formatPrice(estValue)} ETH`,
                accent: true,
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-edge bg-surface/60 px-3 py-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-ink-3 font-semibold">
                  {s.label}
                </div>
                <div
                  className={`text-sm font-extrabold tabular-nums mt-0.5 ${
                    s.accent ? 'text-hood' : 'text-ink'
                  }`}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 sm:mt-8">
        <Tabs
          tabs={[
            { id: 'collected', label: 'Holdings', count: owned.length },
            { id: 'listed', label: 'Listings', count: listedOwned.length },
            { id: 'collections', label: 'By collection', count: byCollection.length },
            { id: 'offers', label: 'Offers', count: userOffers.length },
            { id: 'activity', label: 'Activity', count: userActivity.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'collected' && (
        <div className="mt-5">
          {owned.length === 0 ? (
            <EmptyState
              title="No NFTs yet"
              description="Mint on OpenHood testnet or buy from the market to fill your profile."
              actionLabel="Browse market"
              actionTo="/"
              icon={<Package className="w-5 h-5" />}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {owned.map((n) => (
                <NftCard key={n.id} nft={n} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'listed' && (
        <div className="mt-5">
          {listedOwned.length === 0 ? (
            <EmptyState
              title="No active listings"
              description="List an NFT you own to appear here."
              actionLabel="Discover"
              actionTo="/"
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {listedOwned.map((n) => (
                <NftCard key={n.id} nft={n} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'collections' && (
        <div className="mt-5 space-y-8">
          {byCollection.length === 0 && (
            <EmptyState title="No collections held" description="NFTs you collect will group here." />
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
