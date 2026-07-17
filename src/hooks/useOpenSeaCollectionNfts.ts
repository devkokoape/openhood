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
  fillListedNftMetadata,
  mapOpenSeaEventsToActivities,
  mapOpenSeaNftToNft,
  mapOpenSeaOffersToOffers,
  nftNeedsMetadata,
  nftsFromListings,
  type ParsedListing,
} from '../lib/opensea'
// fillListedNftMetadata kept for non-indexer soft cache path
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
import {
  collectionNftsFirstPage,
  collectionNftsHardCap,
  enrichConcurrency,
  enrichWaveSize,
  preferLiteMode,
} from '../lib/device'

function applyPrices(nfts: Nft[], prices: Map<string, number>): Nft[] {
  return nfts.map((n) => {
    const p =
      prices.get(String(n.tokenId)) ??
      prices.get(n.id.split('-os-').pop() || '')
    if (p == null) return n
    return { ...n, listed: true, price: p }
  })
}

function hasUsefulTraits(
  traits?: { trait_type: string; value: string }[] | null
): boolean {
  if (!Array.isArray(traits) || !traits.length) return false
  return traits.some(
    (t) =>
      t?.trait_type &&
      t.trait_type !== 'Status' &&
      t.trait_type !== 'Token ID'
  )
}

function mergeEnrichment(
  list: Nft[],
  patches: Map<string, Partial<Nft>>
): Nft[] {
  if (!patches.size) return list
  return list.map((n) => {
    const p = patches.get(String(n.tokenId))
    if (!p) return n
    const nextImg =
      p.image &&
      !p.image.includes('dicebear') &&
      !p.image.startsWith('data:image/svg')
        ? p.image
        : n.image
    return {
      ...n,
      name: p.name || n.name,
      image: nextImg,
      owner: p.owner || n.owner,
      rarityRank: p.rarityRank ?? n.rarityRank,
      traits: hasUsefulTraits(p.traits)
        ? p.traits!
        : hasUsefulTraits(n.traits)
          ? n.traits
          : p.traits?.length
            ? p.traits
            : n.traits,
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
  /** Server-side book size (listed + unlisted), for "showing X of Y" */
  const [nftsTotal, setNftsTotal] = useState(
    () => initial?.listedCount ?? initial?.nfts?.length ?? 0
  )
  const [unlistedCount, setUnlistedCount] = useState(0)
  /** Marketplace filter: full book | buy-now | make-offer targets */
  const [scope, setScope] = useState<'all' | 'listed' | 'unlisted'>('all')
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const [fromCache, setFromCache] = useState(() => Boolean(initial?.nfts?.length))
  const [enriching, setEnriching] = useState(false)
  const [ready, setReady] = useState(() => Boolean(initial?.nfts?.length))
  /** True when client memory cap stops further Load more (server may still have more) */
  const [capped, setCapped] = useState(false)

  const nextRef = useRef<string | null>(null)
  const nftsTotalRef = useRef(0)
  nftsTotalRef.current = nftsTotal
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
          // lite=1 → lean payload (~first 120 listed) for fast first paint
          const firstLimit = collectionNftsFirstPage()
          const hardCap = collectionNftsHardCap()
          const remote = await fetchIndexerCollection(slugName, {
            lite: true,
            limit: firstLimit,
            scope: scopeRef.current,
          })
          if (cancelled || gen !== abortGen.current) return

          if (remote?.nfts?.length) {
            const mapRemote = (list: typeof remote.nfts) =>
              (list || []).map((n) => ({
                ...n,
                collectionId: colId,
                id: `${colId}-os-${n.tokenId}`,
                // Lite payloads omit traits — keep iterable for filters/rarity
                traits: Array.isArray(n.traits) ? n.traits : [],
                listed: Boolean(n.listed),
              }))

            let nftsMapped = mapRemote(remote.nfts).slice(0, hardCap)
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
            const prices = new Map<string, number>()
            for (const n of nftsMapped) {
              if (n.listed && n.price != null) prices.set(String(n.tokenId), n.price)
            }
            pricesRef.current = prices
            seenIds.current = new Set(nftsMapped.map((n) => n.id))
            setNfts(nftsMapped)
            setListedCount(
              remote.listedCount ??
                nftsMapped.filter((n) => n.listed).length
            )
            setUnlistedCount(
              (remote as { unlistedCount?: number }).unlistedCount ??
                nftsMapped.filter((n) => !n.listed).length
            )
            setTotalLoaded(nftsMapped.length)
            const totalOnServer =
              (remote as { nftsTotal?: number }).nftsTotal ||
              remote.listedCount ||
              nftsMapped.length
            setNftsTotal(totalOnServer)
            nftsTotalRef.current = totalOnServer
            // OpenSea-style: only first page; more via explicit Load more
            const serverHasMore = Boolean(
              (remote as { hasMore?: boolean }).hasMore
            )
            const moreOnServer =
              serverHasMore || nftsMapped.length < totalOnServer
            const underCap = nftsMapped.length < hardCap
            setHasMore(moreOnServer && underCap)
            setCapped(moreOnServer && !underCap)
            // Track Fly offset for loadMore
            nextRef.current = String(nftsMapped.length)
            setActivities(acts)
            setOffers(offs)
            activitiesRef.current = acts
            offersRef.current = offs
            setLoading(false)
            setReady(true)
            setFromCache(false)
            setRefreshing(false)
            const stubCount = nftsMapped.filter((n) =>
              nftNeedsMetadata(n, fallbackImage)
            ).length
            // Only enrich a small first screen — never pull the whole book
            const shouldEnrich =
              stubCount > 0 && stubCount >= Math.min(8, nftsMapped.length * 0.25)
            setEnriching(shouldEnrich)
            cacheOpenSeaNfts(nftsMapped)
            void persist({
              slug: slugName,
              collectionId: colId,
              nfts: nftsMapped,
              listedCount: remote.listedCount || nftsMapped.length,
              activities: acts,
              offers: offs,
            })

            // Light first-screen enrich only (ME/OpenSea paint prices first)
            if (shouldEnrich && !cancelled) {
              void (async () => {
                let working = nftsMapped
                try {
                  working = await fillListedNftMetadata(
                    slugName,
                    colId,
                    working,
                    {
                      maxPages: preferLiteMode() ? 2 : 4,
                      collectionImage: fallbackImage,
                      signal,
                      onProgress: (partial) => {
                        if (cancelled || gen !== abortGen.current) return
                        setNfts(partial.slice(0, hardCap))
                        setTotalLoaded(Math.min(partial.length, hardCap))
                        cacheOpenSeaNfts(partial)
                      },
                    }
                  )
                  if (cancelled || gen !== abortGen.current) return
                  working = working.slice(0, hardCap)
                  nftsMapped = working
                  setNfts(working)
                  cacheOpenSeaNfts(working)
                  void persist({
                    slug: slugName,
                    collectionId: colId,
                    nfts: working,
                    listedCount: remote.listedCount || working.length,
                    activities: acts,
                    offers: offs,
                  })
                } catch {
                  /* fall through to per-token */
                }

                const stubs = working.filter((n) =>
                  nftNeedsMetadata(n, fallbackImage)
                )
                const contractAddr =
                  contract ||
                  (remote as { contractAddress?: string }).contractAddress
                if (stubs.length && contractAddr && !cancelled) {
                  const waveN = enrichWaveSize()
                  const conc = enrichConcurrency()
                  const wave1 = stubs.slice(0, waveN)
                  const patches = await enrichNftsFromOpenSea(
                    wave1.map((n) => ({
                      tokenId: n.tokenId,
                      chain,
                      contract: contractAddr,
                    })),
                    colId,
                    {
                      chain,
                      contract: contractAddr,
                      concurrency: conc,
                      signal,
                      onProgress: (partial) => {
                        if (cancelled || gen !== abortGen.current) return
                        setNfts((prev) => {
                          const next = mergeEnrichment(prev, partial)
                          cacheOpenSeaNfts(next)
                          return next
                        })
                      },
                    }
                  )
                  if (cancelled || gen !== abortGen.current) return
                  if (patches.size) {
                    setNfts((prev) => {
                      const next = mergeEnrichment(prev, patches)
                      cacheOpenSeaNfts(next)
                      void persist({
                        slug: slugName,
                        collectionId: colId,
                        nfts: next,
                        listedCount: remote.listedCount || next.length,
                        activities: acts,
                        offers: offs,
                      })
                      return next
                    })
                  }
                  const more = preferLiteMode()
                    ? []
                    : stubs.slice(waveN, waveN + 80)
                  if (more.length) {
                    const p2 = await enrichNftsFromOpenSea(
                      more.map((n) => ({
                        tokenId: n.tokenId,
                        chain,
                        contract: contractAddr,
                      })),
                      colId,
                      {
                        chain,
                        contract: contractAddr,
                        concurrency: conc,
                        signal,
                      }
                    )
                    if (!cancelled && gen === abortGen.current && p2.size) {
                      setNfts((prev) => {
                        const next = mergeEnrichment(prev, p2)
                        cacheOpenSeaNfts(next)
                        return next
                      })
                    }
                  }
                }
                if (!cancelled && gen === abortGen.current) setEnriching(false)
              })()
            }

            // NO auto-pagination — OpenSea/ME style: user taps "Load more"
            // Optional light re-poll once for server art (not a loop)
            if (shouldEnrich && !cancelled) {
              void (async () => {
                await new Promise((r) => setTimeout(r, 8000))
                if (cancelled || gen !== abortGen.current) return
                const again = await fetchIndexerCollection(slugName, {
                  lite: true,
                  limit: firstLimit,
                  scope: scopeRef.current,
                })
                if (!again?.nfts?.length) return
                if (
                  (again as { unlistedCount?: number }).unlistedCount != null
                ) {
                  setUnlistedCount(
                    (again as { unlistedCount?: number }).unlistedCount || 0
                  )
                }
                if ((again as { nftsTotal?: number }).nftsTotal) {
                  setNftsTotal((again as { nftsTotal?: number }).nftsTotal!)
                }
                const mapped = mapRemote(again.nfts)
                setNfts((prevList) => {
                  const byTok = new Map(
                    prevList.map((n) => [String(n.tokenId), n])
                  )
                  for (const n of mapped) {
                    const prev = byTok.get(String(n.tokenId))
                    if (!prev) {
                      // Server may have catalog-filled new unlisted tokens
                      byTok.set(String(n.tokenId), n)
                      seenIds.current.add(n.id)
                      continue
                    }
                    if (
                      nftNeedsMetadata(prev, fallbackImage) &&
                      !nftNeedsMetadata(n, fallbackImage)
                    ) {
                      byTok.set(String(n.tokenId), {
                        ...prev,
                        ...n,
                        image: n.image || prev.image,
                        traits:
                          Array.isArray(n.traits) && n.traits.length > 2
                            ? n.traits
                            : prev.traits,
                        listed: n.listed ?? prev.listed,
                      })
                    }
                  }
                  const merged = Array.from(byTok.values())
                  cacheOpenSeaNfts(merged)
                  return merged
                })
                setEnriching(false)
              })()
            } else {
              setEnriching(false)
            }
            return
          }

          // Indexer returned empty / 202 indexing — short poll only
          if (remote?.indexing) {
            setLoading(true)
            for (let i = 0; i < 8 && !cancelled; i++) {
              await new Promise((r) => setTimeout(r, 1500))
              const again = await fetchIndexerCollection(slugName, {
                lite: true,
                limit: 120,
              })
              if (again?.nfts?.length) {
                const mapped = again.nfts.map((n) => ({
                  ...n,
                  collectionId: colId,
                  id: `${colId}-os-${n.tokenId}`,
                  traits: Array.isArray(n.traits) ? n.traits : [],
                }))
                setNfts(mapped)
                setListedCount(again.listedCount || mapped.length)
                setTotalLoaded(mapped.length)
                setLoading(false)
                setReady(true)
                setRefreshing(false)
                cacheOpenSeaNfts(mapped)
                void persist({
                  slug: slugName,
                  collectionId: colId,
                  nfts: mapped,
                  listedCount: again.listedCount || mapped.length,
                })
                return
              }
            }
            setLoading(false)
            setReady(true)
            setRefreshing(false)
            // fall through to browser path only if still empty
          }
        }

        // 3) Local cache only (no Fly / soft refresh) — keep light
        if (softOnly && hadCache) {
          setRefreshing(false)
          setLoading(false)
          setReady(true)
          // Only small per-token enrich if no indexer (never 100+ catalog pages)
          if (!hasIndexerUrl() && contract) {
            const stubs = store!.nfts.filter((n) =>
              nftNeedsMetadata(n, fallbackImage)
            )
            if (stubs.length) {
              setEnriching(true)
              void enrichNftsFromOpenSea(
                stubs.slice(0, 30).map((n) => ({
                  tokenId: n.tokenId,
                  chain,
                  contract,
                })),
                colId,
                { chain, contract, concurrency: 5 }
              ).then((patches) => {
                if (cancelled || gen !== abortGen.current || !patches.size) return
                setNfts((prev) => {
                  const next = mergeEnrichment(prev, patches)
                  cacheOpenSeaNfts(next)
                  return next
                })
                setEnriching(false)
              })
            }
          }
          return
        }

        const [listings, events, offerRows] = await Promise.all([
          fetchAllBestListings(slugName, {
            maxPages: preferLiteMode() ? 12 : 40,
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

          // Bulk fill art/names via collection NFT catalog pages (50/request)
          // Cap pages hard on mobile to avoid multi-MB state
          setEnriching(true)
          built = await fillListedNftMetadata(slugName, colId, built, {
            maxPages: preferLiteMode() ? 8 : 40,
            collectionImage: fallbackImage,
            signal,
            onProgress: (partial) => {
              if (cancelled || gen !== abortGen.current) return
              setNfts(partial)
              setTotalLoaded(partial.length)
              cacheOpenSeaNfts(partial)
            },
          })
          if (cancelled || gen !== abortGen.current) return

          setNfts(built)
          cacheOpenSeaNfts(built)
          await persist({
            slug: slugName,
            collectionId: colId,
            nfts: built,
            listedCount: listings.length,
            activities: mappedActs,
            offers: mappedOffers,
          })

          // Remaining stubs → individual OpenSea NFT calls
          const stillMissing = built.filter((n) =>
            nftNeedsMetadata(n, fallbackImage)
          )
          const contractAddr =
            contract || listings.find((L) => L.contract)?.contract
          if (stillMissing.length > 0 && contractAddr) {
            const items = stillMissing
              .slice(0, enrichWaveSize() * 2)
              .map((n) => ({
                tokenId: n.tokenId,
                chain: chain,
                contract: contractAddr,
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
            await enrichNftsFromOpenSea(items, colId, {
              chain,
              contract: contractAddr,
              concurrency: enrichConcurrency(),
              signal,
              onProgress: applyPatches,
            })
          }
          if (!cancelled && gen === abortGen.current) setEnriching(false)
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
    // Re-run when collection identity or market scope (all/listed/unlisted) changes
  }, [enabled, slug, collectionId, persist, scope])

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

  /** OpenSea/ME style: append one more page (Fly offset preferred). */
  const loadMore = useCallback(async () => {
    if (!enabled || !slug || !collectionId || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const hardCap = collectionNftsHardCap()
      const pageSize = collectionNftsFirstPage()

      if (hasIndexerUrl()) {
        const offset = Math.max(
          Number(nextRef.current || 0),
          seenIds.current.size
        )
        if (seenIds.current.size >= hardCap) {
          setHasMore(false)
          setCapped(true)
          return
        }
        const take = Math.min(pageSize, hardCap - seenIds.current.size)
        const page = await fetchIndexerCollection(slug, {
          lite: true,
          limit: take,
          offset,
          scope: scopeRef.current,
        })
        if (!page) {
          setError('Could not load more items. Try again.')
          return
        }
        const totalOnServer =
          (page as { nftsTotal?: number }).nftsTotal ||
          page.listedCount ||
          nftsTotalRef.current ||
          0
        if (totalOnServer > 0) {
          setNftsTotal(totalOnServer)
          nftsTotalRef.current = totalOnServer
        }
        if (page.listedCount != null) setListedCount(page.listedCount)
        if ((page as { unlistedCount?: number }).unlistedCount != null) {
          setUnlistedCount(
            (page as { unlistedCount?: number }).unlistedCount || 0
          )
        }

        const raw = page.nfts || []
        if (raw.length === 0) {
          // End of book (or bad offset) — stop; keep what we already have
          setHasMore(false)
          setCapped(
            totalOnServer > 0 && seenIds.current.size < totalOnServer
          )
          return
        }
        const mapped = raw.map((n) => ({
          ...n,
          collectionId,
          id: `${collectionId}-os-${n.tokenId}`,
          traits: Array.isArray(n.traits) ? n.traits : [],
          listed: Boolean(n.listed),
        }))
        const fresh = mapped.filter((n) => !seenIds.current.has(n.id))
        for (const n of fresh) seenIds.current.add(n.id)

        let nextLen = 0
        setNfts((prev) => {
          const next = [...prev, ...fresh].slice(0, hardCap)
          nextLen = next.length
          setTotalLoaded(next.length)
          void persist({
            slug,
            collectionId,
            nfts: next,
            listedCount: page.listedCount || listedCount,
          })
          return next
        })

        // Advance offset by what the server returned (even if some were dupes)
        const advanced = offset + raw.length
        nextRef.current = String(Math.max(advanced, seenIds.current.size))

        const serverHasMore =
          (page as { hasMore?: boolean }).hasMore === true ||
          (totalOnServer > 0 && advanced < totalOnServer)
        const underCap = nextLen < hardCap && seenIds.current.size < hardCap
        setHasMore(Boolean(underCap && serverHasMore))
        setCapped(
          Boolean(
            !underCap &&
              (serverHasMore ||
                (totalOnServer > 0 && seenIds.current.size < totalOnServer))
          )
        )
        if (fresh.length) cacheOpenSeaNfts(fresh)
        return
      }

      const osNext =
        nextRef.current && !/^\d+$/.test(nextRef.current)
          ? nextRef.current
          : null
      const page = await fetchOpenSeaCollectionNftsPage(slug, {
        limit: pageSize,
        next: osNext,
      })
      const mapped: Nft[] = []
      for (const raw of page.nfts) {
        const n = mapOpenSeaNftToNft(raw, collectionId, pricesRef.current)
        if (!n || seenIds.current.has(n.id)) continue
        seenIds.current.add(n.id)
        mapped.push(n)
      }
      nextRef.current = page.next
      let nextLen = 0
      setNfts((prev) => {
        const next = applyPrices([...prev, ...mapped], pricesRef.current).slice(
          0,
          hardCap
        )
        nextLen = next.length
        setTotalLoaded(next.length)
        void persist({
          slug,
          collectionId,
          nfts: next,
          listedCount,
        })
        return next
      })
      const underCap = nextLen < hardCap
      setHasMore(Boolean(page.next) && underCap)
      setCapped(Boolean(page.next) && !underCap)
      cacheOpenSeaNfts(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load more failed')
    } finally {
      setLoadingMore(false)
    }
  }, [enabled, slug, collectionId, loadingMore, listedCount, persist])

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

  /** Switch All / Listed / Not listed — resets and reloads from Fly */
  const setMarketScope = useCallback(
    (next: 'all' | 'listed' | 'unlisted') => {
      if (next === scopeRef.current) return
      scopeRef.current = next
      setScope(next)
      setNfts([])
      setHasMore(false)
      setCapped(false)
      setTotalLoaded(0)
      setLoading(true)
      seenIds.current = new Set()
      nextRef.current = '0'
      // Trigger main effect by bumping via identity — effect deps include scope
    },
    []
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
    capped,
    totalLoaded,
    listedCount,
    unlistedCount,
    nftsTotal,
    scope,
    setMarketScope,
    fromCache,
    ready,
    loadMore,
    replaceNfts,
    enabled,
  }
}
