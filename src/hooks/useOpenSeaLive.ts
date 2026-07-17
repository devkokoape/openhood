/**
 * Live OpenSea Robinhood data — discovers ALL chain collections + polls stats.
 *
 * 1) Snapshot seed (instant)
 * 2) Full RH discovery (paginated OpenSea list)
 * 3) Fly indexer collections (shared server catalog)
 * 4) Stats refresh for floors/volume
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

/** How often to hit OpenSea for floors / volume (ms). */
export const OPENSEA_STATS_INTERVAL_MS = 2000
/** Events are heavier — poll less often when key present. */
export const OPENSEA_EVENTS_INTERVAL_MS = 8000
/** Re-discover full RH catalog */
export const DISCOVER_INTERVAL_MS = 10 * 60_000

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

function mergeBySlug(
  base: Collection[],
  extra: Collection[]
): Collection[] {
  const map = new Map<string, Collection>()
  for (const c of base) map.set(c.slug, c)
  for (const c of extra) {
    const prev = map.get(c.slug)
    if (!prev) {
      map.set(c.slug, c)
      continue
    }
    // Prefer richer image / higher volume / more items
    map.set(c.slug, {
      ...prev,
      ...c,
      image: c.image && !c.image.includes('dicebear') ? c.image : prev.image,
      banner:
        c.banner && !c.banner.includes('dicebear') ? c.banner : prev.banner,
      floorPrice: Math.max(c.floorPrice || 0, prev.floorPrice || 0) || c.floorPrice || prev.floorPrice,
      volume24h: Math.max(c.volume24h || 0, prev.volume24h || 0),
      volumeTotal: Math.max(c.volumeTotal || 0, prev.volumeTotal || 0),
      items: Math.max(c.items || 0, prev.items || 0),
      owners: Math.max(c.owners || 0, prev.owners || 0),
      contractAddress: c.contractAddress || prev.contractAddress,
      listedPct: c.listedPct ?? prev.listedPct,
    })
  }
  return Array.from(map.values())
}

export function useOpenSeaLive() {
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
    discovered: seed.length,
  })
  const busy = useRef(false)
  const eventsBusy = useRef(false)
  const discoverBusy = useRef(false)

  const catalog = useMemo(() => {
    let list = mergeBySlug(seed, discovered)
    list = mergeBySlug(list, indexerCols)
    return list
  }, [seed, discovered, indexerCols])

  const collections = useMemo(
    () => mergeOpenSeaPatches(catalog, patches),
    [catalog, patches]
  )

  const slugs = useMemo(
    () => collections.map((c) => c.slug).filter(Boolean),
    [collections]
  )

  /** Discover every RH collection + pull Fly catalog */
  const runDiscovery = useCallback(async () => {
    if (discoverBusy.current) return
    discoverBusy.current = true
    try {
      const tasks: Promise<void>[] = []

      // Fly indexer — all collections already pre-indexed for everyone
      if (hasIndexerUrl()) {
        tasks.push(
          fetchIndexerCollections().then((rows) => {
            if (!rows?.length) return
            setIndexerCols(rows.map(indexerRowToCollection))
          })
        )
      }

      // OpenSea full chain list (all collections, not just snapshot)
      tasks.push(
        fetchAllRobinhoodCollections({ maxPages: 40, pageSize: 100 }).then(
          (rows) => {
            if (!rows.length) return
            const mapped = rows.map((c) => collectionFromOpenSeaListItem(c))
            setDiscovered(mapped)
            setStatus((s) => ({
              ...s,
              discovered: mapped.length,
              live: true,
              lastOkAt: Date.now(),
            }))
          }
        )
      )

      await Promise.all(tasks)
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

  const refreshStats = useCallback(async () => {
    if (busy.current || slugs.length === 0) return
    busy.current = true
    setStatus((s) => ({ ...s, refreshing: true }))
    try {
      // Stats for top-volume + any missing floor first (cap to avoid rate limits)
      const ranked = [...collections]
        .filter((c) => c.source === 'opensea')
        .sort((a, b) => b.volume24h - a.volume24h)
      const needFloor = ranked.filter((c) => !c.floorPrice).slice(0, 30)
      const top = ranked.slice(0, 40)
      const batchSlugs = [
        ...new Set([...needFloor, ...top].map((c) => c.slug)),
      ].slice(0, 50)

      const next = await refreshManyOpenSeaStats(batchSlugs, 4)
      if (next.size > 0) {
        setPatches((prev) => {
          const merged = new Map(prev)
          for (const [slug, patch] of next) {
            merged.set(slug, { ...merged.get(slug), ...patch })
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
          // Keep live if we already have catalog
          live: s.live || seedSlugs.length > 0,
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
  }, [slugs, collections, seedSlugs.length])

  const refreshEvents = useCallback(async () => {
    if (!hasOpenSeaApiKey() || eventsBusy.current) return
    eventsBusy.current = true
    try {
      const ranked = [...collections]
        .filter((c) => c.source === 'opensea')
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, 6)

      const batches = await Promise.all(
        ranked.map(async (c) => {
          const events = await fetchCollectionEvents(c.slug, 12)
          return mapOpenSeaEventsToActivities(c.slug, c.id, events)
        })
      )
      const flat = batches
        .flat()
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
      if (flat.length) setOsActivities(flat)
    } catch {
      /* keep previous events */
    } finally {
      eventsBusy.current = false
    }
  }, [collections])

  // Discover full RH catalog once + periodically
  useEffect(() => {
    void runDiscovery()
    const id = window.setInterval(
      () => void runDiscovery(),
      DISCOVER_INTERVAL_MS
    )
    return () => window.clearInterval(id)
  }, [runDiscovery])

  // Stats loop
  useEffect(() => {
    void refreshStats()
    const id = window.setInterval(
      () => void refreshStats(),
      OPENSEA_STATS_INTERVAL_MS
    )
    return () => window.clearInterval(id)
  }, [refreshStats])

  // Events loop
  useEffect(() => {
    if (!hasOpenSeaApiKey()) return
    void refreshEvents()
    const id = window.setInterval(
      () => void refreshEvents(),
      OPENSEA_EVENTS_INTERVAL_MS
    )
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
