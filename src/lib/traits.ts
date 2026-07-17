import type { Nft } from '../types'

export type TraitFilterMap = Record<string, string[]> // trait_type -> selected values

export interface TraitValueStat {
  value: string
  count: number
  /** percent of collection (0–100) */
  rarity: number
  /** lowest listed price among NFTs with this trait, if any */
  floor?: number
}

export interface TraitTypeStat {
  trait_type: string
  values: TraitValueStat[]
  totalWithTrait: number
}

export interface RankedNft {
  nft: Nft
  rarityScore: number
  rarityRank: number
  /** 0–100, higher = rarer */
  percentile: number
}

/** Lite Fly payloads may omit traits — never assume array. */
export function safeTraits(
  nft: Pick<Nft, 'traits'> | null | undefined
): { trait_type: string; value: string }[] {
  const t = nft?.traits
  return Array.isArray(t) ? t : []
}

/** Build trait type → value stats for a collection of NFTs */
export function buildTraitStats(nfts: Nft[]): TraitTypeStat[] {
  const total = nfts.length || 1
  const map = new Map<string, Map<string, { count: number; floors: number[] }>>()

  for (const nft of nfts) {
    for (const t of safeTraits(nft)) {
      if (t?.trait_type == null || t?.value == null) continue
      if (!map.has(t.trait_type)) map.set(t.trait_type, new Map())
      const vals = map.get(t.trait_type)!
      const cur = vals.get(String(t.value)) || { count: 0, floors: [] }
      cur.count++
      if (nft.listed && nft.price != null) cur.floors.push(nft.price)
      vals.set(String(t.value), cur)
    }
  }

  const result: TraitTypeStat[] = []
  for (const [trait_type, vals] of map) {
    const values: TraitValueStat[] = [...vals.entries()]
      .map(([value, { count, floors }]) => ({
        value,
        count,
        rarity: (count / total) * 100,
        floor: floors.length ? Math.min(...floors) : undefined,
      }))
      .sort((a, b) => a.count - b.count) // rarest first

    result.push({
      trait_type,
      values,
      totalWithTrait: values.reduce((s, v) => s + v.count, 0),
    })
  }

  result.sort((a, b) => a.trait_type.localeCompare(b.trait_type))
  return result
}

/** Statistical rarity score: sum of 1 / count(trait value) across traits */
export function rarityScore(nft: Nft, allInCollection: Nft[]): number {
  const counts = countTraitValues(allInCollection)
  let score = 0
  for (const t of safeTraits(nft)) {
    const c = counts.get(`${t.trait_type}::${t.value}`) || 1
    score += 1 / c
  }
  return score
}

function countTraitValues(nfts: Nft[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const n of nfts) {
    for (const t of safeTraits(n)) {
      const k = `${t.trait_type}::${t.value}`
      m.set(k, (m.get(k) || 0) + 1)
    }
  }
  return m
}

/** Rank all NFTs in a collection by rarity (1 = rarest) */
export function rankByRarity(nfts: Nft[]): RankedNft[] {
  const scored = nfts.map((nft) => ({
    nft,
    rarityScore: rarityScore(nft, nfts),
  }))
  scored.sort((a, b) => b.rarityScore - a.rarityScore || a.nft.tokenId - b.nft.tokenId)
  const n = scored.length || 1
  return scored.map((s, i) => ({
    ...s,
    rarityRank: i + 1,
    percentile: ((n - i) / n) * 100,
  }))
}

/** Apply trait filters (AND across types, OR within type values) */
export function filterByTraits(nfts: Nft[], filters: TraitFilterMap): Nft[] {
  const entries = Object.entries(filters).filter(([, vals]) => vals.length > 0)
  if (entries.length === 0) return nfts
  return nfts.filter((nft) =>
    entries.every(([type, values]) =>
      safeTraits(nft).some((t) => t.trait_type === type && values.includes(t.value))
    )
  )
}

export function activeFilterCount(filters: TraitFilterMap): number {
  return Object.values(filters).reduce((s, v) => s + v.length, 0)
}

export function toggleTraitFilter(
  filters: TraitFilterMap,
  trait_type: string,
  value: string
): TraitFilterMap {
  const current = filters[trait_type] || []
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value]
  const copy = { ...filters }
  if (next.length === 0) delete copy[trait_type]
  else copy[trait_type] = next
  return copy
}

/** Global marketplace trait leaderboard rows */
export interface TraitLeaderboardRow {
  collectionId: string
  trait_type: string
  value: string
  count: number
  rarity: number
  floor?: number
  /** rarity weight for ranking (rarer + higher floor = hotter) */
  score: number
}
