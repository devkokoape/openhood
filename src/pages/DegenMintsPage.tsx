import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMarketplace } from '../context/MarketplaceContext'
import { formatPrice } from '../data/mockData'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import type { MintStatus } from '../types'

const statusTone: Record<MintStatus, 'green' | 'blue' | 'muted'> = {
  live: 'green',
  upcoming: 'blue',
  ended: 'muted',
}

const statusLabel: Record<MintStatus, string> = {
  live: 'Live',
  upcoming: 'Upcoming',
  ended: 'Ended',
}

export function DegenMintsPage() {
  const { mintDrops } = useMarketplace()
  const [tab, setTab] = useState('all')

  const filtered = useMemo(() => {
    let list = [...mintDrops]
    if (tab !== 'all') list = list.filter((m) => m.status === tab)
    // live first, then upcoming, then ended; within status by % filled
    const order: MintStatus[] = ['live', 'upcoming', 'ended']
    list.sort((a, b) => {
      const od = order.indexOf(a.status) - order.indexOf(b.status)
      if (od !== 0) return od
      return b.minted / b.supply - a.minted / a.supply
    })
    return list
  }, [mintDrops, tab])

  const counts = {
    all: mintDrops.length,
    live: mintDrops.filter((m) => m.status === 'live').length,
    upcoming: mintDrops.filter((m) => m.status === 'upcoming').length,
    ended: mintDrops.filter((m) => m.status === 'ended').length,
  }

  return (
    <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-ink">Mint pages</h2>
        <p className="text-sm text-ink-2 mt-0.5">
          Browse live, upcoming, and sold-out mints. Open a page to mint (single or multi).
        </p>
      </div>

      <Tabs
        tabs={[
          { id: 'all', label: 'All', count: counts.all },
          { id: 'live', label: 'Live', count: counts.live },
          { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
          { id: 'ended', label: 'Ended', count: counts.ended },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((m) => {
          const pct = Math.min(100, Math.round((m.minted / m.supply) * 100))
          return (
            <Link
              key={m.id}
              to={`/degen/mint/${m.slug}`}
              className="group rounded-2xl border border-edge bg-surface overflow-hidden card-hover"
            >
              <div className="relative h-32 bg-surface-2">
                <img
                  src={m.banner}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
                <div className="absolute top-2.5 left-2.5">
                  <Badge tone={statusTone[m.status]}>{statusLabel[m.status]}</Badge>
                </div>
                <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur text-white text-[11px] font-bold tabular-nums">
                  {formatPrice(m.price)} ETH
                </div>
              </div>
              <div className="px-3.5 pb-3.5 -mt-7 relative">
                <img
                  src={m.image}
                  alt=""
                  className="w-12 h-12 rounded-xl border-2 border-surface shadow object-cover"
                />
                <h3 className="mt-2 font-bold text-ink group-hover:text-hood truncate">
                  {m.name}
                </h3>
                <p className="text-xs text-ink-3 line-clamp-2 mt-0.5 min-h-[2rem]">
                  {m.description}
                </p>
                <div className="mt-3 flex justify-between text-xs text-ink-2">
                  <span>
                    {m.minted.toLocaleString()} / {m.supply.toLocaleString()}
                  </span>
                  <span>Max {m.maxPerWallet}/wallet</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      m.status === 'live' ? 'bg-hood' : 'bg-ink-3'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-ink-3 text-sm py-12">No mint pages in this filter.</p>
      )}
    </div>
  )
}
