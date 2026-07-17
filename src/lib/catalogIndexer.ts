/**
 * Background collection catalog indexer.
 * Prefetches OpenSea NFT pages + listing prices into local cache so
 * collection pages open instantly instead of waiting 30–40s on demand.
 */
import type { Collection, Nft } from '../types'
import {
  cacheOpenSeaNfts,
  fetchOpenSeaBestListingPrices,
  fetchOpenSeaCollectionNftsPage,
  mapOpenSeaNftToNft,
} from './opensea'
import {
  getCatalogCache,
  isCatalogFresh,
  pricesToEntries,
  putCatalogCache,
  type CatalogCacheEntry,
} from './catalogCache'

/** Pages of NFTs to pre-index (50 each). 4 × 50 = 200 items ready on open. */
const PREFETCH_NFT_PAGES = 4
/** Listing price pages during background index. */
const PREFETCH_LISTING_PAGES = 3
/** How many collections to warm on app load (top by volume). */
const PREFETCH_TOP_N = 18
/** Delay between collections to stay friendly to OpenSea rate limits. */
const GAP_MS = 450

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

function applyPrices(nfts: Nft[], prices: Map<string, number>): Nft[] {
  return nfts.map((n) => {
    const p =
      prices.get(String(n.tokenId)) ??
      prices.get(n.id.split('-os-').pop() || '')
    if (p == null) return n
    return { ...n, listed: true, price: p }
  })
}

/**
 * Fetch NFT catalog + listing prices for one collection and persist.
 * Dedupes concurrent calls for the same slug.
 */
export async function indexCollectionCatalog(
  slug: string,
  collectionId: string,
  opts?: {
    nftPages?: number
    listingPages?: number
    /** If true, skip network when cache is still fresh */
    skipIfFresh?: boolean
  }
): Promise<CatalogCacheEntry | null> {
  const nftPages = opts?.nftPages ?? PREFETCH_NFT_PAGES
  const listingPages = opts?.listingPages ?? PREFETCH_LISTING_PAGES

  if (opts?.skipIfFresh !== false) {
    const existing = await getCatalogCache(slug)
    if (isCatalogFresh(existing)) return existing
  }

  const existingInflight = inflight.get(slug)
  if (existingInflight) return existingInflight

  const work = (async (): Promise<CatalogCacheEntry | null> => {
    try {
      // Wave 1: first NFT page + listing prices in parallel (fast first paint path)
      const [prices, first] = await Promise.all([
        fetchOpenSeaBestListingPrices(slug, listingPages),
        fetchOpenSeaCollectionNftsPage(slug, { limit: 50 }),
      ])

      const seen = new Set<string>()
      const all: Nft[] = []
      let next = first.next

      for (const raw of first.nfts) {
        const n = mapOpenSeaNftToNft(raw, collectionId, prices)
        if (!n || seen.has(n.id)) continue
        seen.add(n.id)
        all.push(n)
      }

      // Remaining NFT pages
      for (let i = 1; i < nftPages && next; i++) {
        const page = await fetchOpenSeaCollectionNftsPage(slug, {
          limit: 50,
          next,
        })
        for (const raw of page.nfts) {
          const n = mapOpenSeaNftToNft(raw, collectionId, prices)
          if (!n || seen.has(n.id)) continue
          seen.add(n.id)
          all.push(n)
        }
        next = page.next
        if (!page.next) break
      }

      const withPrices = applyPrices(all, prices)
      cacheOpenSeaNfts(withPrices)

      const entry: CatalogCacheEntry = {
        slug,
        collectionId,
        nfts: withPrices,
        next,
        prices: pricesToEntries(prices),
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
          nftPages: PREFETCH_NFT_PAGES,
          listingPages: PREFETCH_LISTING_PAGES,
          skipIfFresh: true,
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
  collectionId: string
): Promise<CatalogCacheEntry | null> {
  return indexCollectionCatalog(slug, collectionId, {
    nftPages: PREFETCH_NFT_PAGES,
    listingPages: PREFETCH_LISTING_PAGES,
    skipIfFresh: false,
  })
}
