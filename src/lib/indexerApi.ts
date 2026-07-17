/**
 * OpenHood server indexer client (Fly).
 * When VITE_INDEXER_URL is set, collection pages hydrate from our API first.
 */
import type { Activity, Nft, Offer } from '../types'

export interface IndexerCollectionPayload {
  slug: string
  collectionId: string
  name?: string
  image?: string
  banner?: string
  description?: string
  contractAddress?: string
  chain?: string
  floorPrice?: number
  volume24h?: number
  volumeTotal?: number
  owners?: number
  items?: number
  listedCount?: number
  listedPct?: number
  nfts?: Nft[]
  activities?: Activity[]
  offers?: Offer[]
  prices?: [string, number][]
  syncedAt?: string
  source?: string
}

function baseUrl(): string {
  const u = (import.meta.env.VITE_INDEXER_URL as string | undefined)?.trim()
  return u ? u.replace(/\/$/, '') : ''
}

export function hasIndexerUrl(): boolean {
  return Boolean(baseUrl())
}

export function indexerUrl(): string {
  return baseUrl()
}

async function getJson<T>(path: string): Promise<T | null> {
  const base = baseUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
      headers: { accept: 'application/json' },
      // short cache ok — server already caches
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchIndexerStatus(): Promise<{
  ok: boolean
  collectionCount?: number
  listedTotal?: number
  lastFullSyncAt?: string | null
  busy?: boolean
} | null> {
  return getJson('/v1/status')
}

export async function fetchIndexerCollection(
  slug: string,
  opts?: { lite?: boolean }
): Promise<IndexerCollectionPayload | null> {
  const q = opts?.lite ? '?lite=1' : ''
  return getJson(`/v1/collections/${encodeURIComponent(slug)}${q}`)
}

export async function fetchIndexerCollections(): Promise<
  IndexerCollectionPayload[] | null
> {
  const data = await getJson<{ collections?: IndexerCollectionPayload[] }>(
    '/v1/collections'
  )
  return data?.collections ?? null
}
