import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Crown, Layers } from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { buildTraitStats, rankByRarity, type TraitLeaderboardRow } from '../lib/traits'
import { formatPrice } from '../data/mockData'
import { Tabs } from '../components/ui/Tabs'
import { Badge } from '../components/ui/Badge'
import { NftCard } from '../components/nft/NftCard'
import clsx from 'clsx'

export function RankingsPage() {
  const { collections, nfts } = useMarketplace()
  const [params] = useSearchParams()
  const [tab, setTab] = useState('rarity')
  const [collectionId, setCollectionId] = useState(collections[0]?.id || '')

  useEffect(() => {
    const slug = params.get('collection')
    if (!slug) return
    const c = collections.find((x) => x.slug === slug || x.id === slug)
    if (c) setCollectionId(c.id)
  }, [params, collections])

  const collectionNfts = useMemo(
    () => nfts.filter((n) => n.collectionId === collectionId),
    [nfts, collectionId]
  )

  const rarityBoard = useMemo(() => rankByRarity(collectionNfts).slice(0, 24), [collectionNfts])

  const traitBoard = useMemo(() => {
    const rows: TraitLeaderboardRow[] = []
    for (const col of collections) {
      const group = nfts.filter((n) => n.collectionId === col.id)
      const stats = buildTraitStats(group)
      for (const st of stats) {
        for (const v of st.values) {
          // Higher score = rarer trait (low % ) with optional floor weight
          const rarityWeight = 100 / Math.max(v.rarity, 0.5)
          const floorWeight = v.floor != null ? Math.log10(v.floor * 1000 + 1) : 0
          rows.push({
            collectionId: col.id,
            trait_type: st.trait_type,
            value: v.value,
            count: v.count,
            rarity: v.rarity,
            floor: v.floor,
            score: rarityWeight + floorWeight,
          })
        }
      }
    }
    rows.sort((a, b) => b.score - a.score)
    return rows.slice(0, 40)
  }, [collections, nfts])

  const traitFloors = useMemo(() => {
    const stats = buildTraitStats(collectionNfts)
    return stats
      .flatMap((s) =>
        s.values
          .filter((v) => v.floor != null)
          .map((v) => ({
            trait_type: s.trait_type,
            value: v.value,
            count: v.count,
            rarity: v.rarity,
            floor: v.floor!,
          }))
      )
      .sort((a, b) => b.floor - a.floor)
  }, [collectionNfts])

  const activeCol = collections.find((c) => c.id === collectionId)

  return (
    <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 py-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 text-hood text-xs font-bold uppercase tracking-wide mb-1">
            <Crown className="w-3.5 h-3.5" />
            Trait rankings
          </div>
          <h1 className="text-2xl font-bold text-ink">Rankings</h1>
          <p className="text-sm text-ink-2 mt-0.5">
            Rarity ranks and trait floors powered by trait frequency across OpenHood.
          </p>
        </div>
        {(tab === 'rarity' || tab === 'floors') && (
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
            className="h-10 px-3 rounded-xl bg-surface-2 border border-edge text-sm text-ink min-w-[200px]"
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <Tabs
        tabs={[
          { id: 'rarity', label: 'Rarity rank', count: rarityBoard.length },
          { id: 'traits', label: 'Trait leaderboard', count: traitBoard.length },
          { id: 'floors', label: 'Trait floors', count: traitFloors.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'rarity' && (
        <div className="mt-5">
          <p className="text-sm text-ink-3 mb-3">
            {activeCol?.name} · ranked by statistical trait rarity (1 = rarest)
          </p>
          <div className="rounded-2xl border border-edge overflow-hidden mb-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3 bg-surface-2 border-b border-edge">
                    <th className="px-3 py-2.5 font-semibold w-14">Rank</th>
                    <th className="px-3 py-2.5 font-semibold">NFT</th>
                    <th className="px-3 py-2.5 font-semibold">Traits</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Score</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {rarityBoard.map((row) => (
                    <tr
                      key={row.nft.id}
                      className="border-b border-edge last:border-0 hover:bg-surface-2/70"
                    >
                      <td className="px-3 py-2.5">
                        <span
                          className={clsx(
                            'inline-flex w-8 h-8 items-center justify-center rounded-lg text-xs font-bold tabular-nums',
                            row.rarityRank <= 3
                              ? 'bg-hood text-[#0b0e11]'
                              : 'bg-surface-3 text-ink'
                          )}
                        >
                          {row.rarityRank}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          to={`/nft/${row.nft.id}`}
                          className="flex items-center gap-2.5 group min-w-0"
                        >
                          <img
                            src={row.nft.image}
                            alt=""
                            className="w-9 h-9 rounded-lg object-cover"
                          />
                          <span className="font-medium text-ink group-hover:text-hood truncate">
                            {row.nft.name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {row.nft.traits.slice(0, 4).map((t) => (
                            <span
                              key={t.trait_type}
                              className="px-1.5 py-0.5 rounded bg-surface-2 text-[10px] text-ink-2"
                              title={t.trait_type}
                            >
                              {t.value}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-ink">
                        {row.rarityScore.toFixed(3)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {row.nft.listed && row.nft.price != null ? (
                          <span className="text-hood font-semibold">
                            {formatPrice(row.nft.price)} ETH
                          </span>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {rarityBoard.slice(0, 6).map((row) => (
              <div key={row.nft.id} className="relative">
                <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-hood text-[#0b0e11] text-[10px] font-bold">
                  #{row.rarityRank}
                </div>
                <NftCard nft={row.nft} showCollection={false} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'traits' && (
        <div className="mt-5 rounded-2xl border border-edge overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3 bg-surface-2 border-b border-edge">
                  <th className="px-3 py-2.5 font-semibold w-12">#</th>
                  <th className="px-3 py-2.5 font-semibold">Collection</th>
                  <th className="px-3 py-2.5 font-semibold">Trait</th>
                  <th className="px-3 py-2.5 font-semibold">Value</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Count</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Rarity</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Floor</th>
                </tr>
              </thead>
              <tbody>
                {traitBoard.map((row, i) => {
                  const col = collections.find((c) => c.id === row.collectionId)
                  return (
                    <tr
                      key={`${row.collectionId}-${row.trait_type}-${row.value}`}
                      className="border-b border-edge last:border-0 hover:bg-surface-2/70"
                    >
                      <td className="px-3 py-2.5 text-ink-3 tabular-nums font-medium">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        {col && (
                          <Link
                            to={`/collection/${col.slug}`}
                            className="flex items-center gap-2 group"
                          >
                            <img
                              src={col.image}
                              alt=""
                              className="w-8 h-8 rounded-md object-cover"
                            />
                            <span className="font-medium text-ink group-hover:text-hood flex items-center gap-1">
                              {col.name}
                              {col.verified && (
                                <BadgeCheck className="w-3.5 h-3.5 text-hood" />
                              )}
                            </span>
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{row.trait_type}</td>
                      <td className="px-3 py-2.5">
                        <Link
                          to={`/collection/${col?.slug}?trait=${encodeURIComponent(row.trait_type)}&value=${encodeURIComponent(row.value)}`}
                          className="font-semibold text-ink hover:text-hood"
                        >
                          {row.value}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">
                        {row.count}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Badge tone={row.rarity < 15 ? 'green' : 'muted'}>
                          {row.rarity.toFixed(1)}%
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-hood">
                        {row.floor != null ? `${formatPrice(row.floor)} ETH` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'floors' && (
        <div className="mt-5">
          <p className="text-sm text-ink-3 mb-3 flex items-center gap-1.5">
            <Layers className="w-4 h-4" />
            Trait floors for {activeCol?.name} — lowest listed price per trait value
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {traitFloors.map((t) => (
              <Link
                key={`${t.trait_type}-${t.value}`}
                to={`/collection/${activeCol?.slug}?trait=${encodeURIComponent(t.trait_type)}&value=${encodeURIComponent(t.value)}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-surface px-3.5 py-3 hover:border-hood/50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-ink-3">
                    {t.trait_type}
                  </div>
                  <div className="font-semibold text-ink truncate">{t.value}</div>
                  <div className="text-xs text-ink-3 mt-0.5">
                    {t.count} items · {t.rarity.toFixed(1)}%
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-ink-3">Floor</div>
                  <div className="font-bold text-hood tabular-nums">
                    {formatPrice(t.floor)} ETH
                  </div>
                </div>
              </Link>
            ))}
            {traitFloors.length === 0 && (
              <p className="col-span-full text-sm text-ink-3 text-center py-8">
                No listed trait floors in this collection.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
