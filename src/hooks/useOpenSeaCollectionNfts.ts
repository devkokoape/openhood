/**
 * Collection inventory — listings-first (OpenSea best listings book).
 *
 * 1. Instant paint from IndexedDB cache when available
 * 2. Fetch ALL active best listings (not a few NFT pages) so listed % matches OpenSea
 * 3. Progressive image/name enrichment from the NFT endpoint
 * 4. Optional unlisted catalog pages via loadMore / loadAll
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Nft } from '../types'
import {
  cacheOpenSeaNfts,
  enrichNftsFromOpenSea,
  fetchAllBestListings,
  fetchOpenSeaCollectionNftsPage,
  mapOpenSeaNftToNft,
  nftsFromListings,
  type ParsedListing,
} from '../lib/opensea'
import {
  getCatalogCache,
  getCatalogCacheSync,
  isCatalogFresh,
  pricesFromEntries,
  pricesToEntries,
  putCatalogCache,
} from '../lib/catalogCache'

function applyPrices(nfts: Nft[], prices: Map<string, number>): Nft[] {
  return nfts.map((n) => {
    const p =
      prices.get(String(n.tokenId)) ??
      prices.get(n.id.split('-os-').pop() || '')
    if (p == null) return n
    return { ...n, listed: true, price: p }
  })
}

function mergeEnrichment(
  list: Nft[],
  patches: Map<string, Partial<Nft>>
): Nft[] {
  if (!patches.size) return list
  return list.map((n) => {
    const p = patches.get(String(n.tokenId))
    if (!p) return n
    return {
      ...n,
      name: p.name || n.name,
      image:
        p.image && !p.image.includes('dicebear')
          ? p.image
          : n.image,
      owner: p.owner || n.owner,
      rarityRank: p.rarityRank ?? n.rarityRank,
      traits: p.traits?.length ? p.traits : n.traits,
    }
  })
}

export function useOpenSeaCollectionNfts(
  slug: string | undefined,
  collectionId: string | undefined,
  enabled: boolean,
  opts?: {
    /** Collection display name for stub titles */
    namePrefix?: string
    fallbackImage?: string
    contractAddress?: string
    chain?: string
    totalSupply?: number
  }
) {
  const [nfts, setNfts] = useState<Nft[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [totalLoaded, setTotalLoaded] = useState(0)
  const [listedCount, setListedCount] = useState(0)
  const [fromCache, setFromCache] = useState(false)
  const [enriching, setEnriching] = useState(false)

  const nextRef = useRef<string | null>(null)
  const pricesRef = useRef<Map<string, number>>(new Map())
  const listingsRef = useRef<ParsedListing[]>([])
  const seenIds = useRef<Set<string>>(new Set())
  const abortGen = useRef(0)
  const unlistedMode = useRef(false)

  const reset = useCallback(() => {
    setNfts([])
    setError(null)
    setHasMore(false)
    setTotalLoaded(0)
    setListedCount(0)
    setFromCache(false)
    setRefreshing(false)
    setEnriching(false)
    nextRef.current = null
    pricesRef.current = new Map()
    listingsRef.current = []
    seenIds.current = new Set()
    unlistedMode.current = false
  }, [])

  const persist = useCallback(
    async (slugName: string, colId: string, list: Nft[], listed: number) => {
      await putCatalogCache({
        slug: slugName,
        collectionId: colId,
        nfts: list,
        next: nextRef.current,
        prices: pricesToEntries(pricesRef.current),
        listedCount: listed,
        updatedAt: Date.now(),
      })
    },
    []
  )

  // Listings-first load
  useEffect(() => {
    if (!enabled || !slug || !collectionId) {
      reset()
      return
    }

    const gen = ++abortGen.current
    let cancelled = false
    const signal = { cancelled: false }
    const colId = collectionId
    const slugName = slug
    const namePrefix = opts?.namePrefix ? `${opts.namePrefix} #` : '#'
    const fallbackImage = opts?.fallbackImage
    const contract = opts?.contractAddress
    const chain = opts?.chain || 'robinhood'

    ;(async () => {
      setError(null)
      seenIds.current = new Set()
      nextRef.current = null
      pricesRef.current = new Map()
      listingsRef.current = []
      unlistedMode.current = false

      // —— Instant cache ——
      let cacheHit = getCatalogCacheSync(slugName)
      if (!cacheHit) cacheHit = (await getCatalogCache(slugName)) ?? null
      if (cancelled || gen !== abortGen.current) return

      if (cacheHit?.nfts?.length) {
        pricesRef.current = pricesFromEntries(cacheHit.prices)
        nextRef.current = cacheHit.next
        for (const n of cacheHit.nfts) seenIds.current.add(n.id)
        setNfts(cacheHit.nfts)
        setTotalLoaded(cacheHit.nfts.length)
        setListedCount(
          cacheHit.listedCount ??
            cacheHit.nfts.filter((n) => n.listed).length
        )
        setHasMore(Boolean(cacheHit.next))
        setFromCache(true)
        setLoading(false)
        cacheOpenSeaNfts(cacheHit.nfts)

        if (isCatalogFresh(cacheHit) && (cacheHit.listedCount ?? 0) > 20) {
          // Soft revalidate listings count in background only
          setRefreshing(true)
          try {
            const listings = await fetchAllBestListings(slugName, {
              maxPages: 80,
              pageSize: 200,
            })
            if (cancelled || gen !== abortGen.current) return
            listingsRef.current = listings
            const prices = new Map(listings.map((L) => [L.tokenId, L.priceEth]))
            pricesRef.current = prices
            const built = nftsFromListings(listings, colId, {
              namePrefix,
              fallbackImage,
              contract,
            })
            // Preserve enriched images from cache
            const byId = new Map(cacheHit.nfts.map((n) => [n.id, n]))
            const merged = built.map((n) => {
              const prev = byId.get(n.id)
              if (!prev) return n
              return {
                ...n,
                image:
                  prev.image && !prev.image.includes('dicebear')
                    ? prev.image
                    : n.image,
                name: prev.name?.includes('#') && n.name ? n.name : prev.name || n.name,
                traits: prev.traits?.length > 2 ? prev.traits : n.traits,
                rarityRank: prev.rarityRank ?? n.rarityRank,
                owner:
                  prev.owner && prev.owner !== 'unknown' ? prev.owner : n.owner,
              }
            })
            for (const n of merged) seenIds.current.add(n.id)
            setNfts(merged)
            setListedCount(listings.length)
            setTotalLoaded(merged.length)
            cacheOpenSeaNfts(merged)
            await persist(slugName, colId, merged, listings.length)
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
        setListedCount(0)
        setFromCache(false)
        setLoading(true)
      }

      // —— Network: full listings book with progressive pages ——
      setRefreshing(true)
      try {
        const acc: ParsedListing[] = []
        const listings = await fetchAllBestListings(slugName, {
          maxPages: 80,
          pageSize: 200,
          onPage: (batch, total) => {
            if (cancelled || gen !== abortGen.current) return
            acc.push(...batch)
            listingsRef.current = [...acc]
            const prices = new Map(acc.map((L) => [L.tokenId, L.priceEth]))
            pricesRef.current = prices
            const built = nftsFromListings(acc, colId, {
              namePrefix,
              fallbackImage,
              contract,
            })
            for (const n of built) seenIds.current.add(n.id)
            setNfts(built)
            setListedCount(total)
            setTotalLoaded(built.length)
            setLoading(false)
            setFromCache(false)
            cacheOpenSeaNfts(built)
          },
        })

        if (cancelled || gen !== abortGen.current) return

        listingsRef.current = listings
        const prices = new Map(listings.map((L) => [L.tokenId, L.priceEth]))
        pricesRef.current = prices
        let built = nftsFromListings(listings, colId, {
          namePrefix,
          fallbackImage,
          contract,
        })
        seenIds.current = new Set(built.map((n) => n.id))
        setNfts(built)
        setListedCount(listings.length)
        setTotalLoaded(built.length)
        setLoading(false)
        cacheOpenSeaNfts(built)
        await persist(slugName, colId, built, listings.length)

        // —— Enrich images/names (first 120 fast, then rest) ——
        const contractAddr =
          contract || listings.find((L) => L.contract)?.contract
        if (contractAddr && listings.length > 0) {
          setEnriching(true)
          const items = listings.map((L) => ({
            tokenId: L.tokenId,
            chain: L.chain || chain,
            contract: L.contract || contractAddr,
          }))
          // Prioritize cheapest (visible first in price_asc)
          const enrichSignal = signal
          const applyPatches = (patches: Map<string, Partial<Nft>>) => {
            if (cancelled || gen !== abortGen.current) return
            setNfts((prev) => {
              const next = mergeEnrichment(prev, patches)
              cacheOpenSeaNfts(next)
              void persist(slugName, colId, next, listings.length)
              return next
            })
          }

          // Phase A: first 80 (visible grid)
          await enrichNftsFromOpenSea(items.slice(0, 80), colId, {
            chain,
            contract: contractAddr,
            concurrency: 10,
            signal: enrichSignal,
            onProgress: applyPatches,
          })
          if (cancelled || gen !== abortGen.current) return

          // Phase B: remainder in background
          if (items.length > 80) {
            void enrichNftsFromOpenSea(items.slice(80), colId, {
              chain,
              contract: contractAddr,
              concurrency: 6,
              signal: enrichSignal,
              onProgress: applyPatches,
            }).finally(() => {
              if (!cancelled && gen === abortGen.current) setEnriching(false)
            })
          } else {
            setEnriching(false)
          }
        }
      } catch (e) {
        if (!cancelled && gen === abortGen.current) {
          if (!getCatalogCacheSync(slugName)?.nfts?.length) {
            setError(e instanceof Error ? e.message : 'Failed to load listings')
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
      signal.cancelled = true
    }
  }, [
    enabled,
    slug,
    collectionId,
    reset,
    persist,
    opts?.namePrefix,
    opts?.fallbackImage,
    opts?.contractAddress,
    opts?.chain,
  ])

  /** Load unlisted / more catalog items beyond the listings book */
  const loadMore = useCallback(async () => {
    if (!enabled || !slug || !collectionId || loadingMore) return
    setLoadingMore(true)
    unlistedMode.current = true
    try {
      // Start NFT catalog cursor if needed
      let cursor = nextRef.current
      const page = await fetchOpenSeaCollectionNftsPage(slug, {
        limit: 50,
        next: cursor,
      })
      const mapped: Nft[] = []
      for (const raw of page.nfts) {
        const n = mapOpenSeaNftToNft(raw, collectionId, pricesRef.current)
        if (!n || seenIds.current.has(n.id)) continue
        // Skip if already shown as listed
        if (pricesRef.current.has(String(n.tokenId))) continue
        seenIds.current.add(n.id)
        mapped.push(n)
      }
      nextRef.current = page.next
      setNfts((prev) => {
        const next = applyPrices([...prev, ...mapped], pricesRef.current)
        setTotalLoaded(next.length)
        void putCatalogCache({
          slug,
          collectionId,
          nfts: next,
          next: nextRef.current,
          prices: pricesToEntries(pricesRef.current),
          listedCount,
          updatedAt: Date.now(),
        })
        return next
      })
      setHasMore(Boolean(page.next))
      cacheOpenSeaNfts(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load more failed')
    } finally {
      setLoadingMore(false)
    }
  }, [enabled, slug, collectionId, loadingMore, listedCount])

  const loadAll = useCallback(
    async (maxItems = 50_000) => {
      if (!enabled || !slug || !collectionId) return
      setLoadingMore(true)
      unlistedMode.current = true
      try {
        // Ensure we have listing book
        if (listingsRef.current.length === 0) {
          const listings = await fetchAllBestListings(slug, {
            maxPages: 80,
            pageSize: 200,
          })
          listingsRef.current = listings
          pricesRef.current = new Map(
            listings.map((L) => [L.tokenId, L.priceEth])
          )
          setListedCount(listings.length)
        }

        let cursor: string | null = nextRef.current
        // If never started catalog pagination, start from beginning but skip listed
        let guard = 0
        while (seenIds.current.size < maxItems && guard < 200) {
          guard++
          const page = await fetchOpenSeaCollectionNftsPage(slug, {
            limit: 50,
            next: cursor,
          })
          const mapped: Nft[] = []
          for (const raw of page.nfts) {
            const n = mapOpenSeaNftToNft(raw, collectionId, pricesRef.current)
            if (!n || seenIds.current.has(n.id)) continue
            seenIds.current.add(n.id)
            mapped.push(n)
          }
          cursor = page.next
          nextRef.current = page.next
          if (mapped.length) {
            setNfts((prev) => {
              // merge by id
              const map = new Map(prev.map((x) => [x.id, x]))
              for (const n of applyPrices(mapped, pricesRef.current)) {
                const existing = map.get(n.id)
                if (existing?.listed) {
                  map.set(n.id, {
                    ...n,
                    listed: true,
                    price: existing.price ?? n.price,
                    image:
                      existing.image && !existing.image.includes('dicebear')
                        ? existing.image
                        : n.image,
                  })
                } else {
                  map.set(n.id, n)
                }
              }
              const next = Array.from(map.values()).sort((a, b) => {
                // listed first by price, then unlisted
                if (a.listed && !b.listed) return -1
                if (!a.listed && b.listed) return 1
                return (a.price ?? 1e9) - (b.price ?? 1e9)
              })
              setTotalLoaded(next.length)
              return next
            })
            cacheOpenSeaNfts(mapped)
          }
          if (!page.next) break
          await new Promise((r) => setTimeout(r, 80))
        }
        setHasMore(Boolean(nextRef.current))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Load all failed')
      } finally {
        setLoadingMore(false)
      }
    },
    [enabled, slug, collectionId]
  )

  return {
    nfts,
    loading,
    refreshing,
    loadingMore,
    enriching,
    error,
    hasMore,
    totalLoaded,
    listedCount,
    fromCache,
    loadMore,
    loadAll,
    enabled,
  }
}
