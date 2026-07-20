/**
 * Collection + NFT store backed by SQLite (Fly volume).
 * In-memory cache for hot collection reads; nfts always queryable by id/token.
 */
import {
  dbGetCollection,
  dbGetNftById,
  dbGetNftBySlugToken,
  dbListCollections,
  dbPatchNfts,
  dbReplaceNfts,
  dbStats,
  dbUnenriched,
  dbUpsertCollection,
  ensureDataDir,
  getDb,
  getDbPath,
  invalidateReadySlugCache,
  metaGet,
  metaGetAll,
  metaSet,
  migrateJsonIfNeeded,
} from './db.js'

let startedAt = new Date().toISOString()

/** @type {Map<string, any>} */
const collectionCache = new Map()

export { ensureDataDir }

export function loadFromDisk() {
  ensureDataDir()
  getDb()
  migrateJsonIfNeeded()
  if (!metaGet('startedAt')) metaSet('startedAt', startedAt)
  else startedAt = metaGet('startedAt', startedAt)

  // Warm collection shells only — never load every NFT book into RAM (1M+ rows OOMs Fly)
  for (const c of dbListCollections({ withNfts: false })) {
    collectionCache.set(c.slug, c)
  }
  const s = dbStats()
  console.log(
    `[store] sqlite ready ${getDbPath()} · collections=${s.collections} nfts=${s.nfts} enriched=${s.enriched} (shells cached, NFTs on demand)`
  )
}

/** No-op batching: SQLite writes are durable per upsert. Kept for API compat. */
export function scheduleSave() {
  /* sqlite is write-through */
}

export function saveToDisk() {
  // Checkpoint WAL for clean volume snapshots
  try {
    getDb().exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } catch {
    /* ignore */
  }
}

export function listCollectionSummaries() {
  return listCollections().map((row) => ({
    slug: row.slug,
    name: row.name,
    listedCount: row.listedCount || 0,
    activityCount: row.activities?.length || 0,
    offerCount: row.offers?.length || 0,
    floorPrice: row.floorPrice,
    volume24h: row.volume24h,
    volumeTotal: row.volumeTotal,
    owners: row.owners,
    items: row.items,
    syncedAt: row.syncedAt,
    syncMs: row.syncMs,
    activities: row.activities,
    offers: row.offers,
  }))
}

export function getMeta() {
  const stored = metaGetAll()
  const s = dbStats()
  return {
    startedAt: stored.startedAt || startedAt,
    lastFullSyncAt: stored.lastFullSyncAt || null,
    lastError: stored.lastError || null,
    syncCount: stored.syncCount || 0,
    slugQueue: stored.slugQueue || [],
    // Admin download progress (written by downloadAllContent / warmPriority)
    lastDownloadAt: stored.lastDownloadAt || null,
    lastDownloadMode: stored.lastDownloadMode || null,
    lastDownloadQueued: stored.lastDownloadQueued ?? null,
    lastVerifiedQueued: stored.lastVerifiedQueued ?? null,
    lastDownloadMainnetOnly: stored.lastDownloadMainnetOnly ?? null,
    warmVerifiedCount: stored.warmVerifiedCount ?? null,
    progressDone: stored.progressDone ?? 0,
    progressLastQueue: stored.progressLastQueue ?? null,
    progressStartQueued: stored.progressStartQueued ?? null,
    lastWarning: stored.lastWarning || null,
    lastRateLimitAt: stored.lastRateLimitAt || null,
    collectionCount: s.collections,
    listedTotal: s.listed,
    nftsIndexed: s.nfts,
    nftsEnriched: s.enriched,
    storage: 'sqlite',
    dbPath: getDbPath(),
  }
}

export function setMeta(patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    metaSet(k, v)
  }
}

/**
 * Update collection shell fields without touching NFT rows.
 * Safe for discover/meta refresh so we never wipe listings by accident.
 */
export function patchCollectionMeta(slug, patch) {
  const prev =
    collectionCache.get(slug) ||
    dbGetCollection(slug, { includeNfts: false }) || {
      slug,
      collectionId: `os-${slug}`,
      nfts: [],
    }
  const next = {
    ...prev,
    ...patch,
    slug,
    collectionId: patch.collectionId || prev.collectionId || `os-${slug}`,
    updatedAt: new Date().toISOString(),
    // never pass empty nfts into replace from meta-only path
    nfts: undefined,
  }
  dbUpsertCollection({
    ...next,
    nfts: [], // column write only; dbUpsertCollection doesn't touch nfts table
  })
  collectionCache.set(slug, {
    ...prev,
    ...patch,
    slug,
    collectionId: next.collectionId,
    nfts: prev.nfts || [],
  })
  return collectionCache.get(slug)
}

export function putCollection(slug, row) {
  const prev = getCollection(slug)
  // Meta-only update (no nfts key) — do not wipe NFT inventory
  if (!Object.prototype.hasOwnProperty.call(row || {}, 'nfts')) {
    return patchCollectionMeta(slug, row || {})
  }
  let nfts = row.nfts || []
  // Prefer previous enrich when re-sync thins images
  if (prev?.nfts?.length && nfts.length) {
    const byToken = new Map(prev.nfts.map((n) => [String(n.tokenId), n]))
    nfts = nfts.map((n) => {
      const old = byToken.get(String(n.tokenId))
      if (!old) return n
      return {
        ...old,
        ...n,
        image:
          n.image && !String(n.image).includes('dicebear')
            ? n.image
            : old.image || n.image,
        name:
          n.name && !String(n.name).startsWith('#')
            ? n.name
            : old.name || n.name,
        traits: (n.traits?.length || 0) > 2 ? n.traits : old.traits || n.traits,
        owner:
          n.owner && n.owner !== 'unknown' ? n.owner : old.owner || n.owner,
      }
    })
  }

  const next = {
    ...row,
    nfts,
    slug,
    collectionId: row.collectionId || `os-${slug}`,
    updatedAt: new Date().toISOString(),
  }

  dbUpsertCollection(next)
  dbReplaceNfts(slug, nfts, next.collectionId)
  // Cache listed book for sync memory; unlisted stay in SQLite for marketplace API
  const listedView = dbGetCollection(slug, {
    includeNfts: true,
    listedOnly: true,
  })
  collectionCache.set(
    slug,
    listedView
      ? {
          ...next,
          nfts: listedView.nfts,
          listedCount:
            listedView.listedCount ?? listedView.nfts?.length ?? next.listedCount,
        }
      : next
  )
  // Content readiness may change after sync/enrich writes
  invalidateReadySlugCache()
  return listedView
    ? {
        ...next,
        nfts: listedView.nfts,
        listedCount:
          listedView.listedCount ?? listedView.nfts?.length ?? next.listedCount,
      }
    : next
}

export function patchCollectionNfts(slug, patchesByToken) {
  const n = dbPatchNfts(slug, patchesByToken)
  if (n > 0) {
    // Reload cache
    const full = dbGetCollection(slug, { includeNfts: true })
    if (full) collectionCache.set(slug, full)
    invalidateReadySlugCache()
  }
  return getCollection(slug)
}

/** Shell only (no NFT load) — for discover / ranking loops */
export function peekCollection(slug) {
  if (collectionCache.has(slug)) return collectionCache.get(slug)
  const row = dbGetCollection(slug, { includeNfts: false })
  if (row) collectionCache.set(slug, { ...row, nfts: [] })
  return row || null
}

export function getCollection(slug) {
  // Always load listed NFTs for a single slug from SQLite (on demand).
  // Do not trust cache.nfts — shells are cached without books.
  const row = dbGetCollection(slug, { includeNfts: true, listedOnly: true })
  if (row) {
    const shell = collectionCache.get(slug)
    collectionCache.set(slug, {
      ...(shell || {}),
      ...row,
      // Keep shell meta if richer
      name: row.name || shell?.name,
      image: row.image || shell?.image,
    })
  }
  return row || collectionCache.get(slug) || null
}

export function listCollections() {
  // Shells only — never materialize all NFT books at once
  if (collectionCache.size) {
    return [...collectionCache.values()]
      .map((c) => ({ ...c, nfts: c.nfts?.length ? undefined : [] }))
      .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
  }
  const list = dbListCollections({ withNfts: false })
  for (const c of list) collectionCache.set(c.slug, c)
  return list
}

export function hasData(slug) {
  const c = getCollection(slug)
  return Boolean(c?.nfts?.length)
}

/**
 * Resolve NFT by full id or slug+tokenId (SQLite indexed).
 */
export function getNft(idOrSlug, tokenIdMaybe) {
  if (tokenIdMaybe != null) {
    const hit = dbGetNftBySlugToken(idOrSlug, tokenIdMaybe)
    return hit
  }
  return dbGetNftById(decodeURIComponent(String(idOrSlug || '')))
}

/** NFTs still missing real artwork for a slug */
export function unenrichedTokens(slug, limit = 100) {
  const col = getCollection(slug)
  const contract = col?.contractAddress
  const chain = col?.chain || 'robinhood'
  return dbUnenriched(slug, limit).map((r) => ({
    tokenId: r.tokenId,
    contract,
    chain,
  }))
}

export function storageInfo() {
  return { ...dbStats(), path: getDbPath(), engine: 'node:sqlite' }
}
