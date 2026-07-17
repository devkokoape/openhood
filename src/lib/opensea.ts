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
import { withRisk } from './indexer'

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
  order_type?: string
  event_timestamp?: number | string
  order_hash?: string
  chain?: string
  protocol_data?: unknown
  payment?: {
    quantity?: string
    token?: { symbol?: string; decimals?: number }
    decimals?: number
    symbol?: string
  }
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
  maker?: string
  taker?: string
  quantity?: number
  /** v2 shape variants */
  asset?: {
    name?: string
    image_url?: string
    display_image_url?: string
    token_id?: string
    identifier?: string
    collection?: string
    contract?: string
  }
  payment_token?: { symbol?: string; decimals?: number; eth_price?: string }
  total_price?: string
}

export interface OpenSeaOfferRow {
  order_hash?: string
  chain?: string
  status?: string
  price?: { currency?: string; decimals?: number; value?: string }
  protocol_data?: {
    parameters?: {
      offerer?: string
      offer?: { startAmount?: string; endAmount?: string }[]
      endTime?: string
    }
  }
  asset?: { identifier?: string | null; contract?: string }
  criteria?: { encoded_token_ids?: string }
}

/**
 * API key is read from env at build time (GitHub secret → VITE_OPENSEA_API_KEY).
 * Prefer server-side proxy in production for stricter key hygiene; Vite embeds
 * any VITE_* var in the client bundle by design.
 */
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

async function openSeaGet<T>(path: string, attempt = 0): Promise<T | null> {
  try {
    const url = `${openSeaBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
    const res = await fetch(url, { headers: headers(), cache: 'no-store' })
    // Brief retry on rate limit / transient errors
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)))
      return openSeaGet<T>(path, attempt + 1)
    }
    if (!res.ok) return null
    const data = (await res.json()) as T & { errors?: string[] }
    if (data && typeof data === 'object' && 'errors' in data && data.errors?.length) {
      return null
    }
    return data as T
  } catch {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 250))
      return openSeaGet<T>(path, attempt + 1)
    }
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
  const rawImage =
    c.image_url || `https://opensea.io/static/images/placeholder.png`
  const rawBanner = c.banner_image_url || rawImage
  // High-res stills; leave video banners intact for <video> playback
  const image = upgradeOpenSeaImageUrl(rawImage, 512) || rawImage
  const banner = isVideoMediaUrl(rawBanner)
    ? rawBanner
    : upgradeOpenSeaImageUrl(rawBanner, 1920) || rawBanner

  const base: Collection = {
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
    // verified is set by indexer policy (OpenSea + ≥3 ETH volume), not OS safelist alone
    verified: false,
    openseaUrl: c.opensea_url || `https://opensea.io/collection/${row.slug}`,
    chain: contract?.chain || 'robinhood',
    contractAddress: contract?.address,
    salesTotal: s.total?.sales,
    category: c.category,
    intervals,
    source: 'opensea',
  }
  return withRisk(base)
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
  limit = 50
): Promise<OpenSeaEventItem[]> {
  const lim = Math.min(50, Math.max(1, limit))
  const data = await openSeaGet<{ asset_events?: OpenSeaEventItem[] }>(
    `/events/collection/${encodeURIComponent(slug)}?limit=${lim}`
  )
  return data?.asset_events ?? []
}

/** Active collection offers (item + collection criteria). */
export async function fetchCollectionOffers(
  slug: string,
  maxPages = 3
): Promise<OpenSeaOfferRow[]> {
  const all: OpenSeaOfferRow[] = []
  let next: string | null | undefined = undefined
  for (let page = 0; page < maxPages; page++) {
    let path = `/offers/collection/${encodeURIComponent(slug)}?limit=50`
    if (next) path += `&next=${encodeURIComponent(next)}`
    const data = await openSeaGet<{ offers?: OpenSeaOfferRow[]; next?: string }>(path)
    const rows = data?.offers ?? []
    if (!rows.length) break
    all.push(...rows)
    next = data?.next
    if (!next) break
  }
  return all
}

export function mapOpenSeaOffersToOffers(
  collectionId: string,
  rows: OpenSeaOfferRow[]
): import('../types').Offer[] {
  const out: import('../types').Offer[] = []
  for (const r of rows) {
    if (r.status && r.status !== 'ACTIVE') continue
    const raw = r.price?.value ?? r.protocol_data?.parameters?.offer?.[0]?.startAmount
    const dec = r.price?.decimals ?? 18
    if (raw == null) continue
    const eth = Number(raw) / 10 ** dec
    if (!Number.isFinite(eth) || eth <= 0) continue
    const tokenId = r.asset?.identifier
    const isCollection =
      !tokenId ||
      tokenId === 'null' ||
      r.criteria?.encoded_token_ids === '*'
    const end = r.protocol_data?.parameters?.endTime
    const expiresAt = end
      ? new Date(Number(end) * 1000).toISOString()
      : new Date(Date.now() + 86400000).toISOString()
    const offerer = r.protocol_data?.parameters?.offerer || 'unknown'
    out.push({
      id: `os-offer-${r.order_hash || `${collectionId}-${eth}-${offerer}`}`,
      type: isCollection ? 'collection' : 'item',
      collectionId,
      nftId:
        !isCollection && tokenId
          ? `${collectionId}-os-${tokenId}`
          : undefined,
      offerer: offerer.toLowerCase(),
      price: +eth.toPrecision(6),
      expiresAt,
      createdAt: new Date().toISOString(),
    })
  }
  out.sort((a, b) => b.price - a.price)
  return out
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
    const orderType = (e.order_type || '').toLowerCase()
    let type: Activity['type'] = 'transfer'
    if (orderType.includes('item_offer') || orderType.includes('collection_offer')) {
      type = orderType.includes('collection') ? 'collection_offer' : 'offer'
    } else if (orderType.includes('listing') || orderType === 'item_listing') {
      type = 'listing'
    } else if (typeRaw.includes('sale') || typeRaw === 'successful') {
      type = 'sale'
    } else if (typeRaw === 'order') {
      // Generic order event — prefer offer if WETH payment, else listing
      type = orderType.includes('offer')
        ? 'offer'
        : orderType.includes('list')
          ? 'listing'
          : 'offer'
    } else if (typeRaw.includes('list') || typeRaw === 'created') type = 'listing'
    else if (typeRaw.includes('offer') || typeRaw.includes('bid')) type = 'offer'
    else if (typeRaw.includes('transfer')) type = 'transfer'
    else if (typeRaw.includes('mint')) type = 'mint'
    else if (typeRaw.includes('cancel')) continue

    const tokenId =
      e.nft?.identifier ||
      e.asset?.identifier ||
      e.asset?.token_id ||
      undefined
    const ts =
      typeof e.event_timestamp === 'number'
        ? new Date(
            e.event_timestamp > 1e12
              ? e.event_timestamp
              : e.event_timestamp * 1000
          ).toISOString()
        : e.event_timestamp
          ? new Date(e.event_timestamp).toISOString()
          : new Date().toISOString()

    let price: number | undefined
    if (e.payment?.quantity) {
      const dec = e.payment.token?.decimals ?? e.payment.decimals ?? 18
      price = Number(e.payment.quantity) / 10 ** dec
    } else if (e.total_price) {
      const dec = e.payment_token?.decimals ?? 18
      price = Number(e.total_price) / 10 ** dec
    }

    const from =
      e.maker || e.from_address || e.seller || e.buyer || 'unknown'
    const to = e.taker || e.to_address || e.buyer

    acts.push({
      id: `os-${slug}-${e.order_hash || tokenId || 'x'}-${ts}-${type}`,
      type,
      collectionId,
      nftId: tokenId ? `${collectionId}-os-${tokenId}` : undefined,
      from: shortAddr(from),
      to: to ? shortAddr(to) : undefined,
      price: price != null && Number.isFinite(price) ? +price.toPrecision(6) : undefined,
      timestamp: ts,
    })
  }
  return acts.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
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
    if (!p) return withRisk(c)
    return withRisk({ ...c, ...p, id: c.id, slug: c.slug, source: 'opensea' as const })
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
  type?: string
  status?: string
  price?: { current?: { currency?: string; decimals?: number; value?: string } }
  asset?: { identifier?: string; contract?: string }
  protocol_data?: {
    parameters?: {
      offerer?: string
      offer?: { token?: string; identifierOrCriteria?: string }[]
      consideration?: {
        startAmount?: string
        endAmount?: string
        recipient?: string
      }[]
    }
  }
}

/** Parsed best listing used to build marketplace inventory. */
export interface ParsedListing {
  tokenId: string
  contract?: string
  chain?: string
  priceEth: number
  seller?: string
  orderHash?: string
}

/** In-memory cache so detail pages can resolve live OpenSea NFTs */
const nftCache = new Map<string, Nft>()

export function cacheOpenSeaNfts(list: Nft[]) {
  for (const n of list) nftCache.set(n.id, n)
}

export function getCachedOpenSeaNft(id: string): Nft | undefined {
  const exact = nftCache.get(id)
  if (exact) return exact
  // Match by token suffix when collectionId prefix differs (os1- vs os-)
  const m = id.match(/-os-(.+)$/)
  if (!m) return undefined
  const token = m[1]
  for (const n of nftCache.values()) {
    if (String(n.tokenId) === token || n.id.endsWith(`-os-${token}`)) return n
  }
  return undefined
}

/** Fetch single NFT metadata from OpenSea (chain/contract/tokenId). */
export async function fetchOpenSeaNft(
  chain: string,
  contract: string,
  tokenId: string | number
): Promise<OpenSeaNftPayload | null> {
  const data = await openSeaGet<{ nft?: OpenSeaNftPayload }>(
    `/chain/${encodeURIComponent(chain)}/contract/${encodeURIComponent(contract)}/nfts/${encodeURIComponent(String(tokenId))}`
  )
  return data?.nft ?? null
}

export function openSeaNftId(collectionId: string, tokenId: string | number): string {
  return `${collectionId}-os-${tokenId}`
}

/** True when a media URL is a video banner (OpenSea often ships hero as mp4). */
export function isVideoMediaUrl(url?: string | null): boolean {
  if (!url) return false
  const path = url.split('?')[0].toLowerCase()
  return (
    path.endsWith('.mp4') ||
    path.endsWith('.webm') ||
    path.endsWith('.mov') ||
    path.includes('/video') ||
    path.includes('image_type_hero') && path.endsWith('.mp4')
  )
}

/**
 * Prefer higher-resolution OpenSea CDN variants when supported.
 * IMPORTANT: i2c.seadn.io / raw2.seadn.io break with ?w= / auto=format — leave them alone.
 */
export function upgradeOpenSeaImageUrl(url?: string | null, width = 1200): string {
  if (!url) return ''
  if (isVideoMediaUrl(url)) return url
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    // These hosts serve fixed paths; query params can blank the image
    if (
      host.includes('i2c.seadn.io') ||
      host.includes('raw2.seadn.io') ||
      host.includes('i2.seadn.io')
    ) {
      return url
    }
    if (host === 'i.seadn.io' || host.includes('openseauserdata.com')) {
      if (!u.searchParams.has('w')) u.searchParams.set('w', String(width))
      return u.toString()
    }
  } catch {
    /* keep raw */
  }
  return url
}

export function pickBestNftImage(raw: {
  image_url?: string
  display_image_url?: string
  display_animation_url?: string
}): string {
  // Prefer full image_url; do not mangle Seadn CDN URLs
  return (raw.image_url || raw.display_image_url || '').trim()
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
    pickBestNftImage(raw) ||
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

export function parseListingRow(L: OpenSeaListingRow): ParsedListing | null {
  if (L.status && L.status !== 'ACTIVE') return null
  const tokenId =
    L.asset?.identifier ||
    L.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria
  if (tokenId == null || tokenId === '') return null

  let eth = 0
  const raw = L.price?.current?.value
  const dec = L.price?.current?.decimals ?? 18
  if (raw != null) {
    eth = Number(raw) / 10 ** dec
  }
  // Fallback: sum seller consideration (item 0 is usually seller proceeds+fees split)
  if (!Number.isFinite(eth) || eth <= 0) {
    const cons = L.protocol_data?.parameters?.consideration
    if (cons?.length) {
      let wei = 0n
      for (const c of cons) {
        const a = c.startAmount || c.endAmount
        if (a) {
          try {
            wei += BigInt(a)
          } catch {
            /* skip */
          }
        }
      }
      eth = Number(wei) / 1e18
    }
  }
  if (!Number.isFinite(eth) || eth <= 0) return null

  const seller = L.protocol_data?.parameters?.offerer?.toLowerCase()
  return {
    tokenId: String(tokenId),
    contract:
      L.asset?.contract || L.protocol_data?.parameters?.offer?.[0]?.token,
    chain: L.chain,
    priceEth: +eth.toPrecision(8),
    seller,
    orderHash: L.order_hash,
  }
}

/** True when image is not real token art (logo / placeholder / missing). */
export function isPlaceholderNftImage(
  image?: string | null,
  collectionImage?: string | null
): boolean {
  if (!image) return true
  if (image.includes('dicebear')) return true
  if (collectionImage && image === collectionImage) return true
  // Collection-level OpenSea assets, not per-token art
  if (/image_type_(logo|hero|featured)/i.test(image)) return true
  if (/\/collection\/[^/]+\/image_type_/i.test(image)) return true
  return false
}

export function nftNeedsMetadata(
  n: Nft,
  collectionImage?: string | null
): boolean {
  if (isPlaceholderNftImage(n.image, collectionImage)) return true
  if (!n.name || n.name.startsWith('#')) return true
  // Generic "CollectionName #id" without real OS name is OK to refine later;
  // only force if still placeholder image.
  return false
}

/** Build listed NFT cards from best-listings (marketplace inventory). */
export function nftsFromListings(
  listings: ParsedListing[],
  collectionId: string,
  opts?: { namePrefix?: string; fallbackImage?: string; contract?: string }
): Nft[] {
  const byToken = new Map<string, ParsedListing>()
  for (const L of listings) {
    const prev = byToken.get(L.tokenId)
    if (!prev || L.priceEth < prev.priceEth) byToken.set(L.tokenId, L)
  }

  const out: Nft[] = []
  for (const L of byToken.values()) {
    const tokenIdNum = Number(L.tokenId)
    const id = openSeaNftId(collectionId, L.tokenId)
    const cached = nftCache.get(id)
    // Never use collection logo as token art — it blocks enrich detection
    const stub = `https://api.dicebear.com/7.x/shapes/svg?seed=${collectionId}-${L.tokenId}&backgroundColor=0b0e11,00c805`
    const cachedOk =
      cached?.image && !isPlaceholderNftImage(cached.image, opts?.fallbackImage)

    out.push({
      id,
      tokenId: Number.isSafeInteger(tokenIdNum)
        ? tokenIdNum
        : parseInt(L.tokenId, 10) || 0,
      name: cached?.name || `${opts?.namePrefix || '#'}${L.tokenId}`,
      collectionId,
      image: cachedOk ? cached!.image : stub,
      owner: L.seller || cached?.owner || 'unknown',
      listed: true,
      price: L.priceEth,
      rarityRank: cached?.rarityRank,
      traits: cached?.traits?.length
        ? cached.traits
        : [
            { trait_type: 'Status', value: 'Listed' },
            { trait_type: 'Token ID', value: L.tokenId },
          ],
    })
  }

  // Floor-first like OpenSea
  out.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  return out
}

/**
 * Fill real names/images/traits for listed tokens by paging
 * GET /collection/{slug}/nfts (50/page) — far fewer calls than 1 NFT at a time.
 */
export async function fillListedNftMetadata(
  slug: string,
  collectionId: string,
  listed: Nft[],
  opts?: {
    maxPages?: number
    collectionImage?: string | null
    signal?: { cancelled: boolean }
    onProgress?: (nfts: Nft[]) => void
  }
): Promise<Nft[]> {
  if (!listed.length) return listed
  const byToken = new Map(listed.map((n) => [String(n.tokenId), { ...n }]))
  const needed = new Set(
    listed
      .filter((n) => nftNeedsMetadata(n, opts?.collectionImage))
      .map((n) => String(n.tokenId))
  )
  if (needed.size === 0) return listed

  let next: string | null = null
  const maxPages = opts?.maxPages ?? 150

  for (let page = 0; page < maxPages && needed.size > 0; page++) {
    if (opts?.signal?.cancelled) break
    const res = await fetchOpenSeaCollectionNftsPage(slug, {
      limit: 50,
      next,
    })
    if (!res.nfts.length) break

    let hit = 0
    for (const raw of res.nfts) {
      const tid = raw.identifier != null ? String(raw.identifier) : ''
      if (!tid || !needed.has(tid)) continue
      const existing = byToken.get(tid)
      if (!existing) continue
      const mapped = mapOpenSeaNftToNft(raw, collectionId)
      if (!mapped) continue
      const image = pickBestNftImage(raw)
      byToken.set(tid, {
        ...existing,
        name: mapped.name || existing.name,
        image: image || mapped.image || existing.image,
        owner:
          mapped.owner && mapped.owner !== 'unknown'
            ? mapped.owner
            : existing.owner,
        traits:
          mapped.traits && mapped.traits.length > 2
            ? mapped.traits
            : existing.traits,
        rarityRank: mapped.rarityRank ?? existing.rarityRank,
        listed: existing.listed,
        price: existing.price,
      })
      needed.delete(tid)
      hit++
    }

    if (hit > 0 || page % 3 === 0) {
      const snapshot = Array.from(byToken.values()).sort(
        (a, b) => (a.price ?? 0) - (b.price ?? 0)
      )
      cacheOpenSeaNfts(snapshot)
      opts?.onProgress?.(snapshot)
    }

    next = res.next
    if (!next) break
    // stay friendly to rate limits
    await new Promise((r) => setTimeout(r, 40))
  }

  return Array.from(byToken.values()).sort(
    (a, b) => (a.price ?? 0) - (b.price ?? 0)
  )
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

/**
 * Fetch ALL best listings for a collection (price ascending).
 * OpenSea allows limit up to 200 — we page until exhausted.
 */
export async function fetchAllBestListings(
  slug: string,
  opts?: { maxPages?: number; pageSize?: number; onPage?: (rows: ParsedListing[], total: number) => void }
): Promise<ParsedListing[]> {
  const maxPages = opts?.maxPages ?? 80
  const pageSize = Math.min(200, Math.max(1, opts?.pageSize ?? 200))
  const all: ParsedListing[] = []
  const seen = new Set<string>()
  let next: string | null | undefined = undefined

  for (let page = 0; page < maxPages; page++) {
    let path = `/listings/collection/${encodeURIComponent(slug)}/best?limit=${pageSize}`
    if (next) path += `&next=${encodeURIComponent(next)}`
    const data = await openSeaGet<{ listings?: OpenSeaListingRow[]; next?: string }>(
      path
    )
    const listings = data?.listings ?? []
    if (listings.length === 0) break

    const batch: ParsedListing[] = []
    for (const L of listings) {
      const parsed = parseListingRow(L)
      if (!parsed) continue
      if (seen.has(parsed.tokenId)) {
        // Keep cheaper listing
        const idx = all.findIndex((x) => x.tokenId === parsed.tokenId)
        if (idx >= 0 && parsed.priceEth < all[idx].priceEth) {
          all[idx] = parsed
        }
        continue
      }
      seen.add(parsed.tokenId)
      batch.push(parsed)
      all.push(parsed)
    }
    opts?.onPage?.(batch, all.length)
    next = data?.next
    if (!next) break
  }

  all.sort((a, b) => a.priceEth - b.priceEth)
  return all
}

/** Best listings → tokenId → ETH price (full book by default). */
export async function fetchOpenSeaBestListingPrices(
  slug: string,
  maxPages = 40
): Promise<Map<string, number>> {
  const listings = await fetchAllBestListings(slug, { maxPages, pageSize: 200 })
  const prices = new Map<string, number>()
  for (const L of listings) {
    const prev = prices.get(L.tokenId)
    if (prev == null || L.priceEth < prev) prices.set(L.tokenId, L.priceEth)
  }
  return prices
}

/**
 * Enrich listed stubs with real images/names/traits from the NFT endpoint.
 * Concurrent pool; calls onProgress with updated map of tokenId → partial Nft.
 */
export async function enrichNftsFromOpenSea(
  items: { tokenId: string | number; chain?: string; contract?: string }[],
  _collectionId: string,
  opts?: {
    chain?: string
    contract?: string
    concurrency?: number
    signal?: { cancelled: boolean }
    onProgress?: (partial: Map<string, Partial<Nft>>) => void
  }
): Promise<Map<string, Partial<Nft>>> {
  void _collectionId
  const chain = opts?.chain || 'robinhood'
  const contract = opts?.contract
  const concurrency = opts?.concurrency ?? 8
  const out = new Map<string, Partial<Nft>>()
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      if (opts?.signal?.cancelled) return
      const i = cursor++
      const row = items[i]
      const c = row.contract || contract
      if (!c) continue
      const tid = String(row.tokenId)
      try {
        const raw = await fetchOpenSeaNft(row.chain || chain, c, tid)
        if (!raw || opts?.signal?.cancelled) continue
        const image = pickBestNftImage(raw)
        const owner = raw.owners?.[0]?.address?.toLowerCase()
        const traits = (raw.traits || [])
          .filter((t) => t.trait_type != null && t.value != null && t.value !== '')
          .map((t) => ({
            trait_type: String(t.trait_type),
            value: String(t.value),
          }))
        const patch: Partial<Nft> = {
          name: raw.name || undefined,
          image: image || undefined,
          owner: owner || undefined,
          rarityRank: raw.rarity?.rank,
          traits: traits.length ? traits : undefined,
        }
        out.set(tid, patch)
        if (opts?.onProgress && (out.size % 6 === 0 || out.size === items.length)) {
          opts.onProgress(new Map(out))
        }
      } catch {
        /* skip token */
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  )
  opts?.onProgress?.(out)
  return out
}

export const OPENSEA_DOCS = {
  analytics: 'https://docs.opensea.io/reference/analytics-and-events',
  stats: 'https://docs.opensea.io/reference/get_collection_stats',
  events: 'https://docs.opensea.io/reference/list_events_by_collection',
  guide: 'https://docs.opensea.io/docs/query-analytics-and-events',
  keys: 'https://docs.opensea.io/reference/api-keys',
  robinhoodChain: 'https://opensea.io/collections/chain/robinhood',
}
