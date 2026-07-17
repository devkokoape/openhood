/**
 * Instant local store for collection marketplace data.
 *
 * Layers:
 * 1. memory (sync, 0ms)
 * 2. localStorage lite snapshot (sync, ~0ms on refresh)
 * 3. IndexedDB full catalog (async, ~ms)
 *
 * Never overwrites a non-empty catalog with an empty network response.
 */
import type { Activity, Nft, Offer } from '../types'
import { cacheOpenSeaNfts } from './opensea'

// v7: bust stale caches that stored green dicebear stubs / empty traits
const DB_NAME = 'openhood-collection-v7'
const STORE = 'collections'
const DB_VERSION = 1
const LS_PREFIX = 'oh-col-v7:'
/** Keep localStorage lean so refresh is instant even for large books. */
const LITE_NFT_CAP = 240
const LITE_ACTIVITY_CAP = 80
const LITE_OFFER_CAP = 40

export interface CollectionStoreEntry {
  slug: string
  collectionId: string
  nfts: Nft[]
  next: string | null
  prices: [string, number][]
  listedCount: number
  activities: Activity[]
  offers: Offer[]
  updatedAt: number
}

const mem = new Map<string, CollectionStoreEntry>()

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onerror = () => resolve(null)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'slug' })
        }
      }
      req.onsuccess = () => resolve(req.result)
    } catch {
      resolve(null)
    }
  })
}

function lsKey(slug: string) {
  return `${LS_PREFIX}${slug}`
}

/** Compact for localStorage — full book lives in IndexedDB. */
function toLite(entry: CollectionStoreEntry): CollectionStoreEntry {
  return {
    ...entry,
    nfts: entry.nfts.slice(0, LITE_NFT_CAP),
    activities: (entry.activities || []).slice(0, LITE_ACTIVITY_CAP),
    offers: (entry.offers || []).slice(0, LITE_OFFER_CAP),
  }
}

function readLocalStorage(slug: string): CollectionStoreEntry | null {
  try {
    const raw = localStorage.getItem(lsKey(slug))
    if (!raw) return null
    const row = JSON.parse(raw) as CollectionStoreEntry
    if (!row?.slug || !Array.isArray(row.nfts)) return null
    row.activities = row.activities || []
    row.offers = row.offers || []
    row.listedCount = row.listedCount ?? row.nfts.filter((n) => n.listed).length
    return row
  } catch {
    return null
  }
}

function writeLocalStorage(entry: CollectionStoreEntry) {
  try {
    localStorage.setItem(lsKey(entry.slug), JSON.stringify(toLite(entry)))
  } catch {
    // Quota — drop images from lite and retry once
    try {
      const slim: CollectionStoreEntry = {
        ...toLite(entry),
        nfts: toLite(entry).nfts.map((n) => ({
          ...n,
          image: n.image?.includes('dicebear') ? n.image : '',
          traits: n.traits?.slice(0, 2) || [],
        })),
      }
      localStorage.setItem(lsKey(entry.slug), JSON.stringify(slim))
    } catch {
      /* ignore */
    }
  }
}

/** Sync hydrate — use for React initial state so refresh paints immediately. */
export function getCollectionStoreSync(slug: string): CollectionStoreEntry | null {
  const m = mem.get(slug)
  if (m?.nfts?.length) return m
  const ls = readLocalStorage(slug)
  if (ls?.nfts?.length) {
    mem.set(slug, ls)
    cacheOpenSeaNfts(ls.nfts)
    return ls
  }
  return m ?? null
}

export async function getCollectionStore(
  slug: string
): Promise<CollectionStoreEntry | null> {
  const sync = getCollectionStoreSync(slug)
  // Prefer fuller IndexedDB if available
  const db = await openDb()
  if (!db) return sync

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(slug)
      req.onerror = () => {
        db.close()
        resolve(sync)
      }
      req.onsuccess = () => {
        const row = (req.result as CollectionStoreEntry | undefined) ?? null
        db.close()
        if (row?.nfts?.length) {
          row.activities = row.activities || []
          row.offers = row.offers || []
          // Prefer the larger of IDB vs lite
          if (!sync || row.nfts.length >= sync.nfts.length) {
            mem.set(slug, row)
            cacheOpenSeaNfts(row.nfts)
            resolve(row)
            return
          }
        }
        resolve(sync)
      }
    } catch {
      resolve(sync)
    }
  })
}

/**
 * Persist catalog. Refuses to replace non-empty nfts with empty (protects refresh).
 */
export async function putCollectionStore(
  entry: CollectionStoreEntry,
  opts?: { allowEmpty?: boolean }
): Promise<void> {
  const prev = mem.get(entry.slug) || readLocalStorage(entry.slug)
  if (
    !opts?.allowEmpty &&
    (!entry.nfts || entry.nfts.length === 0) &&
    prev?.nfts?.length
  ) {
    // Keep previous inventory; still allow activity/offer updates
    const merged: CollectionStoreEntry = {
      ...prev,
      activities: entry.activities?.length ? entry.activities : prev.activities,
      offers: entry.offers?.length ? entry.offers : prev.offers,
      updatedAt: Date.now(),
    }
    mem.set(entry.slug, merged)
    writeLocalStorage(merged)
    return
  }

  const normalized: CollectionStoreEntry = {
    ...entry,
    activities: entry.activities || [],
    offers: entry.offers || [],
    listedCount: entry.listedCount ?? entry.nfts.filter((n) => n.listed).length,
    updatedAt: entry.updatedAt || Date.now(),
  }

  // Merge enrichment: if new has fewer items but was a partial lite write, prefer larger
  if (prev?.nfts?.length && normalized.nfts.length < prev.nfts.length * 0.5) {
    // Likely a partial progressive page — only replace if newer listedCount is higher
    if ((normalized.listedCount || 0) < (prev.listedCount || 0)) {
      const mergedNfts = mergeNftsPreferEnriched(prev.nfts, normalized.nfts)
      normalized.nfts = mergedNfts
      normalized.listedCount = Math.max(
        normalized.listedCount,
        prev.listedCount || 0
      )
    }
  } else if (prev?.nfts?.length) {
    normalized.nfts = mergeNftsPreferEnriched(prev.nfts, normalized.nfts)
  }

  mem.set(entry.slug, normalized)
  if (normalized.nfts.length) cacheOpenSeaNfts(normalized.nfts)
  writeLocalStorage(normalized)

  const db = await openDb()
  if (!db) return

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(normalized)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        resolve()
      }
    } catch {
      resolve()
    }
  })
}

function mergeNftsPreferEnriched(prev: Nft[], next: Nft[]): Nft[] {
  const map = new Map<string, Nft>()
  for (const n of prev) map.set(n.id, n)
  for (const n of next) {
    const old = map.get(n.id)
    if (!old) {
      map.set(n.id, n)
      continue
    }
    map.set(n.id, {
      ...old,
      ...n,
      image:
        n.image && !n.image.includes('dicebear')
          ? n.image
          : old.image && !old.image.includes('dicebear')
            ? old.image
            : n.image || old.image,
      name: n.name && !n.name.startsWith('#') ? n.name : old.name || n.name,
      traits: (n.traits?.length || 0) > (old.traits?.length || 0) ? n.traits : old.traits,
      rarityRank: n.rarityRank ?? old.rarityRank,
      owner:
        n.owner && n.owner !== 'unknown' ? n.owner : old.owner || n.owner,
      listed: n.listed || old.listed,
      price: n.price ?? old.price,
    })
  }
  // Keep listed first by price
  return Array.from(map.values()).sort((a, b) => {
    if (a.listed && !b.listed) return -1
    if (!a.listed && b.listed) return 1
    return (a.price ?? 1e9) - (b.price ?? 1e9)
  })
}

export function pricesToEntries(prices: Map<string, number>): [string, number][] {
  return Array.from(prices.entries())
}

export function pricesFromEntries(
  entries: [string, number][] | undefined
): Map<string, number> {
  return new Map(entries ?? [])
}

export const COLLECTION_FRESH_MS = 8 * 60 * 1000

export function isCollectionFresh(
  entry: CollectionStoreEntry | null | undefined
): boolean {
  if (!entry?.nfts?.length) return false
  return Date.now() - entry.updatedAt < COLLECTION_FRESH_MS
}

// ─── Back-compat aliases used by older catalogIndexer paths ─────────────────
export type CatalogCacheEntry = CollectionStoreEntry

export function getCatalogCacheSync(slug: string) {
  return getCollectionStoreSync(slug)
}

export async function getCatalogCache(slug: string) {
  return getCollectionStore(slug)
}

export async function putCatalogCache(
  entry: Omit<CollectionStoreEntry, 'activities' | 'offers' | 'listedCount'> & {
    activities?: Activity[]
    offers?: Offer[]
    listedCount?: number
  }
) {
  return putCollectionStore({
    ...entry,
    activities: entry.activities || [],
    offers: entry.offers || [],
    listedCount: entry.listedCount ?? entry.nfts?.filter((n) => n.listed).length ?? 0,
  })
}
