import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ShoppingCart, Trash2 } from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { NftCard } from '../components/nft/NftCard'
import { Button } from '../components/ui/Button'
import { TxToast } from '../components/wallet/TxToast'
import { formatPrice } from '../data/mockData'
import {
  ONCHAIN_COLLECTION_ID,
  feeBpsToPercent,
  parseOnChainTokenId,
} from '../lib/marketplace'
import { useMarketFee, useMarketplaceTx } from '../hooks/useOnChainMarket'

export function BulkBuyPage() {
  const {
    collections,
    nfts,
    bulkBuy,
    connected,
    connect,
    user,
    actor,
    isOwnerOf,
    listingByToken,
    chainEnabled,
    refreshChain,
  } = useMarketplace()
  const { buyOnChain, isPending, isConfirming } = useMarketplaceTx()
  const { feeBps } = useMarketFee()
  const [params] = useSearchParams()
  const initialSlug = params.get('collection') || ''
  const [collectionId, setCollectionId] = useState(() => {
    const c = collections.find((x) => x.slug === initialSlug || x.id === initialSlug)
    // Prefer on-chain collection when available
    const onchain = collections.find((x) => x.id === ONCHAIN_COLLECTION_ID)
    return c?.id || onchain?.id || collections[0]?.id || ''
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ msg: string; hash?: string; pending?: boolean } | null>(
    null
  )

  const isOnChainCol = collectionId === ONCHAIN_COLLECTION_ID && chainEnabled

  const listed = useMemo(() => {
    return nfts
      .filter(
        (n) =>
          n.collectionId === collectionId &&
          n.listed &&
          n.price != null &&
          !isOwnerOf(n.owner) &&
          n.owner !== user &&
          n.owner !== actor
      )
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  }, [nfts, collectionId, user, actor, isOwnerOf])

  const selectedNfts = listed.filter((n) => selected.has(n.id))
  const total = selectedNfts.reduce((s, n) => s + (n.price ?? 0), 0)
  const fee = (total * feeBps) / 10_000

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectFloor = (n: number) => {
    setSelected(new Set(listed.slice(0, n).map((x) => x.id)))
  }

  const clear = () => setSelected(new Set())

  const purchase = async () => {
    if (!connected) {
      connect()
      return
    }
    if (selected.size === 0) return

    if (isOnChainCol) {
      setToast({ msg: `Buying ${selected.size} on-chain…`, pending: true })
      let ok = 0
      let lastHash: string | undefined
      for (const n of selectedNfts) {
        const tid = parseOnChainTokenId(n.id)
        if (tid == null) continue
        const L = listingByToken.get(String(tid))
        if (!L) continue
        try {
          lastHash = await buyOnChain(L.listingId, L.price)
          ok++
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Buy failed'
          if (/reject|denied|cancel/i.test(msg)) {
            setToast({ msg: 'Rejected in wallet' })
            return
          }
        }
      }
      await refreshChain()
      setSelected(new Set())
      setToast({
        msg: `Bought ${ok} NFT(s) on-chain`,
        hash: lastHash,
        pending: false,
      })
      setTimeout(() => setToast(null), 5000)
      return
    }

    const count = bulkBuy([...selected])
    setToast({
      msg: `Bought ${count} NFT${count === 1 ? '' : 's'} for ${formatPrice(total)} ETH (demo)`,
    })
    setSelected(new Set())
    setTimeout(() => setToast(null), 3000)
  }

  const col = collections.find((c) => c.id === collectionId)
  const busy = isPending || isConfirming

  return (
    <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 py-6 animate-fade-in">
      {toast && (
        <TxToast
          message={toast.msg}
          hash={toast.hash}
          pending={toast.pending || busy}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-ink">Bulk buy</h2>
          <p className="text-ink-2 text-sm mt-1">
            {isOnChainCol
              ? 'On-chain sweep — each buy is a real tx with protocol fee.'
              : 'Demo catalog sweep (mock). Switch to OpenHood Testnet for live trades.'}
          </p>
        </div>
        <select
          value={collectionId}
          onChange={(e) => {
            setCollectionId(e.target.value)
            setSelected(new Set())
          }}
          className="h-11 px-3 rounded-xl bg-surface-2 border border-edge text-sm text-ink min-w-[200px]"
        >
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id === ONCHAIN_COLLECTION_ID ? '⚡ ' : ''}
              {c.name} · floor {formatPrice(c.floorPrice)}
            </option>
          ))}
        </select>
      </div>

      {isOnChainCol && (
        <div className="mb-4 rounded-xl border border-hood/30 bg-hood-muted px-3 py-2 text-xs text-ink-2">
          Live contract · fee {feeBpsToPercent(feeBps)} ·{' '}
          <Link to="/collection/openhood-testnet" className="text-hood font-semibold hover:underline">
            View collection
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" variant="secondary" onClick={() => selectFloor(3)}>
          Top 3 floor
        </Button>
        <Button size="sm" variant="secondary" onClick={() => selectFloor(5)}>
          Top 5 floor
        </Button>
        <Button size="sm" variant="secondary" onClick={() => selectFloor(10)}>
          Top 10 floor
        </Button>
        {selected.size > 0 && (
          <Button size="sm" variant="ghost" onClick={clear}>
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {listed.length === 0 && (
            <p className="col-span-full text-ink-3 text-sm py-10 text-center">
              No listed items available.
              {isOnChainCol && (
                <>
                  {' '}
                  <Link to="/collection/openhood-testnet" className="text-hood hover:underline">
                    Mint or list on OpenHood Testnet
                  </Link>
                </>
              )}
            </p>
          )}
          {listed.map((n) => (
            <NftCard
              key={n.id}
              nft={n}
              selectable
              selected={selected.has(n.id)}
              onSelect={toggle}
              showCollection={false}
            />
          ))}
        </div>

        <aside className="lg:sticky lg:top-24 h-fit rounded-2xl border border-edge bg-surface-2 p-5">
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-hood" />
            Cart
          </h2>
          <p className="text-xs text-ink-3 mt-1">{col?.name}</p>

          <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
            {selectedNfts.length === 0 && (
              <p className="text-sm text-ink-3">Select NFTs to add them here.</p>
            )}
            {selectedNfts.map((n) => (
              <div key={n.id} className="flex items-center gap-2 text-sm">
                <img src={n.image} alt="" className="w-8 h-8 rounded-md object-cover" />
                <span className="flex-1 truncate text-ink">{n.name}</span>
                <span className="font-medium tabular-nums text-ink">
                  {formatPrice(n.price)} ETH
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-edge">
            <div className="flex justify-between text-sm">
              <span className="text-ink-3">{selected.size} items</span>
              <span className="font-bold text-ink tabular-nums">
                {formatPrice(total)} <span className="text-hood">ETH</span>
              </span>
            </div>
            {isOnChainCol && selected.size > 0 && (
              <div className="flex justify-between text-xs text-ink-3 mt-1">
                <span>Est. protocol fee</span>
                <span>{formatPrice(fee)} ETH</span>
              </div>
            )}
            <Button
              fullWidth
              size="lg"
              className="mt-4"
              disabled={selected.size === 0 || busy}
              onClick={() => void purchase()}
            >
              {busy
                ? 'Confirming…'
                : `Buy ${selected.size || ''} item${selected.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
