/**
 * Collection market data — instant local hydrate + background OpenSea sync.
 *
 * On refresh: paints from localStorage/IndexedDB in the same tick (no "No items" flash).
 * Network never replaces a non-empty catalog with an empty response.
 * Loads listings + activity + offers together for light marketplace UX.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Activity, Nft, Offer } from '../types'
import {
  cacheOpenSeaNfts,
  enrichNftsFromOpenSea,
  fetchAllBestListings,
  fetchCollectionEvents,
  fetchCollectionOffers,
  fetchOpenSeaCollectionNftsPage,
  mapOpenSeaEventsToActivities,
  mapOpenSeaNftToNft,
  mapOpenSeaOffersToOffers,
  nftsFromListings,
  type ParsedListing,
} from '../lib/opensea'
import {
  getCollectionStore,
  getCollectionStoreSync,
  isCollectionFresh,
  pricesFromEntries,
  pricesToEntries,
  putCollectionStore,
} from '../lib/collectionStore'
import {
  fetchIndexerCollection,
  hasIndexerUrl,
} from '../lib/indexerApi'

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
        p.image && !p.image.includes('dicebear') ? p.image : n.image,
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
    namePrefix?: string
    fallbackImage?: string
    contractAddress?: string
    chain?: string
    totalSupply?: number
  }
) {
  // Sync hydrate so hard refresh never starts empty when we have local data
  const initial = slug ? getCollectionStoreSync(slug) : null

  const [nfts, setNfts] = useState<Nft[]>(() => initial?.nfts ?? [])
  const [activities, setActivities] = useState<Activity[]>(
    () => initial?.activities ?? []
  )
  const [offers, setOffers] = useState<Offer[]>(() => initial?.offers ?? [])
  const [loading, setLoading] = useState(
    () => Boolean(enabled && slug && !(initial?.nfts?.length))
  )
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [totalLoaded, setTotalLoaded] = useState(
    () => initial?.nfts?.length ?? 0
  )
  const [listedCount, setListedCount] = useState(
    () => initial?.listedCount ?? initial?.nfts?.filter((n) => n.listed).length ?? 0
  )
  const [fromCache, setFromCache] = useState(() => Boolean(initial?.nfts?.length))
  const [enriching, setEnriching] = useState(false)
  const [ready, setReady] = useState(() => Boolean(initial?.nfts?.length))

  const nextRef = useRef<string | null>(null)
  const pricesRef = useRef<Map<string, number>>(
    new Map(initial?.prices ? pricesFromEntries(initial.prices) : [])
  )
  const listingsRef = useRef<ParsedListing[]>([])
  const seenIds = useRef<Set<string>>(
    new Set((initial?.nfts ?? []).map((n) => n.id))
  )
  const abortGen = useRef(0)
  const optsRef = useRef(opts)
  optsRef.current = opts
  // Keep latest activities/offers for persist merges without re-running effect
  const activitiesRef = useRef(activities)
  const offersRef = useRef(offers)
  activitiesRef.current = activities
  offersRef.current = offers

  const persist = useCallback(
    async (partial: {
      slug: string
      collectionId: string
      nfts: Nft[]
      listedCount: number
      activities?: Activity[]
      offers?: Offer[]
    }) => {
      await putCollectionStore({
        slug: partial.slug,
        collectionId: partial.collectionId,
        nfts: partial.nfts,
        next: nextRef.current,
        prices: pricesToEntries(pricesRef.current),
        listedCount: partial.listedCount,
        activities: partial.activities ?? activitiesRef.current,
        offers: partial.offers ?? offersRef.current,
        updatedAt: Date.now(),
      })
    },
    []
  )

  useEffect(() => {
    if (!enabled || !slug || !collectionId) {
      return
    }

    const gen = ++abortGen.current
    let cancelled = false
    const signal = { cancelled: false }
    const colId = collectionId
    const slugName = slug

    const o = optsRef.current
    const namePrefix = o?.namePrefix ? `${o.namePrefix} #` : '#'
    const fallbackImage = o?.fallbackImage
    const contract = o?.contractAddress
    const chain = o?.chain || 'robinhood'

    ;(async () => {
      setError(null)

      // 1) Sync + IDB hydrate (instant)
      let store = getCollectionStoreSync(slugName)
      if (!store?.nfts?.length) {
        store = (await getCollectionStore(slugName)) ?? null
      }
      if (cancelled || gen !== abortGen.current) return

      if (store?.nfts?.length) {
        pricesRef.current = pricesFromEntries(store.prices)
        nextRef.current = store.next
        seenIds.current = new Set(store.nfts.map((n) => n.id))
        setNfts(store.nfts)
        setTotalLoaded(store.nfts.length)
        setListedCount(
          store.listedCount || store.nfts.filter((n) => n.listed).length
        )
        setActivities(store.activities || [])
        setOffers(store.offers || [])
        setFromCache(true)
        setLoading(false)
        setReady(true)
        cacheOpenSeaNfts(store.nfts)
      } else {
        setLoading(true)
      }

      const hadCache = Boolean(store?.nfts?.length)
      const softOnly = hadCache && isCollectionFresh(store)

      setRefreshing(true)
      listingsRef.current = []
      try {
        // 2) Fly indexer first (shared server cache — fast for everyone)
        if (hasIndexerUrl()) {
          const remote = await fetchIndexerCollection(slugName)
          if (cancelled || gen !== abortGen.current) return

          if (remote?.nfts?.length) {
            // Normalize ids to this app's collectionId (snapshot uses osN-slug)
            const nftsMapped = remote.nfts.map((n) => ({
              ...n,
              collectionId: colId,
              id: `${colId}-os-${n.tokenId}`,
            }))
            const acts = (remote.activities || []).map((a) => ({
              ...a,
              collectionId: colId,
              nftId: a.nftId
                ? `${colId}-os-${String(a.nftId).split('-os-').pop()}`
                : undefined,
            }))
            const offs = (remote.offers || []).map((o) => ({
              ...o,
              collectionId: colId,
              nftId: o.nftId
                ? `${colId}-os-${String(o.nftId).split('-os-').pop()}`
                : undefined,
            }))
            const prices = new Map(
              (remote.prices || []).map(([k, v]) => [String(k), Number(v)])
            )
            // Also derive prices from listed nfts
            for (const n of nftsMapped) {
              if (n.listed && n.price != null) prices.set(String(n.tokenId), n.price)
            }
            pricesRef.current = prices
            seenIds.current = new Set(nftsMapped.map((n) => n.id))
            setNfts(nftsMapped)
            setListedCount(remote.listedCount || nftsMapped.filter((n) => n.listed).length)
            setTotalLoaded(nftsMapped.length)
            setActivities(acts)
            setOffers(offs)
            activitiesRef.current = acts
            offersRef.current = offs
            setLoading(false)
            setReady(true)
            setFromCache(false)
            cacheOpenSeaNfts(nftsMapped)
            await persist({
              slug: slugName,
              collectionId: colId,
              nfts: nftsMapped,
              listedCount: remote.listedCount || nftsMapped.length,
              activities: acts,
              offers: offs,
            })

            // Soft success — skip heavy browser OpenSea crawl when server is warm
            if (!cancelled && gen === abortGen.current) {
              setLoading(false)
              setRefreshing(false)
              setReady(true)
            }
            return
          }
        }

        // 3) Fallback: browser OpenSea crawl (listings + events + offers)
        if (softOnly && hadCache) {
          // Quiet background refresh of activity only
          const [events, offerRows] = await Promise.all([
            fetchCollectionEvents(slugName, 50).catch(() => []),
            fetchCollectionOffers(slugName, 2).catch(() => []),
          ])
          if (cancelled || gen !== abortGen.current) return
          const mappedActs = mapOpenSeaEventsToActivities(slugName, colId, events)
          const mappedOffers = mapOpenSeaOffersToOffers(colId, offerRows)
          if (mappedActs.length) {
            setActivities(mappedActs)
            activitiesRef.current = mappedActs
          }
          if (mappedOffers.length) {
            setOffers(mappedOffers)
            offersRef.current = mappedOffers
          }
          await persist({
            slug: slugName,
            collectionId: colId,
            nfts: store!.nfts,
            listedCount: store!.listedCount || store!.nfts.length,
            activities: mappedActs,
            offers: mappedOffers,
          })
          return
        }

        const [listings, events, offerRows] = await Promise.all([
          fetchAllBestListings(slugName, {
            maxPages: 80,
            pageSize: 200,
            onPage: (batch, total) => {
              if (cancelled || gen !== abortGen.current) return
              if (hadCache && softOnly) return
              const accPrices = new Map(pricesRef.current)
              for (const L of batch) {
                const prev = accPrices.get(L.tokenId)
                if (prev == null || L.priceEth < prev) {
                  accPrices.set(L.tokenId, L.priceEth)
                }
              }
              pricesRef.current = accPrices
              listingsRef.current = [...listingsRef.current, ...batch]
              const built = nftsFromListings(listingsRef.current, colId, {
                namePrefix,
                fallbackImage,
                contract,
              })
              if (built.length === 0) return
              seenIds.current = new Set(built.map((n) => n.id))
              setNfts((prev) => {
                const byId = new Map(prev.map((n) => [n.id, n]))
                return built.map((n) => {
                  const old = byId.get(n.id)
                  if (!old) return n
                  return {
                    ...n,
                    image:
                      old.image && !old.image.includes('dicebear')
                        ? old.image
                        : n.image,
                    name: old.name || n.name,
                    traits: old.traits?.length > 2 ? old.traits : n.traits,
                  }
                })
              })
              setListedCount(total)
              setTotalLoaded(built.length)
              setLoading(false)
              setReady(true)
              setFromCache(false)
              cacheOpenSeaNfts(built)
            },
          }),
          fetchCollectionEvents(slugName, 50).catch(() => [] as Awaited<
            ReturnType<typeof fetchCollectionEvents>
          >),
          fetchCollectionOffers(slugName, 4).catch(() => [] as Awaited<
            ReturnType<typeof fetchCollectionOffers>
          >),
        ])

        if (cancelled || gen !== abortGen.current) return

        const mappedActs = mapOpenSeaEventsToActivities(slugName, colId, events)
        const mappedOffers = mapOpenSeaOffersToOffers(colId, offerRows)
        if (mappedActs.length) {
          setActivities(mappedActs)
          activitiesRef.current = mappedActs
        }
        if (mappedOffers.length) {
          setOffers(mappedOffers)
          offersRef.current = mappedOffers
        }

        if (listings.length === 0) {
          if (!hadCache) {
            setError('Could not load listings. Is the indexer or OpenSea key configured?')
          }
          await persist({
            slug: slugName,
            collectionId: colId,
            nfts: store?.nfts ?? [],
            listedCount: store?.listedCount ?? 0,
            activities: mappedActs.length ? mappedActs : store?.activities,
            offers: mappedOffers.length ? mappedOffers : store?.offers,
          })
        } else {
          listingsRef.current = listings
          const prices = new Map(listings.map((L) => [L.tokenId, L.priceEth]))
          pricesRef.current = prices
          let built = nftsFromListings(listings, colId, {
            namePrefix,
            fallbackImage,
            contract,
          })

          if (store?.nfts?.length) {
            const byId = new Map(store.nfts.map((n) => [n.id, n]))
            built = built.map((n) => {
              const prev = byId.get(n.id)
              if (!prev) return n
              return {
                ...n,
                image:
                  prev.image && !prev.image.includes('dicebear')
                    ? prev.image
                    : n.image,
                name:
                  prev.name && !prev.name.startsWith('#')
                    ? prev.name
                    : n.name,
                traits: prev.traits?.length > 2 ? prev.traits : n.traits,
                rarityRank: prev.rarityRank ?? n.rarityRank,
                owner:
                  prev.owner && prev.owner !== 'unknown'
                    ? prev.owner
                    : n.owner,
              }
            })
          }

          seenIds.current = new Set(built.map((n) => n.id))
          setNfts(built)
          setListedCount(listings.length)
          setTotalLoaded(built.length)
          setLoading(false)
          setReady(true)
          setFromCache(false)
          cacheOpenSeaNfts(built)

          await persist({
            slug: slugName,
            collectionId: colId,
            nfts: built,
            listedCount: listings.length,
            activities: mappedActs,
            offers: mappedOffers,
          })

          const contractAddr =
            contract || listings.find((L) => L.contract)?.contract
          if (contractAddr && listings.length > 0) {
            setEnriching(true)
            const items = listings.map((L) => ({
              tokenId: L.tokenId,
              chain: L.chain || chain,
              contract: L.contract || contractAddr,
            }))
            const applyPatches = (patches: Map<string, Partial<Nft>>) => {
              if (cancelled || gen !== abortGen.current) return
              setNfts((prev) => {
                const next = mergeEnrichment(prev, patches)
                cacheOpenSeaNfts(next)
                void persist({
                  slug: slugName,
                  collectionId: colId,
                  nfts: next,
                  listedCount: listings.length,
                })
                return next
              })
            }

            // Enrich first 120 for above-the-fold + early scroll; rest via useVisibleNftEnrich
            await enrichNftsFromOpenSea(items.slice(0, 120), colId, {
              chain,
              contract: contractAddr,
              concurrency: 10,
              signal,
              onProgress: applyPatches,
            })
            if (cancelled || gen !== abortGen.current) return

            if (items.length > 120) {
              void enrichNftsFromOpenSea(items.slice(120, 400), colId, {
                chain,
                contract: contractAddr,
                concurrency: 6,
                signal,
                onProgress: applyPatches,
              }).finally(() => {
                if (!cancelled && gen === abortGen.current) setEnriching(false)
              })
            } else {
              setEnriching(false)
            }
          }
        }
      } catch (e) {
        if (!cancelled && gen === abortGen.current) {
          if (!hadCache) {
            setError(e instanceof Error ? e.message : 'Failed to load collection')
          }
        }
      } finally {
        if (!cancelled && gen === abortGen.current) {
          setLoading(false)
          setRefreshing(false)
          setReady(true)
        }
      }
    })()

    return () => {
      cancelled = true
      signal.cancelled = true
    }
    // Only re-run when the collection identity changes — not when live stats tweak opts
  }, [enabled, slug, collectionId, persist])

  // When slug changes externally, re-hydrate sync store for new slug
  useEffect(() => {
    if (!slug || !enabled) return
    const s = getCollectionStoreSync(slug)
    if (s?.nfts?.length) {
      setNfts(s.nfts)
      setListedCount(s.listedCount || s.nfts.filter((n) => n.listed).length)
      setTotalLoaded(s.nfts.length)
      setActivities(s.activities || [])
      setOffers(s.offers || [])
      setFromCache(true)
      setLoading(false)
      setReady(true)
      pricesRef.current = pricesFromEntries(s.prices)
      seenIds.current = new Set(s.nfts.map((n) => n.id))
      cacheOpenSeaNfts(s.nfts)
    }
  }, [slug, enabled])

  const loadMore = useCallback(async () => {
    if (!enabled || !slug || !collectionId || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await fetchOpenSeaCollectionNftsPage(slug, {
        limit: 50,
        next: nextRef.current,
      })
      const mapped: Nft[] = []
      for (const raw of page.nfts) {
        const n = mapOpenSeaNftToNft(raw, collectionId, pricesRef.current)
        if (!n || seenIds.current.has(n.id)) continue
        if (pricesRef.current.has(String(n.tokenId))) continue
        seenIds.current.add(n.id)
        mapped.push(n)
      }
      nextRef.current = page.next
      setNfts((prev) => {
        const next = applyPrices([...prev, ...mapped], pricesRef.current)
        setTotalLoaded(next.length)
        void persist({
          slug,
          collectionId,
          nfts: next,
          listedCount,
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
  }, [enabled, slug, collectionId, loadingMore, listedCount, persist])

  const loadAll = useCallback(
    async (maxItems = 50_000) => {
      if (!enabled || !slug || !collectionId) return
      setLoadingMore(true)
      try {
        if (listingsRef.current.length === 0) {
          const listings = await fetchAllBestListings(slug, {
            maxPages: 80,
            pageSize: 200,
          })
          if (listings.length) {
            listingsRef.current = listings
            pricesRef.current = new Map(
              listings.map((L) => [L.tokenId, L.priceEth])
            )
            setListedCount(listings.length)
          }
        }

        let cursor: string | null = nextRef.current
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
                if (a.listed && !b.listed) return -1
                if (!a.listed && b.listed) return 1
                return (a.price ?? 1e9) - (b.price ?? 1e9)
              })
              setTotalLoaded(next.length)
              void persist({
                slug,
                collectionId,
                nfts: next,
                listedCount,
              })
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
    [enabled, slug, collectionId, listedCount, persist]
  )

  /** Replace catalog after progressive image enrich (scroll). */
  const replaceNfts = useCallback(
    (next: Nft[]) => {
      setNfts(next)
      setTotalLoaded(next.length)
      cacheOpenSeaNfts(next)
      if (slug && collectionId) {
        void persist({
          slug,
          collectionId,
          nfts: next,
          listedCount:
            listedCount || next.filter((n) => n.listed).length,
        })
      }
    },
    [slug, collectionId, listedCount, persist]
  )

  return {
    nfts,
    activities,
    offers,
    loading,
    refreshing,
    loadingMore,
    enriching,
    error,
    hasMore,
    totalLoaded,
    listedCount,
    fromCache,
    ready,
    loadMore,
    loadAll,
    replaceNfts,
    enabled,
  }
}
