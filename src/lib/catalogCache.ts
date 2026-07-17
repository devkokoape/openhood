/**
 * Persistent local catalog cache for OpenSea collection items.
 * IndexedDB so revisiting a collection paints in ~0ms without waiting on OpenSea.
 */
import type { Nft } from '../types'
import { cacheOpenSeaNfts } from './opensea'

const DB_NAME = 'openhood-catalog-v2'
const STORE = 'collections'
const DB_VERSION = 1

export interface CatalogCacheEntry {
  slug: string
  collectionId: string
  nfts: Nft[]
  next: string | null
  /** tokenId string → ETH price */
  prices: [string, number][]
  /** Full active listing count from OpenSea best-listings book */
  listedCount?: number
  updatedAt: number
}

/** In-memory layer for same-session instant reads */
const mem = new Map<string, CatalogCacheEntry>()

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

export function getCatalogCacheSync(slug: string): CatalogCacheEntry | null {
  return mem.get(slug) ?? null
}

export async function getCatalogCache(slug: string): Promise<CatalogCacheEntry | null> {
  const hit = mem.get(slug)
  if (hit) return hit

  const db = await openDb()
  if (!db) return null

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(slug)
      req.onerror = () => {
        db.close()
        resolve(null)
      }
      req.onsuccess = () => {
        const row = (req.result as CatalogCacheEntry | undefined) ?? null
        if (row?.nfts?.length) {
          mem.set(slug, row)
          cacheOpenSeaNfts(row.nfts)
        }
        db.close()
        resolve(row)
      }
    } catch {
      resolve(null)
    }
  })
}

export async function putCatalogCache(entry: CatalogCacheEntry): Promise<void> {
  mem.set(entry.slug, entry)
  cacheOpenSeaNfts(entry.nfts)

  const db = await openDb()
  if (!db) return

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(entry)
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

export function pricesToEntries(prices: Map<string, number>): [string, number][] {
  return Array.from(prices.entries())
}

export function pricesFromEntries(entries: [string, number][] | undefined): Map<string, number> {
  return new Map(entries ?? [])
}

/** Cache younger than this is considered fresh (still revalidated quietly). */
export const CATALOG_FRESH_MS = 10 * 60 * 1000

export function isCatalogFresh(entry: CatalogCacheEntry | null | undefined): boolean {
  if (!entry?.nfts?.length) return false
  return Date.now() - entry.updatedAt < CATALOG_FRESH_MS
}
