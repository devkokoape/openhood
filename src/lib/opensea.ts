/**
 * OpenSea API helpers — Analytics & Events
 * Docs: https://docs.opensea.io/reference/analytics-and-events
 *       https://docs.opensea.io/docs/query-analytics-and-events
 *
 * Public stats/collection endpoints often work without a key (rate limited).
 * Events require X-API-KEY. Set VITE_OPENSEA_API_KEY for live refresh.
 */

import type { Collection, OpenSeaIntervals } from '../types'
import snapshot from '../data/opensea-robinhood-snapshot.json'

const OPENSEA_API = 'https://api.opensea.io/api/v2'

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
    c.image_url ||
    `https://opensea.io/static/images/placeholder.png`
  const banner = c.banner_image_url || image

  return {
    id: `${idPrefix}-${row.slug}`,
    name: c.name,
    slug: row.slug || c.collection,
    description:
      c.description ||
      `${c.name} on Robinhood Chain — stats synced from OpenSea analytics.`,
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
    verified: c.safelist_status === 'verified' || c.safelist_status === 'approved',
    openseaUrl: c.opensea_url || `https://opensea.io/collection/${row.slug}`,
    chain: contract?.chain || 'robinhood',
    contractAddress: contract?.address,
    salesTotal: s.total?.sales,
    category: c.category,
    intervals,
    source: 'opensea',
  }
}

/** Collections built from the committed OpenSea snapshot (Robinhood Chain) */
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
  try {
    const headers: Record<string, string> = { accept: 'application/json' }
    const key = import.meta.env.VITE_OPENSEA_API_KEY as string | undefined
    if (key) headers['X-API-KEY'] = key

    const res = await fetch(`${OPENSEA_API}/collections/${slug}/stats`, { headers })
    if (!res.ok) return null
    const data = (await res.json()) as OpenSeaStatsPayload
    if (data.errors) return null
    return data
  } catch {
    return null
  }
}

export async function fetchOpenSeaCollection(
  slug: string
): Promise<OpenSeaCollectionPayload | null> {
  try {
    const headers: Record<string, string> = { accept: 'application/json' }
    const key = import.meta.env.VITE_OPENSEA_API_KEY as string | undefined
    if (key) headers['X-API-KEY'] = key

    const res = await fetch(`${OPENSEA_API}/collections/${slug}`, { headers })
    if (!res.ok) return null
    const data = (await res.json()) as OpenSeaCollectionPayload & { errors?: string[] }
    if ((data as { errors?: string[] }).errors) return null
    return data
  } catch {
    return null
  }
}

/** Live refresh one collection's stats into our shape */
export async function refreshCollectionFromOpenSea(
  slug: string
): Promise<Partial<Collection> | null> {
  const [col, stats] = await Promise.all([
    fetchOpenSeaCollection(slug),
    fetchOpenSeaCollectionStats(slug),
  ])
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
    source: 'opensea',
  }
}

export const OPENSEA_DOCS = {
  analytics: 'https://docs.opensea.io/reference/analytics-and-events',
  stats: 'https://docs.opensea.io/reference/get_collection_stats',
  events: 'https://docs.opensea.io/reference/list_events_by_collection',
  guide: 'https://docs.opensea.io/docs/query-analytics-and-events',
  robinhoodChain: 'https://opensea.io/collections/chain/robinhood',
}
