/**
 * OpenHood indexer client — always uses the Fly production API.
 *
 * Single source of truth: https://openhood-indexer.fly.dev
 * Local indexer (localhost:8080) is intentionally NOT used — shared Fly cache
 * avoids split-brain catalogs and stale local SQLite bugs.
 */
import type { Activity, Nft, Offer } from '../types'

/** Production Fly indexer — never point the marketplace at a local server. */
export const FLY_INDEXER_URL = 'https://openhood-indexer.fly.dev'

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
  indexing?: boolean
  empty?: boolean
  nftsTotal?: number
  hasMore?: boolean
}

function isLocalhostUrl(u: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/i.test(u)
}

function baseUrl(): string {
  const raw = (import.meta.env.VITE_INDEXER_URL as string | undefined)?.trim()
  if (raw) {
    const cleaned = raw.replace(/\/$/, '')
    // Refuse local indexer — forces everyone onto Fly
    if (isLocalhostUrl(cleaned)) {
      console.warn(
        '[openhood] Ignoring local VITE_INDEXER_URL — using Fly:',
        FLY_INDEXER_URL
      )
      return FLY_INDEXER_URL
    }
    return cleaned
  }
  return FLY_INDEXER_URL
}

/** Always true — marketplace is Fly-backed. */
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
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchIndexerStatus(): Promise<{
  ok?: boolean
  collectionCount?: number
  listedTotal?: number
  lastFullSyncAt?: string | null
  lastDownloadAt?: string | null
  lastDownloadMode?: string | null
  lastDownloadQueued?: number | null
  busy?: boolean
  queueDepth?: number
  uptimeSec?: number
  memoryMb?: number
  nftsIndexed?: number
  nftsEnriched?: number
  lastError?: string | null
} | null> {
  const s = await getJson<{
    collectionCount?: number
    listedTotal?: number
    lastFullSyncAt?: string | null
    lastDownloadAt?: string | null
    lastDownloadMode?: string | null
    lastDownloadQueued?: number | null
    busy?: boolean
    queueDepth?: number
    uptimeSec?: number
    memoryMb?: number
    nftsIndexed?: number
    nftsEnriched?: number
    lastError?: string | null
  }>('/v1/status')
  if (!s) return null
  return { ...s, ok: true }
}

export async function fetchIndexerCollection(
  slug: string,
  opts?: { lite?: boolean; limit?: number; offset?: number }
): Promise<(IndexerCollectionPayload & { indexing?: boolean }) | null> {
  const base = baseUrl()
  if (!base) return null
  const params = new URLSearchParams()
  if (opts?.lite !== false) params.set('lite', '1')
  if (opts?.limit != null) params.set('limit', String(opts.limit))
  if (opts?.offset != null) params.set('offset', String(opts.offset))
  const q = params.toString() ? `?${params}` : ''
  try {
    const res = await fetch(
      `${base}/v1/collections/${encodeURIComponent(slug)}${q}`,
      { headers: { accept: 'application/json' }, cache: 'no-store' }
    )
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

export async function fetchIndexerCollections(opts?: {
  limit?: number
}): Promise<IndexerCollectionPayload[] | null> {
  const limit = opts?.limit ?? 100
  const data = await getJson<{ collections?: IndexerCollectionPayload[] }>(
    `/v1/collections?limit=${limit}`
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

/** Per-collection OpenSea → Fly content health */
export interface ContentStatusRow {
  slug: string
  name: string
  listedCount: number
  nftsCount: number
  enrichedCount: number
  stubCount: number
  enrichPct: number
  hasImage: boolean
  floorPrice: number
  volume24h: number
  volumeTotal?: number
  verified?: boolean
  items: number
  syncedAt: string | null
  contractAddress: string | null
  status: 'ready' | 'partial' | 'empty' | 'shell'
}

export interface ContentStatusPayload {
  generatedAt: string
  busy: boolean
  queueDepth: number
  progress?: {
    startQueued: number
    remaining: number
    done: number
    percent: number
    mode?: string | null
    startedAt?: string | null
  }
  media?: { files?: number; mb?: number; bytes?: number }
  nftsIndexed?: number
  nftsEnriched?: number
  listedTotal?: number
  lastDownloadAt?: string | null
  lastDownloadMode?: string | null
  lastDownloadQueued?: number | null
  lastVerifiedQueued?: number | null
  lastError?: string | null
  lastWarning?: string | null
  lastRateLimitAt?: string | null
  summary: {
    collections: number
    verified?: number
    verifiedMinVolumeEth?: number
    withListings: number
    empty: number
    shell: number
    ready: number
    partial: number
    withImage: number
    totalNfts: number
    totalListed: number
    totalEnriched: number
    totalStubs: number
    enrichPct: number
  }
  collections: ContentStatusRow[]
}

export async function fetchContentStatus(): Promise<ContentStatusPayload | null> {
  return getJson<ContentStatusPayload>('/v1/content-status')
}

function adminAuthHeaders(): HeadersInit {
  // Match AdminGate defaults so Pages works even without CI secrets
  const key = (
    (import.meta.env.VITE_ADMIN_PASS as string | undefined) ||
    (import.meta.env.VITE_SYNC_SECRET as string | undefined) ||
    'MRkoko2025'
  ).trim()
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-admin-key': key,
    'x-sync-secret': key,
  }
}

/**
 * Trigger OpenSea → Fly bulk download (queued on server).
 * mode: mainnet (default, Robinhood mainnet only) | verified | all | missing | enrich
 */
export async function triggerContentDownload(
  mode:
    | 'mainnet'
    | 'all'
    | 'missing'
    | 'meta'
    | 'enrich'
    | 'verified' = 'mainnet'
): Promise<{
  ok?: boolean
  error?: string
  message?: string
  queued?: number
  queueDepth?: number
  discovered?: number
  slugCount?: number
  mode?: string
  alreadyRunning?: boolean
  metaQueued?: number
  fullQueued?: number
  verifiedCount?: number
  verifiedQueued?: number
  mainnetOnly?: boolean
  chain?: string
} | null> {
  const base = baseUrl()
  if (!base) return null
  try {
    const controller = new AbortController()
    const t = window.setTimeout(() => controller.abort(), 120_000)
    const res = await fetch(`${base}/v1/content/download`, {
      method: 'POST',
      headers: adminAuthHeaders(),
      body: JSON.stringify({ mode }),
      cache: 'no-store',
      signal: controller.signal,
    })
    window.clearTimeout(t)
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return {
        ok: false,
        error: String(data.error || res.statusText || 'failed'),
        message: data.message ? String(data.message) : undefined,
      }
    }
    return {
      ok: true,
      ...data,
      message: data.message ? String(data.message) : undefined,
    } as {
      ok?: boolean
      message?: string
      queued?: number
      queueDepth?: number
      discovered?: number
      slugCount?: number
      mode?: string
      alreadyRunning?: boolean
      metaQueued?: number
      fullQueued?: number
      verifiedCount?: number
      verifiedQueued?: number
    }
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.name === 'AbortError'
            ? 'Request timed out — server may still be discovering collections. Refresh status.'
            : e.message
          : 'network error',
    }
  }
}

/** Queue one collection for full sync on Fly */
export async function triggerCollectionDownload(
  slug: string
): Promise<{ ok?: boolean; error?: string; message?: string } | null> {
  const base = baseUrl()
  if (!base || !slug) return null
  try {
    const res = await fetch(
      `${base}/v1/sync/${encodeURIComponent(slug)}`,
      {
        method: 'POST',
        headers: adminAuthHeaders(),
        cache: 'no-store',
      }
    )
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return { ok: false, error: String(data.error || res.statusText) }
    }
    return { ok: true, message: data.message ? String(data.message) : `Queued ${slug}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' }
  }
}
