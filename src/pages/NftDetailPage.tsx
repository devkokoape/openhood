import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, Tag } from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { OfferModal } from '../components/nft/OfferModal'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { formatPrice } from '../data/mockData'
import { buildTraitStats, rankByRarity } from '../lib/traits'

export function NftDetailPage() {
  const { id } = useParams()
  const {
    nfts,
    collections,
    buy,
    list,
    connected,
    connect,
    offers,
    activities,
    isOwnerOf,
  } = useMarketplace()
  const [offerOpen, setOfferOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [listPrice, setListPrice] = useState('')
  const [toast, setToast] = useState('')

  const nft = nfts.find((n) => n.id === id)
  const collection = nft ? collections.find((c) => c.id === nft.collectionId) : undefined
  const itemOffers = offers.filter((o) => o.nftId === nft?.id)
  const itemActivity = activities.filter((a) => a.nftId === nft?.id)

  const collectionNfts = useMemo(
    () => (nft ? nfts.filter((n) => n.collectionId === nft.collectionId) : []),
    [nfts, nft]
  )
  const traitStats = useMemo(() => buildTraitStats(collectionNfts), [collectionNfts])
  const ranked = useMemo(() => rankByRarity(collectionNfts), [collectionNfts])
  const thisRank = ranked.find((r) => r.nft.id === nft?.id)

  if (!nft || !collection) {
    return (
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 py-20 text-center text-ink-2">
        NFT not found.{' '}
        <Link to="/" className="text-hood">
          Explore
        </Link>
      </div>
    )
  }

  const isOwner = connected && isOwnerOf(nft.owner)

  const handleBuy = () => {
    if (!connected) {
      connect()
      return
    }
    if (buy(nft.id)) {
      setToast('Purchase successful!')
      setTimeout(() => setToast(''), 2500)
    } else {
      setToast('Purchase failed — item may be unlisted')
      setTimeout(() => setToast(''), 2500)
    }
  }

  const handleList = () => {
    if (!connected) {
      connect()
      return
    }
    const p = parseFloat(listPrice)
    if (!p || p <= 0 || Number.isNaN(p)) return
    if (list(nft.id, p)) {
      setListOpen(false)
      setToast('Listed successfully')
      setTimeout(() => setToast(''), 2500)
    } else {
      setToast('Could not list — check ownership')
      setTimeout(() => setToast(''), 2500)
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 py-6 animate-fade-in">
      {toast && (
        <div className="fixed top-20 right-4 z-50 px-4 py-2 rounded-xl bg-hood text-[#0b0e11] font-semibold text-sm shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="rounded-2xl border border-edge overflow-hidden bg-surface-2 aspect-square">
          <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" />
        </div>

        <div>
          <Link
            to={`/collection/${collection.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-hood font-medium hover:underline"
          >
            {collection.name}
            {collection.verified && <BadgeCheck className="w-4 h-4" />}
          </Link>
          <h1 className="text-3xl font-bold text-ink mt-1">{nft.name}</h1>
          <p className="text-sm text-ink-3 mt-2">
            Owned by{' '}
            <Link to={`/profile/${nft.owner}`} className="text-ink font-mono hover:text-hood">
              {nft.owner}
            </Link>
          </p>

          <div className="mt-6 rounded-2xl border border-edge bg-surface-2 p-5">
            {nft.listed && nft.price != null ? (
              <>
                <div className="text-xs text-ink-3 uppercase tracking-wide">Current price</div>
                <div className="text-3xl font-extrabold text-ink mt-1 tabular-nums">
                  {formatPrice(nft.price)}{' '}
                  <span className="text-hood text-lg font-bold">ETH</span>
                </div>
                {nft.lastSale != null && (
                  <div className="text-xs text-ink-3 mt-1">
                    Last sale {formatPrice(nft.lastSale)} ETH
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {!isOwner && (
                    <Button size="lg" onClick={handleBuy} className="flex-1 min-w-[140px]">
                      Buy now
                    </Button>
                  )}
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => setOfferOpen(true)}
                    className="flex-1 min-w-[140px]"
                  >
                    Make offer
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-ink-2">This item is not listed for sale.</div>
                {nft.lastSale != null && (
                  <div className="text-xs text-ink-3 mt-1">
                    Last sale {formatPrice(nft.lastSale)} ETH
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {isOwner ? (
                    <Button size="lg" onClick={() => setListOpen(true)}>
                      <Tag className="w-4 h-4" />
                      List for sale
                    </Button>
                  ) : (
                    <Button size="lg" variant="outline" onClick={() => setOfferOpen(true)}>
                      Make offer
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-ink">Traits</h2>
              {thisRank && (
                <Link
                  to={`/rankings?collection=${collection.slug}`}
                  className="text-xs font-bold text-hood hover:underline"
                >
                  Rarity rank #{thisRank.rarityRank}
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {nft.traits.map((t) => {
                const stat = traitStats
                  .find((s) => s.trait_type === t.trait_type)
                  ?.values.find((v) => v.value === t.value)
                return (
                  <Link
                    key={t.trait_type + t.value}
                    to={`/collection/${collection.slug}?trait=${encodeURIComponent(t.trait_type)}&value=${encodeURIComponent(t.value)}`}
                    className="rounded-xl border border-edge bg-surface px-3 py-2 text-center hover:border-hood/50 transition-colors"
                  >
                    <div className="text-[10px] uppercase tracking-wide text-ink-3">
                      {t.trait_type}
                    </div>
                    <div className="text-sm font-medium text-ink mt-0.5">{t.value}</div>
                    {stat && (
                      <div className="text-[10px] text-hood mt-0.5 font-semibold">
                        {stat.rarity.toFixed(1)}% · {stat.count} items
                      </div>
                    )}
                  </Link>
                )
              })}
              {thisRank && (
                <div className="rounded-xl border border-edge bg-hood-muted px-3 py-2 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-ink-3">Rarity rank</div>
                  <div className="text-sm font-bold text-hood mt-0.5">#{thisRank.rarityRank}</div>
                  <div className="text-[10px] text-ink-3">score {thisRank.rarityScore.toFixed(2)}</div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-ink mb-3">Offers on this item</h2>
            <div className="rounded-xl border border-edge divide-y divide-[var(--color-border)]">
              {itemOffers.length === 0 && (
                <p className="p-4 text-sm text-ink-3">No item offers yet.</p>
              )}
              {itemOffers.map((o) => (
                <div key={o.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <Badge tone="blue">Item</Badge>
                    <span className="ml-2 font-mono text-xs text-ink-3">{o.offerer}</span>
                  </div>
                  <span className="font-semibold text-hood">{formatPrice(o.price)} ETH</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-ink mb-3">Activity</h2>
            <div className="rounded-xl border border-edge divide-y divide-[var(--color-border)]">
              {itemActivity.length === 0 && (
                <p className="p-4 text-sm text-ink-3">No activity yet.</p>
              )}
              {itemActivity.map((a) => (
                <div key={a.id} className="flex justify-between px-4 py-3 text-sm">
                  <span className="capitalize text-ink-2">{a.type.replace('_', ' ')}</span>
                  <span className="text-ink font-medium tabular-nums">
                    {a.price != null ? `${formatPrice(a.price)} ETH` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <OfferModal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        collectionId={collection.id}
        nftId={nft.id}
        collectionName={collection.name}
        nftName={nft.name}
        floorPrice={collection.floorPrice}
      />

      <Modal
        open={listOpen}
        onClose={() => setListOpen(false)}
        title="List for sale"
        footer={
          <>
            <Button variant="ghost" onClick={() => setListOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleList}>List NFT</Button>
          </>
        }
      >
        <label className="block">
          <span className="text-xs font-medium text-ink-3 uppercase">Price (ETH)</span>
          <input
            type="number"
            step="0.001"
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
            className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood"
            placeholder={String(collection.floorPrice)}
          />
        </label>
      </Modal>
    </div>
  )
}
