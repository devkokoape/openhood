/**
 * Live OpenSea Robinhood data — Fly-first, memory-capped, ready-only.
 *
 * Public marketplace shows ONLY fully downloaded (ready) collections from Fly.
 * When a collection finishes download/enrich on the indexer, the next poll
 * picks it up automatically — no manual publish step.
 *
 *  - Prefer Fly catalog (server already filters readyOnly)
 *  - Cap how many collections live in React state
 *  - Poll often enough for new ready collections to appear (~45–90s)
 *  - Skip OpenSea mass-discovery / seed stubs when Fly is available
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Activity, Collection } from '../types'
import {
  collectionFromOpenSeaListItem,
  collectionsFromOpenSeaSnapshot,
  fetchAllRobinhoodCollections,
  fetchCollectionEvents,
  hasOpenSeaApiKey,
  mapOpenSeaEventsToActivities,
  mergeOpenSeaPatches,
  openSeaBaseUrl,
  refreshManyOpenSeaStats,
  robinhoodOpenSeaSlugs,
} from '../lib/opensea'
import {
  fetchIndexerCollections,
  hasIndexerUrl,
} from '../lib/indexerApi'
import { withRisk } from '../lib/indexer'
import {
  eventsPollMs,
  maxDiscoverCollections,
  maxStatsBatch,
  preferLiteMode,
  statsPollMs,
} from '../lib/device'

/**
 * Re-poll Fly ready catalog so collections auto-appear after 100% download.
 * Faster than full OpenSea rediscovery; still gentle on mobile.
 */
export const DISCOVER_INTERVAL_MS = preferLiteMode() ? 90_000 : 45_000

export type OpenSeaLiveStatus = {
  live: boolean
  lastOkAt: number | null
  lastError: string | null
  tick: number
  usingProxy: boolean
  hasApiKey: boolean
  refreshing: boolean
  discovered: number
}

function indexerRowToCollection(row: {
  slug: string
  collectionId?: string
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
}): Collection {
  return withRisk({
    id: row.collectionId || `os-${row.slug}`,
    name: row.name || row.slug,
    slug: row.slug,
    description:
      row.description || `${row.name || row.slug} on Robinhood Chain`,
    image: row.image || '',
    banner: row.banner || row.image || '',
    floorPrice: row.floorPrice ?? 0,
    volume24h: row.volume24h ?? 0,
    volumeTotal: row.volumeTotal ?? 0,
    items: row.items ?? 0,
    owners: row.owners ?? 0,
    founder: 'OpenSea',
    verified: false,
    openseaUrl: `https://opensea.io/collection/${row.slug}`,
    chain: row.chain || 'robinhood',
    contractAddress: row.contractAddress,
    listedPct:
      row.listedPct ??
      (row.items && row.listedCount
        ? +((row.listedCount / row.items) * 100).toFixed(1)
        : undefined),
    source: 'opensea',
  })
}

function mergeBySlug(base: Collection[], extra: Collection[]): Collection[] {
  const map = new Map<string, Collection>()
  for (const c of base) map.set(c.slug, c)
  for (const c of extra) {
    const prev = map.get(c.slug)
    if (!prev) {
      map.set(c.slug, c)
      continue
    }
    map.set(c.slug, {
      ...prev,
      ...c,
      id: prev.id || c.id,
      slug: prev.slug || c.slug,
      image:
        c.image && !c.image.includes('dicebear') && c.image
          ? c.image
          : prev.image,
      banner:
        c.banner && !c.banner.includes('dicebear') ? c.banner : prev.banner,
      floorPrice:
        c.floorPrice != null && c.floorPrice > 0
          ? c.floorPrice
          : prev.floorPrice,
      volume24h:
        c.volume24h != null && (c.volume24h > 0 || prev.volume24h === 0)
          ? c.volume24h
          : prev.volume24h,
      volumeTotal:
        c.volumeTotal != null && c.volumeTotal > 0
          ? c.volumeTotal
          : prev.volumeTotal,
      items: Math.max(c.items || 0, prev.items || 0),
      owners: Math.max(c.owners || 0, prev.owners || 0),
      contractAddress: c.contractAddress || prev.contractAddress,
      listedPct: c.listedPct ?? prev.listedPct,
    })
  }
  return Array.from(map.values())
}

/** Cap React state size — ranked by volume, verified first. */
function capCollections(list: Collection[], max: number): Collection[] {
  if (list.length <= max) return list
  return [...list]
    .sort((a, b) => {
      const av = a.verified ? 1 : 0
      const bv = b.verified ? 1 : 0
      if (bv !== av) return bv - av
      if (b.volume24h !== a.volume24h) return b.volume24h - a.volume24h
      return b.volumeTotal - a.volumeTotal
    })
    .slice(0, max)
}

export function useOpenSeaLive() {
  // Seed snapshot only used when Fly indexer is unreachable (dev offline)
  const seed = useMemo(() => collectionsFromOpenSeaSnapshot(), [])
  const seedSlugs = useMemo(() => robinhoodOpenSeaSlugs(), [])
  const [discovered, setDiscovered] = useState<Collection[]>([])
  const [indexerCols, setIndexerCols] = useState<Collection[]>([])
  const [patches, setPatches] = useState<Map<string, Partial<Collection>>>(
    () => new Map()
  )
  const [osActivities, setOsActivities] = useState<Activity[]>([])
  const [status, setStatus] = useState<OpenSeaLiveStatus>({
    live: false,
    lastOkAt: null,
    lastError: null,
    tick: 0,
    usingProxy: openSeaBaseUrl().startsWith('/'),
    hasApiKey: hasOpenSeaApiKey(),
    refreshing: false,
    discovered: 0,
  })
  const busy = useRef(false)
  const eventsBusy = useRef(false)
  const discoverBusy = useRef(false)

  const catalog = useMemo(() => {
    // Fly is source of truth — only ready collections from the indexer.
    // Never merge seed stubs (incomplete / not fully downloaded).
    if (hasIndexerUrl()) {
      return capCollections(indexerCols, maxDiscoverCollections())
    }
    // Offline / no indexer: fall back to local seed + discovery
    let list = mergeBySlug(seed, discovered)
    list = mergeBySlug(list, indexerCols)
    return capCollections(list, maxDiscoverCollections())
  }, [seed, discovered, indexerCols])

  const collections = useMemo(
    () => mergeOpenSeaPatches(catalog, patches),
    [catalog, patches]
  )

  const runDiscovery = useCallback(async () => {
    if (discoverBusy.current) return
    if (typeof document !== 'undefined' && document.hidden) return
    discoverBusy.current = true
    try {
      const max = maxDiscoverCollections()
      const lite = preferLiteMode()

      // Fly ready-only feed (server filters incomplete downloads)
      if (hasIndexerUrl()) {
        const { fetchHomeFeed } = await import('../lib/indexerApi')
        const home = await fetchHomeFeed(max)
        if (home) {
          const cols = (home.collections || []).map(indexerRowToCollection)
          setIndexerCols(cols)
          setDiscovered([]) // drop any non-ready OS discovery
          setStatus((s) => ({
            ...s,
            discovered: cols.length,
            live: true,
            lastOkAt: Date.now(),
            lastError: null,
          }))
        } else {
          const rows = await fetchIndexerCollections({ limit: max })
          if (rows) {
            const cols = rows.map(indexerRowToCollection)
            setIndexerCols(cols)
            setDiscovered([])
            setStatus((s) => ({
              ...s,
              discovered: cols.length,
              live: true,
              lastOkAt: Date.now(),
              lastError: null,
            }))
          }
        }
      } else if (!lite) {
        // Fallback only without Fly
        const rows = await fetchAllRobinhoodCollections({
          maxPages: 1,
          pageSize: Math.min(50, max),
        })
        if (rows.length) {
          const mapped = rows
            .slice(0, max)
            .map((c) => collectionFromOpenSeaListItem(c))
          setDiscovered(mapped)
          setStatus((s) => ({
            ...s,
            discovered: mapped.length,
            live: true,
            lastOkAt: Date.now(),
          }))
        }
      }
    } catch (e) {
      setStatus((s) => ({
        ...s,
        lastError:
          e instanceof Error ? e.message : 'Failed to discover RH collections',
      }))
    } finally {
      discoverBusy.current = false
    }
  }, [])

  const collectionsRef = useRef(collections)
  collectionsRef.current = collections
  const seedSlugsLen = seedSlugs.length

  const refreshStats = useCallback(async () => {
    if (busy.current) return
    if (typeof document !== 'undefined' && document.hidden) return
    const cols = collectionsRef.current
    if (!cols.length) return
    // When Fly already supplies floors, skip OpenSea browser stats thrash
    if (hasIndexerUrl()) {
      const withFloor = cols.filter((c) => (c.floorPrice || 0) > 0).length
      if (withFloor >= Math.min(8, cols.length)) {
        setStatus((s) => ({
          ...s,
          live: true,
          lastOkAt: Date.now(),
          refreshing: false,
        }))
        return
      }
    }
    busy.current = true
    setStatus((s) => ({ ...s, refreshing: true }))
    try {
      const ranked = [...cols]
        .filter((c) => c.source === 'opensea')
        .sort((a, b) => b.volume24h - a.volume24h)
      const batch = maxStatsBatch()
      const needFloor = ranked.filter((c) => !c.floorPrice).slice(0, batch)
      const top = ranked.slice(0, batch)
      const batchSlugs = [
        ...new Set([...needFloor, ...top].map((c) => c.slug)),
      ].slice(0, batch)

      const next = await refreshManyOpenSeaStats(
        batchSlugs,
        preferLiteMode() ? 2 : 3
      )
      if (next.size > 0) {
        setPatches((prev) => {
          const merged = new Map(prev)
          // Cap patch map size
          for (const [slug, patch] of next) {
            merged.set(slug, { ...merged.get(slug), ...patch })
          }
          if (merged.size > 200) {
            const keep = [...merged.keys()].slice(-150)
            const trimmed = new Map<string, Partial<Collection>>()
            for (const k of keep) {
              const v = merged.get(k)
              if (v) trimmed.set(k, v)
            }
            return trimmed
          }
          return merged
        })
        setStatus((s) => ({
          ...s,
          live: true,
          lastOkAt: Date.now(),
          lastError: null,
          tick: s.tick + 1,
          refreshing: false,
          hasApiKey: hasOpenSeaApiKey(),
          usingProxy: openSeaBaseUrl().startsWith('/'),
        }))
      } else {
        setStatus((s) => ({
          ...s,
          refreshing: false,
          hasApiKey: hasOpenSeaApiKey(),
          live: s.live || seedSlugsLen > 0,
        }))
      }
    } catch (e) {
      setStatus((s) => ({
        ...s,
        live: false,
        lastError: e instanceof Error ? e.message : 'OpenSea refresh failed',
        refreshing: false,
      }))
    } finally {
      busy.current = false
    }
  }, [seedSlugsLen])

  const refreshEvents = useCallback(async () => {
    if (!hasOpenSeaApiKey() || eventsBusy.current) return
    if (typeof document !== 'undefined' && document.hidden) return
    if (preferLiteMode()) return // skip heavy events on phones
    eventsBusy.current = true
    try {
      const ranked = [...collectionsRef.current]
        .filter((c) => c.source === 'opensea')
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, 3)

      const batches = await Promise.all(
        ranked.map(async (c) => {
          const events = await fetchCollectionEvents(c.slug, 8)
          return mapOpenSeaEventsToActivities(c.slug, c.id, events)
        })
      )
      const flat = batches
        .flat()
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, 40)
      if (flat.length) setOsActivities(flat)
    } catch {
      /* keep previous */
    } finally {
      eventsBusy.current = false
    }
  }, [])

  useEffect(() => {
    void runDiscovery()
    const id = window.setInterval(
      () => void runDiscovery(),
      DISCOVER_INTERVAL_MS
    )
    return () => window.clearInterval(id)
  }, [runDiscovery])

  useEffect(() => {
    void refreshStats()
    const id = window.setInterval(() => void refreshStats(), statsPollMs())
    return () => window.clearInterval(id)
  }, [refreshStats])

  useEffect(() => {
    if (!hasOpenSeaApiKey() || preferLiteMode()) return
    void refreshEvents()
    const id = window.setInterval(() => void refreshEvents(), eventsPollMs())
    return () => window.clearInterval(id)
  }, [refreshEvents])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void runDiscovery()
        void refreshStats()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refreshStats, runDiscovery])

  return {
    openSeaCollections: collections,
    openSeaActivities: osActivities,
    openSeaStatus: status,
    refreshOpenSea: refreshStats,
  }
}
