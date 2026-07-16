import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingBag, Users } from 'lucide-react'
import type { Activity, Nft } from '../../types'
import { formatPrice, getNft, profiles, timeAgo } from '../../data/mockData'
import { buildTraitStats, rankByRarity } from '../../lib/traits'
import { Badge } from '../ui/Badge'

interface Props {
  nfts: Nft[]
  activities: Activity[]
  floorPrice: number
  volume24h: number
  volumeTotal: number
  owners: number
  itemsTotal: number
}

interface HolderRow {
  address: string
  displayName: string
  avatar?: string
  count: number
  share: number
  listed: number
  estValue: number
  topNft?: Nft
}

function resolveProfile(address: string) {
  return (
    profiles[address] || {
      address,
      displayName: address,
      avatar: undefined as string | undefined,
    }
  )
}

export function CollectionAnalytics({
  nfts,
  activities,
  floorPrice,
  volume24h,
  volumeTotal,
  owners,
  itemsTotal,
}: Props) {
  const listed = nfts.filter((n) => n.listed && n.price != null)
  const listedPct = nfts.length ? (listed.length / nfts.length) * 100 : 0
  const avgList =
    listed.length > 0
      ? listed.reduce((s, n) => s + (n.price || 0), 0) / listed.length
      : 0
  const minList = listed.length ? Math.min(...listed.map((n) => n.price!)) : 0
  const maxList = listed.length ? Math.max(...listed.map((n) => n.price!)) : 0

  const sales = activities.filter((a) => a.type === 'sale' && a.price != null)
  const saleVol = sales.reduce((s, a) => s + (a.price || 0), 0)
  const avgSale = sales.length ? saleVol / sales.length : 0

  /** Top holders by owned count in this collection */
  const topHolders = useMemo((): HolderRow[] => {
    const map = new Map<string, Nft[]>()
    for (const n of nfts) {
      const arr = map.get(n.owner) || []
      arr.push(n)
      map.set(n.owner, arr)
    }
    const total = nfts.length || 1
    return [...map.entries()]
      .map(([address, held]) => {
        const profile = resolveProfile(address)
        const listedCount = held.filter((n) => n.listed).length
        const estValue = held.reduce(
          (s, n) => s + (n.price ?? n.lastSale ?? floorPrice),
          0
        )
        const topNft = [...held].sort(
          (a, b) => (a.rarityRank ?? 999) - (b.rarityRank ?? 999)
        )[0]
        return {
          address,
          displayName: profile.displayName,
          avatar: profile.avatar,
          count: held.length,
          share: (held.length / total) * 100,
          listed: listedCount,
          estValue,
          topNft,
        }
      })
      .sort((a, b) => b.count - a.count || b.estValue - a.estValue)
      .slice(0, 10)
  }, [nfts, floorPrice])

  const maxHold = Math.max(1, ...topHolders.map((h) => h.count))

  /** Latest 3 buyers who purchased in the last 24 hours */
  const latestBuyers24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600_000
    const sales24h = activities
      .filter(
        (a) =>
          a.type === 'sale' &&
          a.to &&
          a.price != null &&
          new Date(a.timestamp).getTime() >= cutoff
      )
      .sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )

    // Latest 3 purchase events (can be different buyers)
    return sales24h.slice(0, 3).map((a) => {
      const buyer = a.to!
      const profile = resolveProfile(buyer)
      const nft = a.nftId ? getNft(a.nftId) : undefined
      return {
        address: buyer,
        displayName: profile.displayName,
        avatar: profile.avatar,
        price: a.price!,
        timestamp: a.timestamp,
        from: a.from,
        nft,
        activityId: a.id,
      }
    })
  }, [activities])

  const sales24hCount = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600_000
    return activities.filter(
      (a) =>
        a.type === 'sale' &&
        a.price != null &&
        new Date(a.timestamp).getTime() >= cutoff
    ).length
  }, [activities])

  const byType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of activities) {
      m[a.type] = (m[a.type] || 0) + 1
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [activities])

  const maxType = Math.max(1, ...byType.map(([, c]) => c))

  const traitStats = useMemo(() => buildTraitStats(nfts), [nfts])
  const topTraits = useMemo(() => {
    return traitStats
      .flatMap((s) =>
        s.values.map((v) => ({
          type: s.trait_type,
          value: v.value,
          count: v.count,
          rarity: v.rarity,
          floor: v.floor,
        }))
      )
      .sort((a, b) => a.rarity - b.rarity)
      .slice(0, 8)
  }, [traitStats])

  const rarest = useMemo(() => rankByRarity(nfts).slice(0, 5), [nfts])

  const buckets = useMemo(() => {
    if (listed.length === 0) return []
    const prices = listed.map((n) => n.price!).sort((a, b) => a - b)
    const lo = prices[0]
    const hi = prices[prices.length - 1]
    const steps = 5
    const span = Math.max(hi - lo, 0.001)
    const out: { label: string; count: number; mid: number }[] = []
    for (let i = 0; i < steps; i++) {
      const a = lo + (span * i) / steps
      const b = lo + (span * (i + 1)) / steps
      const count = prices.filter((p) =>
        i === steps - 1 ? p >= a && p <= b : p >= a && p < b
      ).length
      out.push({
        label: `${formatPrice(a)}–${formatPrice(b)}`,
        count,
        mid: (a + b) / 2,
      })
    }
    return out
  }, [listed])

  const maxBucket = Math.max(1, ...buckets.map((b) => b.count))

  const recentSales = sales.slice(0, 6)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
        {[
          { label: 'Floor', value: `${formatPrice(floorPrice)} ETH`, accent: true },
          { label: 'Listed', value: `${listed.length} (${listedPct.toFixed(0)}%)` },
          { label: 'Avg list', value: `${formatPrice(avgList)} ETH` },
          { label: '24h volume', value: `${formatPrice(volume24h)} ETH` },
          { label: 'Total volume', value: `${formatPrice(volumeTotal)} ETH` },
          { label: '24h sales', value: String(sales24hCount) },
          {
            label: 'Holders / supply',
            value: `${topHolders.length || owners} / ${itemsTotal.toLocaleString()}`,
          },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-edge bg-surface-2 px-3 py-3 relative overflow-hidden"
          >
            {k.accent && (
              <div className="absolute inset-0 bg-gradient-to-br from-hood/10 to-transparent pointer-events-none" />
            )}
            <div className="text-[10px] uppercase tracking-wide text-ink-3 relative">{k.label}</div>
            <div
              className={`text-sm font-bold mt-0.5 tabular-nums relative ${
                k.accent ? 'text-hood' : 'text-ink'
              }`}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Top holders + latest 24h buyers */}
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-edge bg-surface p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-hood" />
            <h3 className="text-sm font-bold text-ink">Top collection holders</h3>
          </div>
          <p className="text-xs text-ink-3 mb-3">
            Ranked by number of NFTs held in this collection
          </p>
          {topHolders.length === 0 ? (
            <p className="text-sm text-ink-3 py-8 text-center">No holder data yet.</p>
          ) : (
            <div className="space-y-2">
              {topHolders.map((h, i) => (
                <Link
                  key={h.address}
                  to={`/profile/${encodeURIComponent(h.address)}`}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-surface-2 transition-colors group"
                >
                  <span
                    className={`w-7 h-7 rounded-lg text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums ${
                      i < 3
                        ? 'bg-hood text-[#0b0e11]'
                        : 'bg-surface-3 text-ink-2'
                    }`}
                  >
                    {i + 1}
                  </span>
                  {h.avatar ? (
                    <img
                      src={h.avatar}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-edge"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center text-[10px] font-bold text-ink-2 shrink-0">
                      {h.displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink group-hover:text-hood truncate">
                      {h.displayName}
                    </div>
                    <div className="text-[11px] text-ink-3 font-mono truncate">{h.address}</div>
                    <div className="mt-1 h-1 rounded-full bg-surface-3 overflow-hidden max-w-[140px]">
                      <div
                        className="h-full bg-hood rounded-full"
                        style={{ width: `${(h.count / maxHold) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-ink tabular-nums">
                      {h.count}{' '}
                      <span className="text-ink-3 font-medium text-xs">NFTs</span>
                    </div>
                    <div className="text-[11px] text-ink-3 tabular-nums">
                      {h.share.toFixed(1)}% · {h.listed} listed
                    </div>
                    <div className="text-[11px] text-hood font-semibold tabular-nums">
                      ~{formatPrice(h.estValue)} ETH
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-edge bg-surface p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag className="w-4 h-4 text-hood" />
            <h3 className="text-sm font-bold text-ink">Latest buyers (24h)</h3>
          </div>
          <p className="text-xs text-ink-3 mb-3">
            Last 3 wallets that bought in this collection in the past 24 hours
          </p>
          {latestBuyers24h.length === 0 ? (
            <p className="text-sm text-ink-3 py-8 text-center">No buys in the last 24 hours.</p>
          ) : (
            <div className="space-y-3">
              {latestBuyers24h.map((b, i) => (
                <div
                  key={b.activityId}
                  className="flex items-center gap-3 rounded-xl border border-edge bg-surface-2/60 px-3 py-3"
                >
                  <span className="w-7 h-7 rounded-lg bg-hood text-[#0b0e11] text-[11px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {b.nft ? (
                    <Link to={`/nft/${b.nft.id}`} className="shrink-0">
                      <img
                        src={b.nft.image}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover ring-1 ring-edge"
                      />
                    </Link>
                  ) : b.avatar ? (
                    <img
                      src={b.avatar}
                      alt=""
                      className="w-12 h-12 rounded-xl object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-surface-3 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/profile/${encodeURIComponent(b.address)}`}
                      className="text-sm font-semibold text-ink hover:text-hood truncate block"
                    >
                      {b.displayName}
                    </Link>
                    <div className="text-[11px] text-ink-3 font-mono truncate">{b.address}</div>
                    <div className="text-[11px] text-ink-3 mt-0.5">
                      Bought {b.nft ? (
                        <Link to={`/nft/${b.nft.id}`} className="text-ink hover:text-hood">
                          {b.nft.name}
                        </Link>
                      ) : (
                        'an item'
                      )}{' '}
                      · {timeAgo(b.timestamp)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge tone="green">Buy</Badge>
                    <div className="text-sm font-bold text-hood tabular-nums mt-1">
                      {formatPrice(b.price)} ETH
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {latestBuyers24h.length > 0 && (
            <p className="text-[11px] text-ink-3 mt-3 text-center">
              {sales24hCount} sale{sales24hCount === 1 ? '' : 's'} recorded in this collection
              (24h)
            </p>
          )}
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Listing range */}
        <section className="rounded-2xl border border-edge bg-surface p-4">
          <h3 className="text-sm font-bold text-ink mb-1">Listing range</h3>
          <p className="text-xs text-ink-3 mb-4">Min / avg / max listed price in this collection</p>
          <div className="flex items-end gap-3 h-28">
            {[
              { label: 'Min', v: minList, h: 40 },
              { label: 'Avg', v: avgList, h: 70 },
              { label: 'Max', v: maxList, h: 100 },
            ].map((b) => (
              <div key={b.label} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-[11px] font-semibold text-hood tabular-nums">
                  {listed.length ? formatPrice(b.v) : '—'}
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-lg bg-hood/80 min-h-[4px]"
                    style={{ height: listed.length ? `${b.h}%` : '4px' }}
                  />
                </div>
                <span className="text-[10px] text-ink-3 uppercase">{b.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Price distribution */}
        <section className="rounded-2xl border border-edge bg-surface p-4">
          <h3 className="text-sm font-bold text-ink mb-1">Price distribution</h3>
          <p className="text-xs text-ink-3 mb-4">How listed items cluster by price</p>
          {buckets.length === 0 ? (
            <p className="text-sm text-ink-3 py-8 text-center">No listings to chart.</p>
          ) : (
            <div className="flex items-end gap-1.5 h-28">
              {buckets.map((b) => (
                <div key={b.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-[10px] text-ink-2 tabular-nums">{b.count || ''}</span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-hood to-hood/50"
                      style={{ height: `${Math.max(6, (b.count / maxBucket) * 100)}%` }}
                      title={b.label}
                    />
                  </div>
                  <span className="text-[9px] text-ink-3 truncate w-full text-center" title={b.label}>
                    {formatPrice(b.mid)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Activity breakdown */}
        <section className="rounded-2xl border border-edge bg-surface p-4">
          <h3 className="text-sm font-bold text-ink mb-1">Collection activity mix</h3>
          <p className="text-xs text-ink-3 mb-4">Events for this collection only</p>
          {byType.length === 0 ? (
            <p className="text-sm text-ink-3 py-6 text-center">No activity yet.</p>
          ) : (
            <div className="space-y-2.5">
              {byType.map(([type, count]) => (
                <div key={type}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="capitalize text-ink-2 font-medium">
                      {type.replace('_', ' ')}
                    </span>
                    <span className="tabular-nums text-ink font-semibold">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className="h-full bg-hood rounded-full"
                      style={{ width: `${(count / maxType) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-edge grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-ink-3">Recorded sales</div>
              <div className="font-bold text-ink">{sales.length}</div>
            </div>
            <div>
              <div className="text-ink-3">Avg sale</div>
              <div className="font-bold text-hood tabular-nums">
                {sales.length ? `${formatPrice(avgSale)} ETH` : '—'}
              </div>
            </div>
          </div>
        </section>

        {/* Rarest traits */}
        <section className="rounded-2xl border border-edge bg-surface p-4">
          <h3 className="text-sm font-bold text-ink mb-1">Rarest traits</h3>
          <p className="text-xs text-ink-3 mb-3">Lowest frequency in this collection</p>
          <div className="space-y-1.5">
            {topTraits.map((t) => (
              <div
                key={`${t.type}-${t.value}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-2 text-sm"
              >
                <Badge tone={t.rarity < 15 ? 'green' : 'muted'}>{t.rarity.toFixed(1)}%</Badge>
                <span className="text-ink-3 text-xs w-20 truncate">{t.type}</span>
                <span className="flex-1 font-medium text-ink truncate">{t.value}</span>
                <span className="text-xs text-hood font-semibold tabular-nums">
                  {t.floor != null ? `${formatPrice(t.floor)}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Top rarity NFTs + recent sales */}
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-edge bg-surface p-4">
          <h3 className="text-sm font-bold text-ink mb-3">Top rarity (this collection)</h3>
          <div className="space-y-2">
            {rarest.map((r) => (
              <div key={r.nft.id} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-hood text-[#0b0e11] text-xs font-bold flex items-center justify-center">
                  {r.rarityRank}
                </span>
                <img src={r.nft.image} alt="" className="w-9 h-9 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{r.nft.name}</div>
                  <div className="text-[11px] text-ink-3">score {r.rarityScore.toFixed(2)}</div>
                </div>
                <div className="text-sm font-semibold text-hood tabular-nums">
                  {r.nft.listed && r.nft.price != null
                    ? `${formatPrice(r.nft.price)} ETH`
                    : '—'}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-edge bg-surface p-4">
          <h3 className="text-sm font-bold text-ink mb-3">Recent collection sales</h3>
          {recentSales.length === 0 ? (
            <p className="text-sm text-ink-3 py-6 text-center">No sales recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {recentSales.map((a) => {
                const buyer = a.to
                const profile = buyer ? resolveProfile(buyer) : null
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg hover:bg-surface-2 gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-ink font-medium truncate">
                        {profile ? profile.displayName : a.from}
                      </div>
                      <div className="text-[11px] text-ink-3">
                        {buyer ? `bought · ${timeAgo(a.timestamp)}` : timeAgo(a.timestamp)}
                      </div>
                    </div>
                    <span className="font-bold text-hood tabular-nums shrink-0">
                      {formatPrice(a.price)} ETH
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
