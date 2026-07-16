import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Minus, Plus, Rocket, ShoppingCart } from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { formatPrice, timeAgo } from '../data/mockData'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { TxToast } from '../components/wallet/TxToast'
import { useMarketplaceTx } from '../hooks/useOnChainMarket'
import type { MintStatus } from '../types'

const statusTone: Record<MintStatus, 'green' | 'blue' | 'muted'> = {
  live: 'green',
  upcoming: 'blue',
  ended: 'muted',
}

export function MintPage() {
  const { slug } = useParams()
  const {
    mintDrops,
    mint,
    connected,
    connect,
    collections,
    refreshChain,
  } = useMarketplace()
  const { mintDemo, isPending, isConfirming, waitReceipt } = useMarketplaceTx()
  const drop = mintDrops.find((m) => m.slug === slug || m.id === slug)
  const [qty, setQty] = useState(1)
  const [toast, setToast] = useState<{
    msg: string
    hash?: string
    pending?: boolean
  } | null>(null)

  if (!drop) {
    return (
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 py-16 text-center">
        <p className="text-ink-2">Mint page not found.</p>
        <Link to="/degen/mints" className="text-hood text-sm mt-2 inline-block">
          All mint pages
        </Link>
      </div>
    )
  }

  const isOnChain = Boolean(drop.onChain)
  const remaining = drop.supply - drop.minted
  const maxQty = Math.min(drop.maxPerWallet, remaining)
  const pct = Math.min(100, Math.round((drop.minted / drop.supply) * 100))
  const total = drop.price * qty
  const col = drop.collectionId
    ? collections.find((c) => c.id === drop.collectionId)
    : undefined
  const busy = isPending || isConfirming

  const clampQty = (n: number) => Math.max(1, Math.min(maxQty || 1, n))

  const doMint = async () => {
    if (!connected) {
      connect()
      return
    }
    if (drop.status !== 'live') return

    if (isOnChain) {
      setToast({ msg: `Minting ${qty} on-chain… confirm in wallet`, pending: true })
      try {
        const h = await mintDemo(qty)
        setToast({ msg: 'Mint submitted — waiting…', hash: h, pending: true })
        try {
          await waitReceipt(h)
        } catch {
          /* still refresh */
        }
        await refreshChain()
        setToast({
          msg: `Minted ${qty} × ${drop.name} on-chain (free)`,
          hash: h,
        })
        setQty(1)
        setTimeout(() => setToast(null), 5000)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Mint failed'
        if (/reject|denied|cancel|user rejected/i.test(msg)) {
          setToast({ msg: 'Rejected in wallet' })
        } else {
          setToast({ msg: msg.slice(0, 120) })
        }
        setTimeout(() => setToast(null), 4000)
      }
      return
    }

    const n = mint(drop.slug, qty)
    if (n > 0) {
      setToast({
        msg: `Minted ${n} × ${drop.name} for ${formatPrice(drop.price * n)} ETH (demo)`,
      })
      setQty(1)
      setTimeout(() => setToast(null), 3000)
    }
  }

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

      <Link to="/degen/mints" className="text-sm text-ink-3 hover:text-hood mb-4 inline-block">
        ← All mint pages
      </Link>

      <div className="grid lg:grid-cols-2 gap-6 lg:gap-10">
        <div className="space-y-3">
          <div className="rounded-2xl border border-edge overflow-hidden aspect-square bg-surface-2">
            <img src={drop.image} alt={drop.name} className="w-full h-full object-cover" />
          </div>
          <div className="rounded-2xl border border-edge overflow-hidden h-28 bg-surface-2">
            <img src={drop.banner} alt="" className="w-full h-full object-cover opacity-90" />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={statusTone[drop.status]}>
              {drop.status === 'live'
                ? isOnChain
                  ? 'On-chain live'
                  : 'Mint live'
                : drop.status === 'upcoming'
                  ? 'Upcoming'
                  : 'Ended'}
            </Badge>
            {isOnChain && <Badge tone="green">Free mint</Badge>}
            <span className="text-xs text-ink-3">{drop.chain}</span>
          </div>
          <h1 className="text-3xl font-extrabold text-ink mt-2 tracking-tight">{drop.name}</h1>
          <p className="text-ink-2 text-sm mt-2 max-w-lg">{drop.description}</p>

          {col && (
            <Link
              to={`/collection/${col.slug}`}
              className="inline-flex items-center gap-2 mt-3 text-sm text-hood hover:underline"
            >
              <img src={col.image} alt="" className="w-6 h-6 rounded-md object-cover" />
              Trade {col.name} on secondary
            </Link>
          )}

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              {
                label: 'Mint price',
                value: isOnChain ? 'Free' : `${formatPrice(drop.price)} ETH`,
              },
              { label: 'Minted', value: `${drop.minted.toLocaleString()}` },
              { label: 'Supply', value: drop.supply.toLocaleString() },
              { label: 'Max / wallet', value: String(drop.maxPerWallet) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-edge bg-surface-2 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-ink-3">{s.label}</div>
                <div className="font-bold text-ink tabular-nums text-sm mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-xs text-ink-3 mb-1">
              <span>Progress</span>
              <span className="tabular-nums">
                {pct}% · {remaining.toLocaleString()} left
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full bg-hood rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-edge bg-surface-2 p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={drop.status !== 'live' || qty <= 1 || busy}
                  onClick={() => setQty((q) => clampQty(q - 1))}
                  className="w-9 h-9 rounded-lg border border-edge bg-surface flex items-center justify-center disabled:opacity-40 cursor-pointer hover:border-hood"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={maxQty || 1}
                  value={qty}
                  disabled={drop.status !== 'live' || busy}
                  onChange={(e) => setQty(clampQty(parseInt(e.target.value, 10) || 1))}
                  className="w-14 h-9 text-center rounded-lg border border-edge bg-surface text-ink font-bold tabular-nums"
                />
                <button
                  type="button"
                  disabled={drop.status !== 'live' || qty >= maxQty || busy}
                  onClick={() => setQty((q) => clampQty(q + 1))}
                  className="w-9 h-9 rounded-lg border border-edge bg-surface flex items-center justify-center disabled:opacity-40 cursor-pointer hover:border-hood"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {drop.status === 'live' && maxQty > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[1, 3, 5, 10, drop.maxPerWallet]
                  .filter((n, i, a) => n <= maxQty && a.indexOf(n) === i)
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={busy}
                      onClick={() => setQty(n)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                        qty === n
                          ? 'border-hood bg-hood-muted text-hood'
                          : 'border-edge text-ink-2 hover:border-hood'
                      }`}
                    >
                      x{n}
                    </button>
                  ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-ink-3">Total</span>
              <span className="text-xl font-extrabold text-ink tabular-nums">
                {isOnChain ? (
                  <>
                    Free <span className="text-hood text-base font-semibold">gas only</span>
                  </>
                ) : (
                  <>
                    {formatPrice(total)} <span className="text-hood text-base">ETH</span>
                  </>
                )}
              </span>
            </div>

            <Button
              fullWidth
              size="lg"
              className="mt-4"
              disabled={drop.status !== 'live' || remaining <= 0 || busy}
              onClick={() => void doMint()}
            >
              <Rocket className="w-4 h-4" />
              {busy
                ? 'Confirming…'
                : drop.status === 'live'
                  ? qty > 1
                    ? isOnChain
                      ? `Mint ${qty} on-chain`
                      : `Mint ${qty}`
                    : isOnChain
                      ? 'Mint on-chain'
                      : 'Mint now'
                  : drop.status === 'upcoming'
                    ? 'Mint not open yet'
                    : 'Mint ended'}
            </Button>

            {col && (
              <Link to={`/degen/bulk?collection=${col.slug}`} className="block mt-2">
                <Button fullWidth variant="outline">
                  <ShoppingCart className="w-4 h-4" />
                  Bulk buy on secondary
                </Button>
              </Link>
            )}
          </div>

          <p className="text-xs text-ink-3 mt-4">
            {isOnChain && (
              <>Live MockERC721 on Robinhood testnet · secondary market fee 2.5%</>
            )}
            {!isOnChain && drop.status === 'upcoming' && (
              <>Starts {new Date(drop.startsAt).toLocaleString()}</>
            )}
            {!isOnChain && drop.status === 'live' && drop.endsAt && (
              <>Ends {new Date(drop.endsAt).toLocaleString()}</>
            )}
            {!isOnChain && drop.status === 'ended' && drop.endsAt && (
              <>Ended {timeAgo(drop.endsAt)}</>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
