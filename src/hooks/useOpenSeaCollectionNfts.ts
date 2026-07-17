/**
 * Collection NFT catalog — cache-first.
 *
 * 1. Paint immediately from IndexedDB / memory (pre-indexed in background)
 * 2. Revalidate from OpenSea without blanking the grid
 * 3. Progressive load: first page ASAP, then more pages
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Nft } from '../types'
import {
  cacheOpenSeaNfts,
  fetchOpenSeaBestListingPrices,
  fetchOpenSeaCollectionNftsPage,
  mapOpenSeaNftToNft,
} from '../lib/opensea'
import {
  getCatalogCache,
  getCatalogCacheSync,
  isCatalogFresh,
  pricesFromEntries,
  pricesToEntries,
  putCatalogCache,
} from '../lib/catalogCache'
import { indexCollectionCatalog } from '../lib/catalogIndexer'

const PAGE_SIZE = 50
/** Extra pages after the first (first is always fetched for progressive paint). */
const EXTRA_PAGES = 3

function applyPrices(nfts: Nft[], prices: Map<string, number>): Nft[] {
  return nfts.map((n) => {
    const p =
      prices.get(String(n.tokenId)) ??
      prices.get(n.id.split('-os-').pop() || '')
    if (p == null) return n
    return { ...n, listed: true, price: p }
  })
}

export function useOpenSeaCollectionNfts(
  slug: string | undefined,
  collectionId: string | undefined,
  enabled: boolean
) {
  const [nfts, setNfts] = useState<Nft[]>([])
  /** True only when we have nothing to show yet (cold open, no cache). */
  const [loading, setLoading] = useState(false)
  /** Quiet background revalidate / more pages while grid is already visible. */
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [totalLoaded, setTotalLoaded] = useState(0)
  const [fromCache, setFromCache] = useState(false)

  const nextRef = useRef<string | null>(null)
  const pricesRef = useRef<Map<string, number>>(new Map())
  const seenIds = useRef<Set<string>>(new Set())
  const abortGen = useRef(0)

  const reset = useCallback(() => {
    setNfts([])
    setError(null)
    setHasMore(false)
    setTotalLoaded(0)
    setFromCache(false)
    setRefreshing(false)
    nextRef.current = null
    pricesRef.current = new Map()
    seenIds.current = new Set()
  }, [])

  const appendPage = useCallback(
    async (cursor: string | null, colId: string, slugName: string) => {
      const page = await fetchOpenSeaCollectionNftsPage(slugName, {
        limit: PAGE_SIZE,
        next: cursor,
      })
      const mapped: Nft[] = []
      for (const raw of page.nfts) {
        const n = mapOpenSeaNftToNft(raw, colId, pricesRef.current)
        if (!n) continue
        if (seenIds.current.has(n.id)) continue
        seenIds.current.add(n.id)
        mapped.push(n)
      }
      cacheOpenSeaNfts(mapped)
      nextRef.current = page.next
      return { mapped, next: page.next }
    },
    []
  )

  const persist = useCallback(
    async (slugName: string, colId: string, list: Nft[]) => {
      await putCatalogCache({
        slug: slugName,
        collectionId: colId,
        nfts: list,
        next: nextRef.current,
        prices: pricesToEntries(pricesRef.current),
        updatedAt: Date.now(),
      })
    },
    []
  )

  // Initial load / collection change — cache first, then network
  useEffect(() => {
    if (!enabled || !slug || !collectionId) {
      reset()
      return
    }

    const gen = ++abortGen.current
    let cancelled = false
    const colId = collectionId
    const slugName = slug

    ;(async () => {
      setError(null)
      seenIds.current = new Set()
      nextRef.current = null
      pricesRef.current = new Map()

      // —— Instant: sync memory, then IndexedDB ——
      let cacheHit = getCatalogCacheSync(slugName)
      if (!cacheHit) {
        cacheHit = (await getCatalogCache(slugName)) ?? null
      }
      if (cancelled || gen !== abortGen.current) return

      if (cacheHit?.nfts?.length) {
        pricesRef.current = pricesFromEntries(cacheHit.prices)
        nextRef.current = cacheHit.next
        for (const n of cacheHit.nfts) seenIds.current.add(n.id)
        setNfts(cacheHit.nfts)
        setTotalLoaded(cacheHit.nfts.length)
        setHasMore(Boolean(cacheHit.next))
        setFromCache(true)
        setLoading(false)
        cacheOpenSeaNfts(cacheHit.nfts)

        // Fresh enough — still soft-refresh listings in background but skip full re-index
        if (isCatalogFresh(cacheHit)) {
          setRefreshing(true)
          try {
            const prices = await fetchOpenSeaBestListingPrices(slugName, 2)
            if (cancelled || gen !== abortGen.current) return
            if (prices.size) {
              pricesRef.current = prices
              const priced = applyPrices(cacheHit.nfts, prices)
              setNfts(priced)
              await persist(slugName, colId, priced)
            }
          } catch {
            /* keep cache */
          } finally {
            if (!cancelled && gen === abortGen.current) setRefreshing(false)
          }
          return
        }
      } else {
        setNfts([])
        setTotalLoaded(0)
        setFromCache(false)
        setLoading(true)
      }

      // —— Network: progressive first page, then fill ——
      setRefreshing(true)
      try {
        // Prefer shared indexer (dedupes with background warm)
        // For cold open we still want progressive paint, so do first page ourselves
        // then fill via indexCollectionCatalog or local loops.

        const [prices, first] = await Promise.all([
          fetchOpenSeaBestListingPrices(slugName, 2),
          fetchOpenSeaCollectionNftsPage(slugName, { limit: PAGE_SIZE }),
        ])
        if (cancelled || gen !== abortGen.current) return

        pricesRef.current = prices
        const firstMapped: Nft[] = []
        seenIds.current = new Set()
        for (const raw of first.nfts) {
          const n = mapOpenSeaNftToNft(raw, colId, prices)
          if (!n || seenIds.current.has(n.id)) continue
          seenIds.current.add(n.id)
          firstMapped.push(n)
        }
        nextRef.current = first.next

        const firstPriced = applyPrices(firstMapped, prices)
        setNfts(firstPriced)
        setTotalLoaded(firstPriced.length)
        setHasMore(Boolean(nextRef.current))
        setLoading(false)
        setFromCache(false)
        cacheOpenSeaNfts(firstPriced)
        void persist(slugName, colId, firstPriced)

        // Remaining pages (don't blank UI)
        const all = [...firstPriced]
        let cursor = nextRef.current
        for (let i = 0; i < EXTRA_PAGES && cursor; i++) {
          const { mapped, next } = await appendPage(cursor, colId, slugName)
          if (cancelled || gen !== abortGen.current) return
          const priced = applyPrices(mapped, pricesRef.current)
          all.push(...priced)
          cursor = next
          setNfts([...all])
          setTotalLoaded(all.length)
          setHasMore(Boolean(cursor))
          void persist(slugName, colId, all)
          if (!next) break
        }

        // Expand listing coverage (more pages) without blocking
        try {
          const morePrices = await fetchOpenSeaBestListingPrices(slugName, 4)
          if (cancelled || gen !== abortGen.current) return
          if (morePrices.size) {
            for (const [k, v] of morePrices) pricesRef.current.set(k, v)
            const priced = applyPrices(all, pricesRef.current)
            setNfts(priced)
            await persist(slugName, colId, priced)
          }
        } catch {
          /* ok */
        }
      } catch (e) {
        if (!cancelled && gen === abortGen.current) {
          // If we already showed cache, keep it
          if (!getCatalogCacheSync(slugName)?.nfts?.length) {
            setError(e instanceof Error ? e.message : 'Failed to load NFTs')
            // Last resort: full index helper
            const entry = await indexCollectionCatalog(slugName, colId, {
              skipIfFresh: false,
            })
            if (entry?.nfts?.length && !cancelled && gen === abortGen.current) {
              pricesRef.current = pricesFromEntries(entry.prices)
              nextRef.current = entry.next
              seenIds.current = new Set(entry.nfts.map((n) => n.id))
              setNfts(entry.nfts)
              setTotalLoaded(entry.nfts.length)
              setHasMore(Boolean(entry.next))
              setError(null)
            }
          }
        }
      } finally {
        if (!cancelled && gen === abortGen.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, slug, collectionId, reset, appendPage, persist])

  const loadMore = useCallback(async () => {
    if (!enabled || !slug || !collectionId || !nextRef.current || loadingMore) return
    setLoadingMore(true)
    try {
      const { mapped } = await appendPage(nextRef.current, collectionId, slug)
      const priced = applyPrices(mapped, pricesRef.current)
      setNfts((prev) => {
        const next = [...prev, ...priced]
        setTotalLoaded(next.length)
        void putCatalogCache({
          slug,
          collectionId,
          nfts: next,
          next: nextRef.current,
          prices: pricesToEntries(pricesRef.current),
          updatedAt: Date.now(),
        })
        return next
      })
      setHasMore(Boolean(nextRef.current))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load more failed')
    } finally {
      setLoadingMore(false)
    }
  }, [enabled, slug, collectionId, loadingMore, appendPage])

  /** Keep loading pages until exhausted or maxItems reached */
  const loadAll = useCallback(
    async (maxItems = 50_000) => {
      if (!enabled || !slug || !collectionId) return
      setLoadingMore(true)
      try {
        while (nextRef.current && seenIds.current.size < maxItems) {
          const { mapped } = await appendPage(nextRef.current, collectionId, slug)
          const priced = applyPrices(mapped, pricesRef.current)
          setNfts((prev) => {
            const next = [...prev, ...priced]
            setTotalLoaded(next.length)
            return next
          })
          cacheOpenSeaNfts(priced)
          if (!nextRef.current) break
          await new Promise((r) => setTimeout(r, 100))
        }
        setHasMore(Boolean(nextRef.current))
        setNfts((prev) => {
          void putCatalogCache({
            slug,
            collectionId,
            nfts: prev,
            next: nextRef.current,
            prices: pricesToEntries(pricesRef.current),
            updatedAt: Date.now(),
          })
          return prev
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Load all failed')
      } finally {
        setLoadingMore(false)
      }
    },
    [enabled, slug, collectionId, appendPage]
  )

  return {
    nfts,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    totalLoaded,
    fromCache,
    loadMore,
    loadAll,
    enabled,
  }
}
