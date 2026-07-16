import { Link } from 'react-router-dom'
import { ArrowRight, Rocket, ShoppingCart, Sparkles } from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { formatPrice } from '../data/mockData'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'

export function DegenOverview() {
  const { mintDrops, collections, nfts } = useMarketplace()
  const live = mintDrops.filter((m) => m.status === 'live')
  const upcoming = mintDrops.filter((m) => m.status === 'upcoming')
  const listed = nfts.filter((n) => n.listed).length

  return (
    <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-6 space-y-8">
      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Link
          to="/degen/mints"
          className="group relative rounded-2xl border border-edge overflow-hidden p-5 bg-surface-2 hover:border-hood/50 transition-colors"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-hood/10 to-transparent pointer-events-none" />
          <div className="relative flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-hood flex items-center justify-center">
              <Rocket className="w-5 h-5 text-[#0b0e11]" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-ink group-hover:text-hood transition-colors">
                Mint pages
              </h2>
              <p className="text-sm text-ink-2 mt-0.5">
                Live & upcoming drops. Mint single or bulk qty.
              </p>
              <div className="mt-3 text-sm font-semibold text-hood inline-flex items-center gap-1">
                {live.length} live · {upcoming.length} upcoming
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </Link>

        <Link
          to="/degen/bulk"
          className="group relative rounded-2xl border border-edge overflow-hidden p-5 bg-surface-2 hover:border-hood/50 transition-colors"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(255,80,0,0.08)] to-transparent pointer-events-none" />
          <div className="relative flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface border border-edge flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-hood" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-ink group-hover:text-hood transition-colors">
                Bulk buy
              </h2>
              <p className="text-sm text-ink-2 mt-0.5">
                Sweep floors — select many listings, one cart.
              </p>
              <div className="mt-3 text-sm font-semibold text-hood inline-flex items-center gap-1">
                {listed} listed items
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Live mints */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-hood" />
            <h2 className="text-lg font-bold text-ink">Live mints</h2>
          </div>
          <Link to="/degen/mints" className="text-sm font-semibold text-hood hover:underline">
            All mint pages →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {live.map((m) => {
            const pct = Math.round((m.minted / m.supply) * 100)
            return (
              <Link
                key={m.id}
                to={`/degen/mint/${m.slug}`}
                className="group rounded-2xl border border-edge bg-surface overflow-hidden hover:border-hood/50 transition-all hover:-translate-y-0.5"
              >
                <div className="relative h-28 bg-surface-2">
                  <img src={m.banner} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />
                  <div className="absolute top-2 left-2">
                    <Badge tone="green">Live</Badge>
                  </div>
                </div>
                <div className="px-3.5 pb-3.5 -mt-6 relative">
                  <img
                    src={m.image}
                    alt=""
                    className="w-12 h-12 rounded-xl border-2 border-surface shadow object-cover"
                  />
                  <h3 className="mt-2 font-bold text-ink group-hover:text-hood truncate">
                    {m.name}
                  </h3>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-ink-3">
                      Mint{' '}
                      <span className="text-hood font-semibold">{formatPrice(m.price)} ETH</span>
                    </span>
                    <span className="text-ink-2 tabular-nums">
                      {m.minted.toLocaleString()}/{m.supply.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full bg-hood rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            )
          })}
          {live.length === 0 && (
            <p className="text-sm text-ink-3 col-span-full py-6 text-center">No live mints right now.</p>
          )}
        </div>
      </section>

      {/* Upcoming + bulk CTA */}
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-edge bg-surface p-4">
          <h2 className="font-bold text-ink mb-3">Upcoming</h2>
          <div className="space-y-2">
            {upcoming.length === 0 && (
              <p className="text-sm text-ink-3">No upcoming drops scheduled.</p>
            )}
            {upcoming.map((m) => (
              <Link
                key={m.id}
                to={`/degen/mint/${m.slug}`}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-2 transition-colors"
              >
                <img src={m.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink truncate">{m.name}</div>
                  <div className="text-xs text-ink-3">
                    {formatPrice(m.price)} ETH · max {m.maxPerWallet}/wallet
                  </div>
                </div>
                <Badge tone="blue">Soon</Badge>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-edge overflow-hidden relative p-5 min-h-[180px] flex flex-col justify-end">
          <img
            src={collections[1]?.banner}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)]/90 to-transparent" />
          <div className="relative">
            <Badge tone="orange">Sweep</Badge>
            <h2 className="text-lg font-bold text-ink mt-2">Ape more with bulk buy</h2>
            <p className="text-sm text-ink-2 mt-1 mb-3">
              Grab top floor listings across collections in one transaction cart.
            </p>
            <Link to="/degen/bulk">
              <Button>
                <ShoppingCart className="w-4 h-4" />
                Open bulk buy
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
