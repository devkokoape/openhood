/**
 * Load full OpenSea collection NFT catalog with pagination + listing prices.
 * Replaces the old hardcoded 18 mock items per collection.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Nft } from '../types'
import {
  cacheOpenSeaNfts,
  fetchOpenSeaBestListingPrices,
  fetchOpenSeaCollectionNftsPage,
  mapOpenSeaNftToNft,
} from '../lib/opensea'

const PAGE_SIZE = 50
/** Pages to fetch on first open (50 × 4 = 200 items immediately) */
const INITIAL_PAGES = 4

export function useOpenSeaCollectionNfts(
  slug: string | undefined,
  collectionId: string | undefined,
  enabled: boolean
) {
  const [nfts, setNfts] = useState<Nft[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [totalLoaded, setTotalLoaded] = useState(0)

  const nextRef = useRef<string | null>(null)
  const pricesRef = useRef<Map<string, number>>(new Map())
  const seenIds = useRef<Set<string>>(new Set())
  const abortGen = useRef(0)

  const reset = useCallback(() => {
    setNfts([])
    setError(null)
    setHasMore(false)
    setTotalLoaded(0)
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

  // Initial load when collection changes
  useEffect(() => {
    if (!enabled || !slug || !collectionId) {
      reset()
      return
    }

    const gen = ++abortGen.current
    let cancelled = false

    ;(async () => {
      setLoading(true)
      setError(null)
      setNfts([])
      seenIds.current = new Set()
      nextRef.current = null

      try {
        // Listing prices in parallel with first NFT page
        const [prices] = await Promise.all([
          fetchOpenSeaBestListingPrices(slug, 6).catch(() => new Map<string, number>()),
        ])
        if (cancelled || gen !== abortGen.current) return
        pricesRef.current = prices

        const all: Nft[] = []
        let cursor: string | null = null
        for (let i = 0; i < INITIAL_PAGES; i++) {
          const { mapped, next } = await appendPage(cursor, collectionId, slug)
          if (cancelled || gen !== abortGen.current) return
          all.push(...mapped)
          cursor = next
          if (!next) break
        }

        // Re-apply prices in case listings arrived / update listed flags
        const withPrices = all.map((n) => {
          const tid = String(n.tokenId)
          // token id in map may be full identifier string
          const p =
            pricesRef.current.get(tid) ??
            pricesRef.current.get(n.id.split('-os-').pop() || '')
          if (p == null) return n
          return { ...n, listed: true, price: p }
        })

        setNfts(withPrices)
        cacheOpenSeaNfts(withPrices)
        setTotalLoaded(withPrices.length)
        setHasMore(Boolean(nextRef.current))
      } catch (e) {
        if (!cancelled && gen === abortGen.current) {
          setError(e instanceof Error ? e.message : 'Failed to load NFTs')
        }
      } finally {
        if (!cancelled && gen === abortGen.current) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, slug, collectionId, reset, appendPage])

  const loadMore = useCallback(async () => {
    if (!enabled || !slug || !collectionId || !nextRef.current || loadingMore) return
    setLoadingMore(true)
    try {
      const { mapped } = await appendPage(nextRef.current, collectionId, slug)
      // Apply known listing prices
      const priced = mapped.map((n) => {
        const p = pricesRef.current.get(String(n.tokenId))
        return p != null ? { ...n, listed: true, price: p } : n
      })
      setNfts((prev) => {
        const next = [...prev, ...priced]
        cacheOpenSeaNfts(priced)
        setTotalLoaded(next.length)
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
          const priced = mapped.map((n) => {
            const p = pricesRef.current.get(String(n.tokenId))
            return p != null ? { ...n, listed: true, price: p } : n
          })
          setNfts((prev) => {
            const next = [...prev, ...priced]
            setTotalLoaded(next.length)
            return next
          })
          cacheOpenSeaNfts(priced)
          if (!nextRef.current) break
          // brief pause to stay friendly to rate limits
          await new Promise((r) => setTimeout(r, 120))
        }
        setHasMore(Boolean(nextRef.current))
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
    loadingMore,
    error,
    hasMore,
    totalLoaded,
    loadMore,
    loadAll,
    enabled,
  }
}
