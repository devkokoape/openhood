/**
 * Background collection catalog indexer.
 * Prefetches OpenSea NFT pages + listing prices into local cache so
 * collection pages open instantly instead of waiting 30–40s on demand.
 */
import type { Collection } from '../types'
import {
  cacheOpenSeaNfts,
  enrichNftsFromOpenSea,
  fetchAllBestListings,
  nftsFromListings,
} from './opensea'
import {
  getCatalogCache,
  isCatalogFresh,
  pricesToEntries,
  putCatalogCache,
  type CatalogCacheEntry,
} from './catalogCache'

/** How many collections to warm on app load (top by volume). */
const PREFETCH_TOP_N = 12
/** Enrich first N listed images during background warm (rest on open). */
const PREFETCH_ENRICH = 40
/** Delay between collections to stay friendly to OpenSea rate limits. */
const GAP_MS = 600

type IndexStatus = {
  running: boolean
  queued: number
  done: number
  currentSlug: string | null
  lastError: string | null
}

type Listener = (s: IndexStatus) => void

const listeners = new Set<Listener>()
let status: IndexStatus = {
  running: false,
  queued: 0,
  done: 0,
  currentSlug: null,
  lastError: null,
}

/** In-flight network fetches by slug (shared with page hook). */
const inflight = new Map<string, Promise<CatalogCacheEntry | null>>()

function setStatus(patch: Partial<IndexStatus>) {
  status = { ...status, ...patch }
  for (const l of listeners) l(status)
}

export function getCatalogIndexStatus(): IndexStatus {
  return status
}

export function onCatalogIndexStatus(cb: Listener): () => void {
  listeners.add(cb)
  cb(status)
  return () => listeners.delete(cb)
}

/**
 * Index full best-listings book for a collection (+ partial image enrich).
 * Dedupes concurrent calls for the same slug.
 */
export async function indexCollectionCatalog(
  slug: string,
  collectionId: string,
  opts?: {
    /** @deprecated listings-first ignores NFT page count */
    nftPages?: number
    listingPages?: number
    /** If true, skip network when cache is still fresh */
    skipIfFresh?: boolean
    namePrefix?: string
    fallbackImage?: string
    contractAddress?: string
    chain?: string
  }
): Promise<CatalogCacheEntry | null> {
  if (opts?.skipIfFresh !== false) {
    const existing = await getCatalogCache(slug)
    // Require a real listings book (not the old 4-item cache)
    if (isCatalogFresh(existing) && (existing?.listedCount ?? 0) > 20) {
      return existing
    }
  }

  const existingInflight = inflight.get(slug)
  if (existingInflight) return existingInflight

  const work = (async (): Promise<CatalogCacheEntry | null> => {
    try {
      const listings = await fetchAllBestListings(slug, {
        maxPages: opts?.listingPages ? Math.max(opts.listingPages, 40) : 80,
        pageSize: 200,
      })
      const prices = new Map(listings.map((L) => [L.tokenId, L.priceEth]))
      let built = nftsFromListings(listings, collectionId, {
        namePrefix: opts?.namePrefix ? `${opts.namePrefix} #` : '#',
        fallbackImage: opts?.fallbackImage,
        contract: opts?.contractAddress,
      })

      const contract =
        opts?.contractAddress || listings.find((L) => L.contract)?.contract
      if (contract && built.length > 0) {
        const patches = await enrichNftsFromOpenSea(
          listings.slice(0, PREFETCH_ENRICH).map((L) => ({
            tokenId: L.tokenId,
            chain: L.chain || opts?.chain || 'robinhood',
            contract: L.contract || contract,
          })),
          collectionId,
          {
            chain: opts?.chain || 'robinhood',
            contract,
            concurrency: 8,
          }
        )
        if (patches.size) {
          built = built.map((n) => {
            const p = patches.get(String(n.tokenId))
            if (!p) return n
            return {
              ...n,
              name: p.name || n.name,
              image: p.image || n.image,
              owner: p.owner || n.owner,
              rarityRank: p.rarityRank ?? n.rarityRank,
              traits: p.traits?.length ? p.traits : n.traits,
            }
          })
        }
      }

      cacheOpenSeaNfts(built)
      const entry: CatalogCacheEntry = {
        slug,
        collectionId,
        nfts: built,
        next: null,
        prices: pricesToEntries(prices),
        listedCount: listings.length,
        updatedAt: Date.now(),
      }
      await putCatalogCache(entry)
      return entry
    } catch (e) {
      setStatus({
        lastError: e instanceof Error ? e.message : 'Catalog index failed',
      })
      return null
    } finally {
      inflight.delete(slug)
    }
  })()

  inflight.set(slug, work)
  return work
}

/**
 * Warm top OpenSea collections into IndexedDB in the background.
 * Safe to call multiple times; only one runner at a time.
 */
let runner: Promise<void> | null = null

export function startBackgroundCatalogIndex(
  collections: Collection[]
): Promise<void> {
  if (runner) return runner

  const targets = [...collections]
    .filter((c) => c.source === 'opensea' && c.slug)
    .sort((a, b) => {
      // Prefer verified / high volume so users hit warm cache first
      const ra = a.risk === 'verified' ? 0 : a.risk === 'high_risk' ? 1 : 2
      const rb = b.risk === 'verified' ? 0 : b.risk === 'high_risk' ? 1 : 2
      if (ra !== rb) return ra - rb
      return b.volume24h - a.volume24h || b.volumeTotal - a.volumeTotal
    })
    .slice(0, PREFETCH_TOP_N)

  if (targets.length === 0) return Promise.resolve()

  runner = (async () => {
    setStatus({
      running: true,
      queued: targets.length,
      done: 0,
      currentSlug: null,
      lastError: null,
    })

    for (let i = 0; i < targets.length; i++) {
      const c = targets[i]
      setStatus({ currentSlug: c.slug, done: i })

      // Yield to UI / active page loads
      await new Promise((r) => setTimeout(r, i === 0 ? 80 : GAP_MS))

      try {
        await indexCollectionCatalog(c.slug, c.id, {
          skipIfFresh: true,
          namePrefix: c.name,
          fallbackImage: c.image,
          contractAddress: c.contractAddress,
          chain: c.chain || 'robinhood',
        })
      } catch {
        /* continue queue */
      }
    }

    setStatus({
      running: false,
      done: targets.length,
      currentSlug: null,
    })
    runner = null
  })()

  return runner
}

/** Prioritize a collection the user just opened (cancels "fresh skip"). */
export function prioritizeCollectionIndex(
  slug: string,
  collectionId: string,
  extra?: {
    namePrefix?: string
    fallbackImage?: string
    contractAddress?: string
    chain?: string
  }
): Promise<CatalogCacheEntry | null> {
  return indexCollectionCatalog(slug, collectionId, {
    skipIfFresh: false,
    ...extra,
  })
}
