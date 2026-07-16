import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, Gavel, Tag } from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { OfferModal } from '../components/nft/OfferModal'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { TxToast } from '../components/wallet/TxToast'
import { formatPrice } from '../data/mockData'
import { buildTraitStats, rankByRarity } from '../lib/traits'
import {
  feeBpsToPercent,
  formatWeiPrice,
  parseOnChainTokenId,
  weiToEth,
} from '../lib/marketplace'
import {
  minBidEth,
  useMarketFee,
  useMarketplaceTx,
} from '../hooks/useOnChainMarket'
import { getCachedOpenSeaNft } from '../lib/opensea'
import type { Hex } from 'viem'

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
    listingByToken,
    auctionByToken,
    refreshChain,
    chainEnabled,
  } = useMarketplace()

  const {
    listOnChain,
    buyOnChain,
    cancelOnChain,
    createAuctionOnChain,
    bidOnChain,
    settleOnChain,
    cancelAuctionOnChain,
    isPending,
    isConfirming,
    error: txError,
    reset: resetTx,
    waitReceipt,
  } = useMarketplaceTx()
  const { feeBps } = useMarketFee()

  const [offerOpen, setOfferOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [auctionOpen, setAuctionOpen] = useState(false)
  const [bidOpen, setBidOpen] = useState(false)
  const [listPrice, setListPrice] = useState('')
  const [reservePrice, setReservePrice] = useState('0.001')
  const [durationHrs, setDurationHrs] = useState('24')
  const [bidAmount, setBidAmount] = useState('')
  const [toast, setToast] = useState<{
    msg: string
    hash?: string
    pending?: boolean
  } | null>(null)

  const nft =
    nfts.find((n) => n.id === id) || (id ? getCachedOpenSeaNft(id) : undefined)
  const collection = nft ? collections.find((c) => c.id === nft.collectionId) : undefined
  const itemOffers = offers.filter((o) => o.nftId === nft?.id)
  const itemActivity = activities.filter((a) => a.nftId === nft?.id)

  const onChainTokenId = nft ? parseOnChainTokenId(nft.id) : null
  const isOnChain = onChainTokenId != null && chainEnabled
  const chainListing =
    onChainTokenId != null ? listingByToken.get(String(onChainTokenId)) : undefined
  const chainAuction =
    onChainTokenId != null ? auctionByToken.get(String(onChainTokenId)) : undefined

  const collectionNfts = useMemo(
    () => (nft ? nfts.filter((n) => n.collectionId === nft.collectionId) : []),
    [nfts, nft]
  )
  const traitStats = useMemo(() => buildTraitStats(collectionNfts), [collectionNfts])
  const ranked = useMemo(() => rankByRarity(collectionNfts), [collectionNfts])
  const thisRank = ranked.find((r) => r.nft.id === nft?.id)

  const showToast = (msg: string, h?: string, pending?: boolean) => {
    setToast({ msg, hash: h, pending })
    if (!pending) setTimeout(() => setToast(null), 5000)
  }

  const runTx = async (label: string, fn: () => Promise<Hex>) => {
    resetTx()
    showToast(`${label}… confirm in wallet`, undefined, true)
    try {
      const h = await fn()
      showToast(`${label} submitted — waiting for confirmation`, h, true)
      try {
        await waitReceipt(h)
      } catch {
        // still refresh; user can check explorer
      }
      await refreshChain()
      showToast(`${label} confirmed`, h, false)
      return h
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      if (/reject|denied|cancel|user rejected/i.test(msg)) showToast('Rejected in wallet')
      else showToast(msg.slice(0, 140))
      return null
    }
  }

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
  const busy = isPending || isConfirming

  const listed = isOnChain ? Boolean(chainListing?.active) : nft.listed
  const price = isOnChain && chainListing ? formatWeiPrice(chainListing.price) : nft.price

  const feeOnPrice =
    price != null ? (price * feeBps) / 10_000 : 0

  const handleBuy = async () => {
    if (!connected) {
      connect()
      return
    }
    if (isOnChain) {
      if (!chainListing) {
        showToast('No active on-chain listing')
        return
      }
      if (isOwner) {
        showToast('You cannot buy your own listing')
        return
      }
      await runTx('Buy', () => buyOnChain(chainListing.listingId, chainListing.price))
      return
    }
    if (buy(nft.id)) showToast('Purchase successful (demo catalog)')
    else showToast('Purchase failed — item may be unlisted')
  }

  const handleList = async () => {
    if (!connected) {
      connect()
      return
    }
    const p = parseFloat(listPrice)
    if (!p || p <= 0 || Number.isNaN(p)) return
    if (isOnChain && onChainTokenId != null) {
      setListOpen(false)
      await runTx('List', () => listOnChain(onChainTokenId, String(p)))
      return
    }
    if (list(nft.id, p)) {
      setListOpen(false)
      showToast('Listed successfully (demo catalog)')
    } else showToast('Could not list — check ownership')
  }

  const handleCancel = async () => {
    if (!chainListing) return
    await runTx('Cancel listing', () => cancelOnChain(chainListing.listingId))
  }

  const handleCreateAuction = async () => {
    if (onChainTokenId == null) return
    const hrs = parseFloat(durationHrs) || 24
    const secs = Math.max(60, Math.floor(hrs * 3600))
    setAuctionOpen(false)
    await runTx('Create auction', () =>
      createAuctionOnChain(onChainTokenId, reservePrice, secs)
    )
  }

  const auctionEnded =
    chainAuction && Number(chainAuction.endTime) * 1000 < Date.now()

  const minBid = chainAuction ? minBidEth(chainAuction) : '0'
  const canCancelAuction =
    Boolean(chainAuction) &&
    isOwner &&
    !auctionEnded &&
    chainAuction!.highestBid === 0n

  const handleBid = async () => {
    if (!chainAuction) return
    const amount = parseFloat(bidAmount)
    if (!amount || amount <= 0 || Number.isNaN(amount)) {
      showToast('Enter a valid bid amount')
      return
    }
    const min = parseFloat(minBid)
    if (amount + 1e-18 < min) {
      showToast(`Bid must be at least ${minBid} ETH`)
      return
    }
    setBidOpen(false)
    await runTx('Place bid', () => bidOnChain(chainAuction.auctionId, bidAmount))
  }

  const handleSettle = async () => {
    if (!chainAuction) return
    await runTx('Settle auction', () => settleOnChain(chainAuction.auctionId))
  }

  const handleCancelAuction = async () => {
    if (!chainAuction) return
    await runTx('Cancel auction', () =>
      cancelAuctionOnChain(chainAuction.auctionId)
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 py-4 sm:py-6 animate-fade-in overflow-x-hidden">
      {toast && (
        <TxToast
          message={toast.msg}
          hash={toast.hash}
          pending={toast.pending || busy}
          onClose={() => setToast(null)}
        />
      )}
      {txError && !toast && (
        <TxToast message={txError.message.slice(0, 120)} onClose={() => resetTx()} />
      )}

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-8">
        <div className="rounded-xl sm:rounded-2xl border border-edge overflow-hidden bg-surface-2 aspect-square max-h-[min(100vw-1.5rem,28rem)] lg:max-h-none mx-auto w-full">
          <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/collection/${collection.slug}`}
              className="inline-flex items-center gap-1.5 text-sm text-hood font-medium hover:underline min-w-0"
            >
              {collection.name}
              {collection.verified && <BadgeCheck className="w-4 h-4" />}
            </Link>
            {isOnChain && <Badge tone="green">On-chain</Badge>}
            {isOnChain && (
              <Badge tone="muted">Fee {feeBpsToPercent(feeBps)}</Badge>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink mt-1 break-anywhere">{nft.name}</h1>
          <p className="text-sm text-ink-3 mt-2 break-anywhere">
            Owned by{' '}
            <Link to={`/profile/${nft.owner}`} className="text-ink font-mono hover:text-hood break-all">
              {nft.owner}
            </Link>
          </p>

          {/* Live auction banner */}
          {chainAuction && (
            <div className="mt-4 rounded-2xl border border-hood/40 bg-hood-muted p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <Gavel className="w-4 h-4 text-hood" />
                Live auction
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[10px] uppercase text-ink-3">High bid</div>
                  <div className="font-bold text-hood tabular-nums">
                    {chainAuction.highestBid > 0n
                      ? `${weiToEth(chainAuction.highestBid)} ETH`
                      : 'No bids'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-ink-3">Reserve</div>
                  <div className="font-semibold text-ink tabular-nums">
                    {weiToEth(chainAuction.reservePrice)} ETH
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] uppercase text-ink-3">
                    {auctionEnded ? 'Ended' : 'Ends'}
                  </div>
                  <div className="text-ink text-xs">
                    {new Date(Number(chainAuction.endTime) * 1000).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!auctionEnded && !isOwner && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setBidAmount(minBid)
                      setBidOpen(true)
                    }}
                  >
                    Place bid
                  </Button>
                )}
                {canCancelAuction && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void handleCancelAuction()}
                  >
                    Cancel auction
                  </Button>
                )}
                {auctionEnded && (
                  <Button size="sm" disabled={busy} onClick={() => void handleSettle()}>
                    Settle auction
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-edge bg-surface-2 p-5">
            {listed && price != null ? (
              <>
                <div className="text-xs text-ink-3 uppercase tracking-wide">
                  {isOnChain ? 'On-chain price' : 'Current price'}
                </div>
                <div className="text-3xl font-extrabold text-ink mt-1 tabular-nums">
                  {formatPrice(price)} <span className="text-hood text-lg font-bold">ETH</span>
                </div>
                {isOnChain && (
                  <p className="text-xs text-ink-3 mt-1">
                    Protocol fee {feeBpsToPercent(feeBps)} ≈ {formatPrice(feeOnPrice)} ETH · seller
                    gets ~{formatPrice(price - feeOnPrice)} ETH
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {!isOwner && (
                    <Button size="lg" onClick={() => void handleBuy()} disabled={busy} className="flex-1 min-w-[140px]">
                      {busy ? 'Confirm…' : isOnChain ? 'Buy on-chain' : 'Buy now'}
                    </Button>
                  )}
                  {isOwner && isOnChain && chainListing && (
                    <Button
                      size="lg"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handleCancel()}
                    >
                      Cancel listing
                    </Button>
                  )}
                  {!isOnChain && (
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => setOfferOpen(true)}
                      className="flex-1 min-w-[140px]"
                    >
                      Make offer
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-ink-2">
                  {chainAuction
                    ? 'This item is in an auction (not fixed-price listed).'
                    : 'This item is not listed for sale.'}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {isOwner && !chainAuction && (
                    <>
                      <Button size="lg" onClick={() => setListOpen(true)} disabled={busy}>
                        <Tag className="w-4 h-4" />
                        List for sale
                      </Button>
                      {isOnChain && (
                        <Button
                          size="lg"
                          variant="outline"
                          onClick={() => setAuctionOpen(true)}
                          disabled={busy}
                        >
                          <Gavel className="w-4 h-4" />
                          Start auction
                        </Button>
                      )}
                    </>
                  )}
                  {!isOwner && !isOnChain && (
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
                <span className="text-xs font-bold text-hood">Rank #{thisRank.rarityRank}</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {nft.traits.map((t) => {
                const stat = traitStats
                  .find((s) => s.trait_type === t.trait_type)
                  ?.values.find((v) => v.value === t.value)
                return (
                  <div
                    key={t.trait_type + t.value}
                    className="rounded-xl border border-edge bg-surface px-3 py-2 text-center"
                  >
                    <div className="text-[10px] uppercase tracking-wide text-ink-3">
                      {t.trait_type}
                    </div>
                    <div className="text-sm font-medium text-ink mt-0.5">{t.value}</div>
                    {stat && (
                      <div className="text-[10px] text-hood mt-0.5 font-semibold">
                        {stat.rarity.toFixed(1)}%
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {!isOnChain && (
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
          )}

          {itemActivity.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-ink mb-3">Activity</h2>
              <div className="rounded-xl border border-edge divide-y divide-[var(--color-border)]">
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
          )}
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
        title={isOnChain ? 'List on-chain' : 'List for sale'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setListOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleList()} disabled={busy}>
              {isOnChain ? 'Approve & list' : 'List NFT'}
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="text-xs font-medium text-ink-3 uppercase">Price (ETH)</span>
          <input
            type="number"
            step="any"
            min="0"
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
            className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood"
            placeholder={String(collection.floorPrice || 0.001)}
          />
        </label>
        {isOnChain && (
          <p className="text-xs text-ink-3 mt-3">
            NFT will be escrowed in the marketplace. Fee {feeBpsToPercent(feeBps)} on sale.
            You may need two wallet confirmations (approve + list).
          </p>
        )}
      </Modal>

      <Modal
        open={auctionOpen}
        onClose={() => setAuctionOpen(false)}
        title="Start English auction"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAuctionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateAuction()} disabled={busy}>
              Create auction
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-ink-3 uppercase">Reserve (ETH)</span>
            <input
              type="number"
              step="any"
              min="0"
              value={reservePrice}
              onChange={(e) => setReservePrice(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-3 uppercase">Duration (hours)</span>
            <input
              type="number"
              min="0.02"
              step="1"
              value={durationHrs}
              onChange={(e) => setDurationHrs(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood"
            />
          </label>
          <p className="text-xs text-ink-3">
            Min bid raise +5%. Soft-close extends 2 min if bid near end. Fee on settle.
          </p>
        </div>
      </Modal>

      <Modal
        open={bidOpen}
        onClose={() => setBidOpen(false)}
        title="Place bid"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBidOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleBid()} disabled={busy}>
              Bid
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="text-xs font-medium text-ink-3 uppercase">
            Bid amount (ETH) · min {minBid}
          </span>
          <input
            type="number"
            step="any"
            min={minBid}
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood"
          />
        </label>
      </Modal>
    </div>
  )
}
