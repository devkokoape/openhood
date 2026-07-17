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
): Promise<(IndexerCollectionPayload & { indexing?: boolean }) | null> {
  const base = baseUrl()
  if (!base) return null
  const q = opts?.lite ? '?lite=1' : ''
  try {
    const res = await fetch(
      `${base}/v1/collections/${encodeURIComponent(slug)}${q}`,
      { headers: { accept: 'application/json' }, cache: 'no-store' }
    )
    // 202 = still indexing on Fly — return body so client can poll
    if (res.status === 202 || res.ok) {
      return (await res.json()) as IndexerCollectionPayload & {
        indexing?: boolean
      }
    }
    return null
  } catch {
    return null
  }
}

export async function fetchIndexerCollections(): Promise<
  IndexerCollectionPayload[] | null
> {
  const data = await getJson<{ collections?: IndexerCollectionPayload[] }>(
    '/v1/collections'
  )
  return data?.collections ?? null
}

/** Full admin dashboard: visits, geo, users, data collection, server */
export interface AnalyticsDashboard {
  generatedAt: string
  server: {
    startedAt?: string
    lastFullSyncAt?: string | null
    lastError?: string | null
    syncCount?: number
    collectionCount?: number
    listedTotal?: number
    busy?: boolean
    hasOpenSeaKey?: boolean
    slugs?: string[]
    uptimeSec?: number
    memoryMb?: number
    node?: string
    pid?: number
  }
  visits: {
    total: number
    last24h: number
    last7d: number
    uniqueSessions7d: number
    withWallet7d: number
    byDay: { date: string; count: number }[]
    byHour: { hour: string; count: number }[]
    topPaths: { path: string; count: number }[]
    topCountries: { name: string; count: number }[]
    topCities: { name: string; count: number }[]
    byDevice: { name: string; count: number }[]
    recent: {
      id: string
      at: string
      path: string
      wallet?: string | null
      device?: string
      locale?: string
      timezone?: string
      geo?: {
        country?: string | null
        countryCode?: string | null
        region?: string | null
        city?: string | null
        timezone?: string | null
      }
      connected?: boolean
      referrer?: string | null
    }[]
  }
  users: {
    total: number
    wallets: number
    sessions: number
    activeToday: number
    recent: {
      id: string
      kind: string
      wallet?: string | null
      visits: number
      firstSeen: string
      lastSeen: string
      lastPath?: string
      lastGeo?: {
        country?: string | null
        city?: string | null
        region?: string | null
        countryCode?: string | null
      }
      locale?: string
      timezone?: string
      topCountry?: string
      topDevice?: string
    }[]
  }
  dataCollection: {
    collectionsIndexed: number
    listedTotal: number
    activityTotal: number
    offersTotal: number
    volume24h: number
    volumeTotal: number
    lastSyncs: {
      slug: string
      name?: string
      listedCount: number
      activityCount: number
      offerCount: number
      floorPrice?: number
      volume24h?: number
      syncedAt?: string
      syncMs?: number
    }[]
  }
}

export async function fetchAnalyticsDashboard(): Promise<AnalyticsDashboard | null> {
  return getJson<AnalyticsDashboard>('/v1/analytics/dashboard')
}
