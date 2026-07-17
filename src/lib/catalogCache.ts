/**
 * @deprecated — use collectionStore. Re-exports for compatibility.
 */
export {
  getCatalogCache,
  getCatalogCacheSync,
  putCatalogCache,
  pricesFromEntries,
  pricesToEntries,
  isCollectionFresh as isCatalogFresh,
  COLLECTION_FRESH_MS as CATALOG_FRESH_MS,
  type CollectionStoreEntry as CatalogCacheEntry,
} from './collectionStore'
