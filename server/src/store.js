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

  // Warm cache
  for (const c of dbListCollections({ withNfts: true })) {
    collectionCache.set(c.slug, c)
  }
  const s = dbStats()
  console.log(
    `[store] sqlite ready ${getDbPath()} · collections=${s.collections} nfts=${s.nfts} enriched=${s.enriched}`
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

export function putCollection(slug, row) {
  const prev = getCollection(slug)
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
  collectionCache.set(slug, next)
  return next
}

export function patchCollectionNfts(slug, patchesByToken) {
  const n = dbPatchNfts(slug, patchesByToken)
  if (n > 0) {
    // Reload cache
    const full = dbGetCollection(slug, { includeNfts: true })
    if (full) collectionCache.set(slug, full)
  }
  return getCollection(slug)
}

export function getCollection(slug) {
  if (collectionCache.has(slug)) return collectionCache.get(slug)
  const row = dbGetCollection(slug, { includeNfts: true })
  if (row) collectionCache.set(slug, row)
  return row
}

export function listCollections() {
  // Prefer cache if warm
  if (collectionCache.size) {
    return [...collectionCache.values()].sort(
      (a, b) => (b.volume24h || 0) - (a.volume24h || 0)
    )
  }
  const list = dbListCollections({ withNfts: true })
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
