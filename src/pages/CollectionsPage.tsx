import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { formatPrice } from '../data/mockData'
import { RiskBadge } from '../components/nft/RiskBadge'
import clsx from 'clsx'
import type { CollectionRisk } from '../types'

type SortKey = 'volume24h' | 'volumeTotal' | 'floorPrice' | 'items' | 'name'
type SortDir = 'desc' | 'asc'

export function CollectionsPage() {
  const { collections, verifiedMinVolumeEth } = useMarketplace()
  const [params] = useSearchParams()
  const [sortKey, setSortKey] = useState<SortKey>('volume24h')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [q, setQ] = useState(() => params.get('q') || '')
  const [risk, setRisk] = useState<'all' | CollectionRisk>('all')

  const sorted = useMemo(() => {
    let list = [...collections]
    if (risk !== 'all') list = list.filter((c) => c.risk === risk)
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(s) ||
          c.slug.includes(s) ||
          c.description.toLowerCase().includes(s)
      )
    }
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else cmp = (a[sortKey] as number) - (b[sortKey] as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [collections, sortKey, sortDir, q, risk])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null
    return sortDir === 'desc' ? (
      <ChevronDown className="w-3.5 h-3.5 inline ml-0.5" />
    ) : (
      <ChevronUp className="w-3.5 h-3.5 inline ml-0.5" />
    )
  }

  return (
    <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Collections</h1>
          <p className="text-sm text-ink-2 mt-0.5">
            Verified = OpenSea + ≥{verifiedMinVolumeEth} ETH total volume. Others marked high
            risk or trash by the indexer.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter collections…"
          className="h-10 w-full sm:w-64 px-3 rounded-xl bg-surface-2 border border-edge text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-hood"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {(['all', 'verified', 'high_risk', 'trash', 'demo'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRisk(r)}
            className={clsx(
              'px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors',
              risk === r
                ? 'bg-hood text-[#0b0e11]'
                : 'border border-edge bg-surface-2 text-ink-3 hover:text-ink'
            )}
          >
            {r === 'all' ? 'All' : r.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {sorted.map((c, i) => (
          <Link
            key={c.id}
            to={`/collection/${c.slug}`}
            className="flex items-center gap-3 p-3 rounded-2xl border border-edge bg-surface hover:border-hood/40 active:bg-surface-2 transition-colors"
          >
            <span className="text-xs text-ink-3 tabular-nums w-5 shrink-0">{i + 1}</span>
            <img
              src={c.image}
              alt=""
              className="w-11 h-11 rounded-xl object-cover shrink-0 ring-1 ring-edge"
            />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink truncate flex items-center gap-1 text-sm">
                {c.name}
                <RiskBadge risk={c.risk} compact className="!text-[9px] !px-1.5" />
              </div>
              <div className="text-[11px] text-ink-3 mt-0.5 tabular-nums">
                Floor{' '}
                <span className="text-hood font-semibold">{formatPrice(c.floorPrice)}</span>
                <span className="mx-1.5 text-edge">·</span>
                24h{' '}
                <span className="text-ink font-semibold">{formatPrice(c.volume24h)}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-ink-3">Items</div>
              <div className="text-xs font-bold tabular-nums text-ink">
                {c.items.toLocaleString()}
              </div>
            </div>
          </Link>
        ))}
        {sorted.length === 0 && (
          <p className="py-10 text-center text-ink-3 text-sm">No collections match your filter.</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-2xl border border-edge overflow-hidden bg-surface">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-edge bg-surface-2 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">
                <th className="px-3 py-3 w-10">#</th>
                <th className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="hover:text-ink cursor-pointer"
                  >
                    Collection
                    <SortIcon k="name" />
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('floorPrice')}
                    className="hover:text-ink cursor-pointer"
                  >
                    Floor
                    <SortIcon k="floorPrice" />
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('volume24h')}
                    className={clsx(
                      'cursor-pointer',
                      sortKey === 'volume24h' ? 'text-hood' : 'hover:text-ink'
                    )}
                  >
                    24h volume
                    <SortIcon k="volume24h" />
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('volumeTotal')}
                    className={clsx(
                      'cursor-pointer',
                      sortKey === 'volumeTotal' ? 'text-hood' : 'hover:text-ink'
                    )}
                  >
                    Total volume
                    <SortIcon k="volumeTotal" />
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('items')}
                    className="hover:text-ink cursor-pointer"
                  >
                    Items
                    <SortIcon k="items" />
                  </button>
                </th>
                <th className="px-3 py-3 text-right">Owners</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => (
                <tr
                  key={c.id}
                  className="border-b border-edge last:border-0 hover:bg-surface-2/70 transition-colors"
                >
                  <td className="px-3 py-3 text-ink-3 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-3">
                    <Link
                      to={`/collection/${c.slug}`}
                      className="flex items-center gap-3 group min-w-0"
                    >
                      <img
                        src={c.image}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                      <span className="font-medium text-ink group-hover:text-hood truncate flex items-center gap-1.5">
                        {c.name}
                        <RiskBadge risk={c.risk} compact />
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink font-medium">
                    {formatPrice(c.floorPrice)}{' '}
                    <span className="text-hood text-xs">ETH</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink font-semibold">
                    {formatPrice(c.volume24h)}{' '}
                    <span className="text-ink-3 text-xs">ETH</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-2">
                    {formatPrice(c.volumeTotal)}{' '}
                    <span className="text-ink-3 text-xs">ETH</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-2">
                    {c.items.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-2">
                    {c.owners.toLocaleString()}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-ink-3">
                    No collections match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
