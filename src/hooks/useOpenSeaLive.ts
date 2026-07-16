/**
 * Live OpenSea Robinhood data — polls continuously so floors/volume stay fresh.
 *
 * Default tick: 1s (stats batch). Events (needs API key) every 5s.
 * Local dev uses Vite `/opensea-api` proxy (keyless stats).
 * Production needs VITE_OPENSEA_API_KEY for browser Origin requests.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Activity, Collection } from '../types'
import {
  collectionsFromOpenSeaSnapshot,
  fetchCollectionEvents,
  hasOpenSeaApiKey,
  mapOpenSeaEventsToActivities,
  mergeOpenSeaPatches,
  openSeaBaseUrl,
  refreshManyOpenSeaStats,
  robinhoodOpenSeaSlugs,
} from '../lib/opensea'

/** How often to hit OpenSea for floors / volume (ms). */
export const OPENSEA_STATS_INTERVAL_MS = 1000
/** Events are heavier — poll less often when key present. */
export const OPENSEA_EVENTS_INTERVAL_MS = 5000

export type OpenSeaLiveStatus = {
  live: boolean
  lastOkAt: number | null
  lastError: string | null
  tick: number
  usingProxy: boolean
  hasApiKey: boolean
  refreshing: boolean
}

export function useOpenSeaLive() {
  const seed = useMemo(() => collectionsFromOpenSeaSnapshot(), [])
  const slugs = useMemo(() => robinhoodOpenSeaSlugs(), [])
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
  })
  const busy = useRef(false)
  const eventsBusy = useRef(false)

  const collections = useMemo(
    () => mergeOpenSeaPatches(seed, patches),
    [seed, patches]
  )

  const refreshStats = useCallback(async () => {
    if (busy.current || slugs.length === 0) return
    busy.current = true
    setStatus((s) => ({ ...s, refreshing: true }))
    try {
      const next = await refreshManyOpenSeaStats(slugs, 4)
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
          live: false,
          lastError:
            'OpenSea returned no data. Add VITE_OPENSEA_API_KEY for live browser access, or use npm run dev (proxy).',
          refreshing: false,
          hasApiKey: hasOpenSeaApiKey(),
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
  }, [slugs])

  const refreshEvents = useCallback(async () => {
    if (!hasOpenSeaApiKey() || eventsBusy.current) return
    eventsBusy.current = true
    try {
      // Top collections by current volume
      const ranked = [...collections]
        .filter((c) => c.source === 'opensea')
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, 5)

      const batches = await Promise.all(
        ranked.map(async (c) => {
          const events = await fetchCollectionEvents(c.slug, 12)
          return mapOpenSeaEventsToActivities(c.slug, c.id, events)
        })
      )
      const flat = batches.flat().sort(
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

  // Initial + 1s stats loop
  useEffect(() => {
    void refreshStats()
    const id = window.setInterval(() => void refreshStats(), OPENSEA_STATS_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [refreshStats])

  // Events loop (API key)
  useEffect(() => {
    if (!hasOpenSeaApiKey()) return
    void refreshEvents()
    const id = window.setInterval(
      () => void refreshEvents(),
      OPENSEA_EVENTS_INTERVAL_MS
    )
    return () => window.clearInterval(id)
  }, [refreshEvents])

  // Refresh when tab becomes visible
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshStats()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refreshStats])

  return {
    openSeaCollections: collections,
    openSeaActivities: osActivities,
    openSeaStatus: status,
    refreshOpenSea: refreshStats,
  }
}
