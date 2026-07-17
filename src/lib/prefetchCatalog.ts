/**
 * Warm a collection catalog on hover / pointer intent so click feels instant.
 */
import type { Collection } from '../types'
import { getCatalogCacheSync, isCatalogFresh } from './catalogCache'
import { indexCollectionCatalog } from './catalogIndexer'

const warmed = new Set<string>()

export function prefetchCollectionCatalog(c: Collection | undefined | null): void {
  if (!c || c.source !== 'opensea' || !c.slug) return
  if (warmed.has(c.slug)) return

  const mem = getCatalogCacheSync(c.slug)
  if (isCatalogFresh(mem)) {
    warmed.add(c.slug)
    return
  }

  warmed.add(c.slug)
  void indexCollectionCatalog(c.slug, c.id, {
    nftPages: 4,
    listingPages: 3,
    skipIfFresh: true,
  }).catch(() => {
    warmed.delete(c.slug)
  })
}
