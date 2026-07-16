/**
 * OpenSea API — live Robinhood Chain data.
 * Docs: https://docs.opensea.io/reference/api-overview
 *
 * Browser requests need an API key (Origin header triggers auth).
 * Local dev uses Vite proxy `/opensea-api` so stats work without a key.
 * Set VITE_OPENSEA_API_KEY for production (GitHub secret → build env).
 */

import type { Activity, Collection, Nft, OpenSeaIntervals } from '../types'
import snapshot from '../data/opensea-robinhood-snapshot.json'

const OPENSEA_HOST = 'https://api.opensea.io/api/v2'

export interface OpenSeaCollectionPayload {
  collection: string
  name: string
  description?: string
  image_url?: string
  banner_image_url?: string
  owner?: string
  safelist_status?: string
  category?: string
  opensea_url?: string
  project_url?: string
  discord_url?: string
  twitter_username?: string
  contracts?: { address: string; chain: string }[]
  total_supply?: number
  unique_item_count?: number
}

export interface OpenSeaStatsPayload {
  total?: {
    volume?: number
    sales?: number
    num_owners?: number
    floor_price?: number
    floor_price_symbol?: string
  }
  intervals?: {
    interval: string
    volume?: number
    sales?: number
  }[]
  errors?: string[]
}

export interface OpenSeaSnapshotRow {
  slug: string
  collection: OpenSeaCollectionPayload
  stats: OpenSeaStatsPayload
}

export interface OpenSeaEventItem {
  event_type?: string
  event_timestamp?: number | string
  order_hash?: string
  chain?: string
  protocol_data?: unknown
  payment?: { quantity?: string; token?: { symbol?: string; decimals?: number } }
  nft?: {
    identifier?: string
    collection?: string
    contract?: string
    name?: string
    image_url?: string
    display_image_url?: string
  }
  from_address?: string
  to_address?: string
  seller?: string
  buyer?: string
  quantity?: number
  /** v2 shape variants */
  asset?: { name?: string; image_url?: string; token_id?: string }
  payment_token?: { symbol?: string; decimals?: number; eth_price?: string }
  total_price?: string
}

function apiKey(): string | undefined {
  const k = import.meta.env.VITE_OPENSEA_API_KEY as string | undefined
  return k?.trim() || undefined
}

/**
 * Base URL for OpenSea v2.
 * - Dev: Vite proxy (no browser Origin → keyless stats work)
 * - Prod: optional VITE_OPENSEA_PROXY, else official host (needs key)
 */
export function openSeaBaseUrl(): string {
  const proxy = (import.meta.env.VITE_OPENSEA_PROXY as string | undefined)?.trim()
  if (proxy) return proxy.replace(/\/$/, '')
  if (import.meta.env.DEV) return '/opensea-api'
  return OPENSEA_HOST
}

export function hasOpenSeaApiKey(): boolean {
  return Boolean(apiKey())
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/json' }
  const key = apiKey()
  if (key) h['X-API-KEY'] = key
  return h
}

async function openSeaGet<T>(path: string): Promise<T | null> {
  try {
    const url = `${openSeaBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
    const res = await fetch(url, { headers: headers(), cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as T & { errors?: string[] }
    if (data && typeof data === 'object' && 'errors' in data && data.errors?.length) {
      return null
    }
    return data as T
  } catch {
    return null
  }
}

function shortAddr(addr?: string): string {
  if (!addr) return '0xOpenSea…0000'
  if (addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function intervalMap(stats: OpenSeaStatsPayload): OpenSeaIntervals {
  const find = (name: string) => stats.intervals?.find((i) => i.interval === name)
  const d1 = find('one_day')
  const d7 = find('seven_day')
  const d30 = find('thirty_day')
  return {
    volume1d: d1?.volume ?? 0,
    sales1d: d1?.sales ?? 0,
    volume7d: d7?.volume ?? 0,
    sales7d: d7?.sales ?? 0,
    volume30d: d30?.volume ?? 0,
    sales30d: d30?.sales ?? 0,
    volumeTotal: stats.total?.volume ?? 0,
    salesTotal: stats.total?.sales ?? 0,
  }
}

/** Map OpenSea collection + stats → OpenHood Collection */
export function mapOpenSeaToCollection(
  row: OpenSeaSnapshotRow,
  idPrefix = 'os'
): Collection {
  const c = row.collection
  const s = row.stats
  const intervals = intervalMap(s)
  const contract = c.contracts?.[0]
  const floor = s.total?.floor_price ?? 0
  const image =
    c.image_url || `https://opensea.io/static/images/placeholder.png`
  const banner = c.banner_image_url || image

  return {
    id: `${idPrefix}-${row.slug}`,
    name: c.name,
    slug: row.slug || c.collection,
    description:
      c.description ||
      `${c.name} on Robinhood Chain — live stats from OpenSea.`,
    image,
    banner,
    floorPrice: +Number(floor).toPrecision(6),
    volume24h: +Number(intervals.volume1d).toPrecision(6),
    volumeTotal: +Number(intervals.volumeTotal).toPrecision(6),
    items: c.total_supply || c.unique_item_count || 0,
    owners: s.total?.num_owners ?? 0,
    founder: shortAddr(c.owner),
    website: c.project_url || undefined,
    twitter: c.twitter_username || undefined,
    discord: c.discord_url || undefined,
    verified:
      c.safelist_status === 'verified' || c.safelist_status === 'approved',
    openseaUrl: c.opensea_url || `https://opensea.io/collection/${row.slug}`,
    chain: contract?.chain || 'robinhood',
    contractAddress: contract?.address,
    salesTotal: s.total?.sales,
    category: c.category,
    intervals,
    source: 'opensea',
  }
}

/** Slugs we track on Robinhood Chain (from snapshot catalog) */
export function robinhoodOpenSeaSlugs(): string[] {
  return (snapshot as OpenSeaSnapshotRow[])
    .map((r) => r.slug)
    .filter(Boolean)
}

/** Collections built from the committed OpenSea snapshot (fallback) */
export function collectionsFromOpenSeaSnapshot(): Collection[] {
  const rows = snapshot as OpenSeaSnapshotRow[]
  return rows
    .filter((r) => r.stats?.total && r.collection?.name)
    .map((r, i) => mapOpenSeaToCollection(r, `os${i + 1}`))
    .sort((a, b) => b.volume24h - a.volume24h)
}

export async function fetchOpenSeaCollectionStats(
  slug: string
): Promise<OpenSeaStatsPayload | null> {
  return openSeaGet<OpenSeaStatsPayload>(`/collections/${encodeURIComponent(slug)}/stats`)
}

export async function fetchOpenSeaCollection(
  slug: string
): Promise<OpenSeaCollectionPayload | null> {
  return openSeaGet<OpenSeaCollectionPayload>(
    `/collections/${encodeURIComponent(slug)}`
  )
}

/** List collections on Robinhood (requires API key) */
export async function fetchRobinhoodCollections(
  limit = 50
): Promise<OpenSeaCollectionPayload[]> {
  const data = await openSeaGet<{ collections?: OpenSeaCollectionPayload[] }>(
    `/collections?chain=robinhood&limit=${limit}&order_by=seven_day_volume`
  )
  return data?.collections ?? []
}

export async function fetchCollectionEvents(
  slug: string,
  limit = 20
): Promise<OpenSeaEventItem[]> {
  // Prefer v2 collection events (needs key)
  const data = await openSeaGet<{ asset_events?: OpenSeaEventItem[] }>(
    `/events/collection/${encodeURIComponent(slug)}?limit=${limit}`
  )
  return data?.asset_events ?? []
}

/** Live refresh one collection's stats into our shape */
export async function refreshCollectionFromOpenSea(
  slug: string
): Promise<Partial<Collection> | null> {
  const [col, stats] = await Promise.all([
    fetchOpenSeaCollection(slug),
    fetchOpenSeaCollectionStats(slug),
  ])
  if (!stats?.total) {
    // stats-only still useful
    if (!col && !stats?.total) return null
  }
  if (!col && stats?.total) {
    const intervals = intervalMap(stats)
    return {
      floorPrice: +Number(stats.total.floor_price ?? 0).toPrecision(6),
      volume24h: +Number(intervals.volume1d).toPrecision(6),
      volumeTotal: +Number(intervals.volumeTotal).toPrecision(6),
      owners: stats.total.num_owners ?? 0,
      salesTotal: stats.total.sales,
      intervals,
      source: 'opensea',
    }
  }
  if (!col || !stats?.total) return null
  const mapped = mapOpenSeaToCollection({ slug, collection: col, stats })
  return {
    floorPrice: mapped.floorPrice,
    volume24h: mapped.volume24h,
    volumeTotal: mapped.volumeTotal,
    owners: mapped.owners,
    items: mapped.items,
    salesTotal: mapped.salesTotal,
    intervals: mapped.intervals,
    image: mapped.image,
    banner: mapped.banner,
    description: mapped.description,
    verified: mapped.verified,
    openseaUrl: mapped.openseaUrl,
    name: mapped.name,
    source: 'opensea',
  }
}

/**
 * Refresh stats for many slugs (parallel, concurrency-limited).
 * Returns map slug → partial Collection stats.
 */
export async function refreshManyOpenSeaStats(
  slugs: string[],
  concurrency = 4
): Promise<Map<string, Partial<Collection>>> {
  const out = new Map<string, Partial<Collection>>()
  let i = 0
  async function worker() {
    while (i < slugs.length) {
      const idx = i++
      const slug = slugs[idx]
      const patch = await refreshCollectionFromOpenSea(slug)
      if (patch) out.set(slug, patch)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, slugs.length) }, () => worker())
  )
  return out
}

/** Map OpenSea events → OpenHood activity rows */
export function mapOpenSeaEventsToActivities(
  slug: string,
  collectionId: string,
  events: OpenSeaEventItem[]
): Activity[] {
  const acts: Activity[] = []
  for (const e of events) {
    const typeRaw = (e.event_type || '').toLowerCase()
    let type: Activity['type'] = 'transfer'
    if (typeRaw.includes('sale') || typeRaw === 'order' || typeRaw === 'successful')
      type = 'sale'
    else if (typeRaw.includes('list') || typeRaw === 'created') type = 'listing'
    else if (typeRaw.includes('offer') || typeRaw.includes('bid')) type = 'offer'
    else if (typeRaw.includes('transfer')) type = 'transfer'
    else if (typeRaw.includes('mint')) type = 'mint'

    const tokenId =
      e.nft?.identifier || e.asset?.token_id || undefined
    const ts =
      typeof e.event_timestamp === 'number'
        ? new Date(e.event_timestamp * 1000).toISOString()
        : e.event_timestamp
          ? new Date(e.event_timestamp).toISOString()
          : new Date().toISOString()

    let price: number | undefined
    if (e.payment?.quantity) {
      const dec = e.payment.token?.decimals ?? 18
      price = Number(e.payment.quantity) / 10 ** dec
    } else if (e.total_price) {
      const dec = e.payment_token?.decimals ?? 18
      price = Number(e.total_price) / 10 ** dec
    }

    acts.push({
      id: `os-${slug}-${e.order_hash || tokenId || Math.random()}-${ts}`,
      type,
      collectionId,
      nftId: tokenId ? `${collectionId}-os-${tokenId}` : undefined,
      from: shortAddr(e.from_address || e.seller || e.buyer),
      to: e.to_address || e.buyer ? shortAddr(e.to_address || e.buyer) : undefined,
      price: price != null && Number.isFinite(price) ? +price.toPrecision(6) : undefined,
      timestamp: ts,
    })
  }
  return acts
}

/**
 * Apply live OpenSea patches onto seed collections (by slug).
 * Preserves ids / local fields.
 */
export function mergeOpenSeaPatches(
  base: Collection[],
  patches: Map<string, Partial<Collection>>
): Collection[] {
  return base.map((c) => {
    if (c.source !== 'opensea') return c
    const p = patches.get(c.slug)
    if (!p) return c
    return { ...c, ...p, id: c.id, slug: c.slug, source: 'opensea' as const }
  })
}

/** Build lightweight "listed" NFT cards from floor when we only have stats */
export function syntheticFloorNfts(
  col: Collection,
  count = 8
): Nft[] {
  if (col.source !== 'opensea' || !col.floorPrice) return []
  const list: Nft[] = []
  for (let i = 1; i <= count; i++) {
    list.push({
      id: `${col.id}-live-${i}`,
      tokenId: i,
      name: `${col.name} #${i}`,
      collectionId: col.id,
      image:
        i <= 2
          ? col.image
          : `https://api.dicebear.com/7.x/shapes/svg?seed=${col.slug}-${i}&backgroundColor=0b0e11,00c805`,
      owner: shortAddr(col.contractAddress || col.founder),
      listed: true,
      price: +(col.floorPrice * (0.98 + (i % 5) * 0.01)).toPrecision(6),
      traits: [
        { trait_type: 'Source', value: 'OpenSea live' },
        { trait_type: 'Chain', value: col.chain || 'robinhood' },
      ],
    })
  }
  return list
}

// ─── Live collection NFTs (full catalog, paginated) ─────────────────────────

export interface OpenSeaNftPayload {
  identifier?: string
  collection?: string
  contract?: string
  token_standard?: string
  name?: string
  description?: string
  image_url?: string
  display_image_url?: string
  display_animation_url?: string
  metadata_url?: string
  opensea_url?: string
  updated_at?: string
  is_disabled?: boolean
  is_nsfw?: boolean
  owners?: { address?: string; quantity?: number }[]
  traits?: { trait_type?: string; value?: string | number }[]
  rarity?: { rank?: number }
}

export interface OpenSeaNftsPage {
  nfts: OpenSeaNftPayload[]
  next: string | null
}

export interface OpenSeaListingRow {
  order_hash?: string
  chain?: string
  price?: { current?: { currency?: string; decimals?: number; value?: string } }
  asset?: { identifier?: string; contract?: string }
  protocol_data?: {
    parameters?: {
      offer?: { token?: string; identifierOrCriteria?: string }[]
    }
  }
}

/** In-memory cache so detail pages can resolve live OpenSea NFTs */
const nftCache = new Map<string, Nft>()

export function cacheOpenSeaNfts(list: Nft[]) {
  for (const n of list) nftCache.set(n.id, n)
}

export function getCachedOpenSeaNft(id: string): Nft | undefined {
  return nftCache.get(id)
}

export function openSeaNftId(collectionId: string, tokenId: string | number): string {
  return `${collectionId}-os-${tokenId}`
}

export function mapOpenSeaNftToNft(
  raw: OpenSeaNftPayload,
  collectionId: string,
  priceByToken?: Map<string, number>
): Nft | null {
  const tokenIdStr = raw.identifier
  if (tokenIdStr == null || tokenIdStr === '') return null
  const tokenId = Number(tokenIdStr)
  if (!Number.isFinite(tokenId)) return null

  const owner =
    raw.owners?.[0]?.address?.toLowerCase() ||
    shortAddr(raw.owners?.[0]?.address) ||
    'unknown'
  const price = priceByToken?.get(tokenIdStr)
  const image =
    raw.image_url ||
    raw.display_image_url ||
    `https://api.dicebear.com/7.x/shapes/svg?seed=${collectionId}-${tokenIdStr}`

  const traits = (raw.traits || [])
    .filter((t) => t.trait_type != null && t.value != null && t.value !== '')
    .map((t) => ({
      trait_type: String(t.trait_type),
      value: String(t.value),
    }))

  return {
    id: openSeaNftId(collectionId, tokenIdStr),
    tokenId: Number.isSafeInteger(tokenId) ? tokenId : parseInt(tokenIdStr, 10) || 0,
    name: raw.name || `#${tokenIdStr}`,
    collectionId,
    image,
    owner: owner.startsWith('0x') && owner.length === 42 ? owner : owner,
    listed: price != null && price > 0,
    price,
    rarityRank: raw.rarity?.rank,
    traits:
      traits.length > 0
        ? traits
        : [
            { trait_type: 'Source', value: 'OpenSea' },
            { trait_type: 'Token ID', value: tokenIdStr },
          ],
  }
}

/** Page of NFTs for a collection slug (max 50 per request). */
export async function fetchOpenSeaCollectionNftsPage(
  slug: string,
  opts?: { limit?: number; next?: string | null }
): Promise<OpenSeaNftsPage> {
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 50))
  let path = `/collection/${encodeURIComponent(slug)}/nfts?limit=${limit}`
  if (opts?.next) path += `&next=${encodeURIComponent(opts.next)}`
  const data = await openSeaGet<{ nfts?: OpenSeaNftPayload[]; next?: string }>(path)
  return {
    nfts: data?.nfts ?? [],
    next: data?.next ?? null,
  }
}

/** Best listings → tokenId → ETH price */
export async function fetchOpenSeaBestListingPrices(
  slug: string,
  maxPages = 4
): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  let next: string | null | undefined = undefined
  for (let page = 0; page < maxPages; page++) {
    let path = `/listings/collection/${encodeURIComponent(slug)}/best?limit=50`
    if (next) path += `&next=${encodeURIComponent(next)}`
    const data = await openSeaGet<{ listings?: OpenSeaListingRow[]; next?: string }>(
      path
    )
    const listings = data?.listings ?? []
    for (const L of listings) {
      const id =
        L.asset?.identifier ||
        L.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria
      const raw = L.price?.current?.value
      const dec = L.price?.current?.decimals ?? 18
      if (id == null || raw == null) continue
      const eth = Number(raw) / 10 ** dec
      if (Number.isFinite(eth) && eth > 0) {
        const prev = prices.get(id)
        if (prev == null || eth < prev) prices.set(id, +eth.toPrecision(6))
      }
    }
    next = data?.next
    if (!next || listings.length === 0) break
  }
  return prices
}

export const OPENSEA_DOCS = {
  analytics: 'https://docs.opensea.io/reference/analytics-and-events',
  stats: 'https://docs.opensea.io/reference/get_collection_stats',
  events: 'https://docs.opensea.io/reference/list_events_by_collection',
  guide: 'https://docs.opensea.io/docs/query-analytics-and-events',
  keys: 'https://docs.opensea.io/reference/api-keys',
  robinhoodChain: 'https://opensea.io/collections/chain/robinhood',
}
