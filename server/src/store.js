/**
 * In-memory + optional disk persistence (Fly volume at /data).
 */
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : './data')
const STORE_FILE = path.join(DATA_DIR, 'index-store.json')

/** @type {Map<string, any>} */
const collections = new Map()

/** Global NFT lookup: id → nft, and slug:tokenId → nft */
/** @type {Map<string, any>} */
const nftById = new Map()
/** @type {Map<string, any>} */
const nftBySlugToken = new Map()

let meta = {
  startedAt: new Date().toISOString(),
  lastFullSyncAt: null,
  lastError: null,
  syncCount: 0,
  slugQueue: [],
  nftsIndexed: 0,
  nftsEnriched: 0,
}

export function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  } catch {
    /* ignore */
  }
}

function indexNftsFromCollection(slug, row) {
  const list = row?.nfts || []
  for (const n of list) {
    if (!n?.id) continue
    nftById.set(n.id, { ...n, _slug: slug })
    // Also index by token suffix for client id mismatch (os1-slug vs os-slug)
    const tokenId = n.tokenId != null ? String(n.tokenId) : null
    if (tokenId != null) {
      nftBySlugToken.set(`${slug}:${tokenId}`, { ...n, _slug: slug })
      nftById.set(`os-${slug}-os-${tokenId}`, { ...n, id: `os-${slug}-os-${tokenId}`, _slug: slug })
    }
  }
}

export function loadFromDisk() {
  ensureDataDir()
  try {
    if (!fs.existsSync(STORE_FILE)) return
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'))
    if (raw?.collections && typeof raw.collections === 'object') {
      for (const [slug, row] of Object.entries(raw.collections)) {
        collections.set(slug, row)
        indexNftsFromCollection(slug, row)
      }
    }
    if (raw?.meta) meta = { ...meta, ...raw.meta, startedAt: meta.startedAt }
    meta.nftsIndexed = nftById.size
    console.log(
      `[store] loaded ${collections.size} collections, ${nftById.size} nft keys from disk`
    )
  } catch (e) {
    console.warn('[store] load failed', e?.message || e)
  }
}

let saveTimer = null
export function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveToDisk()
  }, 1500)
}

export function saveToDisk() {
  ensureDataDir()
  try {
    // Keep collection dump leaner for disk (nfts can be large)
    const collectionsOut = {}
    for (const [slug, row] of collections.entries()) {
      collectionsOut[slug] = row
    }
    const obj = {
      meta,
      collections: collectionsOut,
      savedAt: new Date().toISOString(),
    }
    const tmp = `${STORE_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(obj))
    fs.renameSync(tmp, STORE_FILE)
  } catch (e) {
    console.warn('[store] save failed', e?.message || e)
  }
}

/** Summaries safe for admin (no full nft arrays). */
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
  let enriched = 0
  for (const c of collections.values()) {
    for (const n of c.nfts || []) {
      if (n.image && !String(n.image).includes('dicebear')) enriched++
    }
  }
  meta.nftsEnriched = enriched
  meta.nftsIndexed = [...collections.values()].reduce(
    (s, c) => s + (c.nfts?.length || 0),
    0
  )
  return {
    ...meta,
    collectionCount: collections.size,
    listedTotal: [...collections.values()].reduce(
      (s, c) => s + (c.listedCount || 0),
      0
    ),
    nftsIndexed: meta.nftsIndexed,
    nftsEnriched: enriched,
  }
}

export function setMeta(patch) {
  meta = { ...meta, ...patch }
  scheduleSave()
}

export function putCollection(slug, row) {
  // Merge enriched image/name from previous version when new row is thinner
  const prev = collections.get(slug)
  let nfts = row.nfts || []
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
          n.name && !String(n.name).startsWith('#') && !String(n.name).includes(' #')
            ? n.name
            : old.name && !String(old.name).includes('dicebear')
              ? old.name
              : n.name,
        traits: (n.traits?.length || 0) > 2 ? n.traits : old.traits || n.traits,
        owner: n.owner && n.owner !== 'unknown' ? n.owner : old.owner || n.owner,
      }
    })
  }
  const next = {
    ...row,
    nfts,
    slug,
    updatedAt: new Date().toISOString(),
  }
  collections.set(slug, next)
  indexNftsFromCollection(slug, next)
  scheduleSave()
  return next
}

export function patchCollectionNfts(slug, patchesByToken) {
  const row = collections.get(slug)
  if (!row?.nfts?.length) return null
  const nfts = row.nfts.map((n) => {
    const p = patchesByToken.get(String(n.tokenId))
    if (!p) return n
    return {
      ...n,
      name: p.name || n.name,
      image: p.image || n.image,
      owner: p.owner || n.owner,
      traits: p.traits?.length ? p.traits : n.traits,
      rarityRank: p.rarityRank ?? n.rarityRank,
    }
  })
  return putCollection(slug, { ...row, nfts })
}

export function getCollection(slug) {
  return collections.get(slug) || null
}

export function listCollections() {
  return [...collections.values()].sort(
    (a, b) => (b.volume24h || 0) - (a.volume24h || 0)
  )
}

export function hasData(slug) {
  const c = collections.get(slug)
  return Boolean(c?.nfts?.length)
}

/**
 * Resolve NFT by full id or slug+tokenId.
 * Accepts client ids like os1-gremlin-cartel-os-1235
 */
export function getNft(idOrSlug, tokenIdMaybe) {
  if (tokenIdMaybe != null) {
    const key = `${idOrSlug}:${tokenIdMaybe}`
    return nftBySlugToken.get(key) || null
  }
  const id = decodeURIComponent(String(idOrSlug || ''))
  if (nftById.has(id)) return nftById.get(id)

  // Parse …-os-{tokenId}
  const m = id.match(/^(.*)-os-(.+)$/)
  if (m) {
    const tokenId = m[2]
    // Try any collection containing this token
    for (const [slug, row] of collections.entries()) {
      const hit = (row.nfts || []).find((n) => String(n.tokenId) === tokenId)
      if (hit) return { ...hit, _slug: slug }
    }
    // slug guess: last segment before -os- that looks like collection slug
    const left = m[1]
    const slugGuess = left.replace(/^os\d*-?/, '').replace(/^os-/, '')
    if (slugGuess) {
      const hit = nftBySlugToken.get(`${slugGuess}:${tokenId}`)
      if (hit) return hit
    }
  }
  return null
}

/** NFTs still missing real artwork for a slug */
export function unenrichedTokens(slug, limit = 100) {
  const row = collections.get(slug)
  if (!row?.nfts) return []
  return row.nfts
    .filter((n) => !n.image || String(n.image).includes('dicebear') || !n.name || n.name.startsWith('#'))
    .slice(0, limit)
    .map((n) => ({
      tokenId: String(n.tokenId),
      contract: row.contractAddress,
      chain: row.chain || 'robinhood',
    }))
}
