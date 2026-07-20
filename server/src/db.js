/**
 * SQLite persistence on Fly volume (Node built-in node:sqlite — no npm native deps).
 * Path: $DATA_DIR/openhood.db  (default /data/openhood.db)
 */
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : './data')
const DB_PATH = process.env.SQLITE_PATH || path.join(DATA_DIR, 'openhood.db')

/** @type {DatabaseSync | null} */
let db = null

export function getDataDir() {
  return DATA_DIR
}

export function getDbPath() {
  return DB_PATH
}

export function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  } catch {
    /* ignore */
  }
}

export function getDb() {
  if (db) return db
  ensureDataDir()
  db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  migrate(db)
  console.log(`[db] sqlite open ${DB_PATH}`)
  return db
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
      slug TEXT PRIMARY KEY,
      collection_id TEXT,
      name TEXT,
      image TEXT,
      banner TEXT,
      description TEXT,
      contract_address TEXT,
      chain TEXT DEFAULT 'robinhood',
      floor_price REAL DEFAULT 0,
      volume_24h REAL DEFAULT 0,
      volume_total REAL DEFAULT 0,
      owners INTEGER DEFAULT 0,
      items INTEGER DEFAULT 0,
      listed_count INTEGER DEFAULT 0,
      listed_pct REAL DEFAULT 0,
      source TEXT DEFAULT 'opensea',
      synced_at TEXT,
      sync_ms INTEGER,
      activities_json TEXT,
      offers_json TEXT,
      prices_json TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS nfts (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      collection_id TEXT,
      token_id TEXT NOT NULL,
      name TEXT,
      image TEXT,
      owner TEXT,
      listed INTEGER DEFAULT 1,
      price REAL,
      rarity_rank INTEGER,
      traits_json TEXT,
      enriched INTEGER DEFAULT 0,
      updated_at TEXT,
      UNIQUE(slug, token_id)
    );

    CREATE INDEX IF NOT EXISTS idx_nfts_slug ON nfts(slug);
    CREATE INDEX IF NOT EXISTS idx_nfts_slug_price ON nfts(slug, listed, price);
    CREATE INDEX IF NOT EXISTS idx_nfts_token ON nfts(token_id);
    CREATE INDEX IF NOT EXISTS idx_nfts_unenriched ON nfts(slug, enriched);

    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      at TEXT NOT NULL,
      path TEXT,
      page TEXT,
      session_id TEXT,
      wallet TEXT,
      ip_hash TEXT,
      country TEXT,
      country_code TEXT,
      region TEXT,
      city TEXT,
      timezone TEXT,
      locale TEXT,
      language TEXT,
      device TEXT,
      referrer TEXT,
      connected INTEGER DEFAULT 0,
      payload_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_visits_ts ON visits(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_visits_session ON visits(session_id);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      kind TEXT,
      wallet TEXT,
      session_id TEXT,
      visits INTEGER DEFAULT 0,
      first_seen TEXT,
      last_seen TEXT,
      last_path TEXT,
      locale TEXT,
      timezone TEXT,
      top_country TEXT,
      top_device TEXT,
      countries_json TEXT,
      devices_json TEXT,
      last_geo_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_last ON users(last_seen DESC);
  `)
}

export function metaGet(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key)
  if (!row) return fallback
  try {
    return JSON.parse(row.value)
  } catch {
    return row.value
  }
}

export function metaSet(key, value) {
  getDb()
    .prepare(
      `INSERT INTO meta(key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, JSON.stringify(value))
}

export function metaGetAll() {
  const rows = getDb().prepare('SELECT key, value FROM meta').all()
  const out = {}
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value)
    } catch {
      out[r.key] = r.value
    }
  }
  return out
}

function parseJson(s, fallback) {
  if (s == null || s === '') return fallback
  try {
    return JSON.parse(s)
  } catch {
    return fallback
  }
}

/** True when traits look like real OpenSea attributes (not listing stubs). */
function hasRealTraitsMeta(traits) {
  if (!Array.isArray(traits) || traits.length === 0) return false
  const real = traits.filter(
    (t) =>
      t?.trait_type &&
      t.trait_type !== 'Status' &&
      t.trait_type !== 'Token ID'
  )
  return real.length > 0
}

/**
 * Fully downloaded token: real art + real name + real traits/metadata.
 * Partial enrich (art only) stays enriched=0 until metadata is also filled.
 */
function isEnriched(image, name, traits) {
  if (!image) return 0
  const img = String(image)
  if (
    img.includes('dicebear') ||
    img.startsWith('data:image/svg') ||
    img.includes('seed=openhood')
  )
    return 0
  if (/image_type_(logo|hero|featured)/i.test(img)) return 0
  if (!name || String(name).startsWith('#')) return 0
  if (!hasRealTraitsMeta(traits)) return 0
  return 1
}

export function rowToCollection(row, nfts) {
  if (!row) return null
  return {
    slug: row.slug,
    collectionId: row.collection_id,
    name: row.name,
    image: row.image,
    banner: row.banner,
    description: row.description,
    contractAddress: row.contract_address,
    chain: row.chain || 'robinhood',
    floorPrice: row.floor_price || 0,
    volume24h: row.volume_24h || 0,
    volumeTotal: row.volume_total || 0,
    owners: row.owners || 0,
    items: row.items || 0,
    listedCount: row.listed_count || 0,
    listedPct: row.listed_pct || 0,
    source: row.source || 'opensea',
    syncedAt: row.synced_at,
    syncMs: row.sync_ms,
    activities: parseJson(row.activities_json, []),
    offers: parseJson(row.offers_json, []),
    prices: parseJson(row.prices_json, []),
    nfts: nfts || [],
    updatedAt: row.updated_at,
  }
}

export function rowToNft(row) {
  if (!row) return null
  return {
    id: row.id,
    tokenId: Number(row.token_id) || row.token_id,
    name: row.name,
    collectionId: row.collection_id,
    image: row.image,
    owner: row.owner,
    listed: Boolean(row.listed),
    price: row.price != null ? row.price : undefined,
    rarityRank: row.rarity_rank != null ? row.rarity_rank : undefined,
    traits: parseJson(row.traits_json, []),
    _slug: row.slug,
  }
}

export function dbUpsertCollection(col) {
  const database = getDb()
  const now = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO collections (
        slug, collection_id, name, image, banner, description, contract_address, chain,
        floor_price, volume_24h, volume_total, owners, items, listed_count, listed_pct,
        source, synced_at, sync_ms, activities_json, offers_json, prices_json, updated_at
      ) VALUES (
        @slug, @collection_id, @name, @image, @banner, @description, @contract_address, @chain,
        @floor_price, @volume_24h, @volume_total, @owners, @items, @listed_count, @listed_pct,
        @source, @synced_at, @sync_ms, @activities_json, @offers_json, @prices_json, @updated_at
      )
      ON CONFLICT(slug) DO UPDATE SET
        collection_id=excluded.collection_id,
        name=excluded.name,
        image=excluded.image,
        banner=excluded.banner,
        description=excluded.description,
        contract_address=excluded.contract_address,
        chain=excluded.chain,
        floor_price=excluded.floor_price,
        volume_24h=excluded.volume_24h,
        volume_total=excluded.volume_total,
        owners=excluded.owners,
        items=excluded.items,
        listed_count=excluded.listed_count,
        listed_pct=excluded.listed_pct,
        source=excluded.source,
        synced_at=excluded.synced_at,
        sync_ms=excluded.sync_ms,
        activities_json=excluded.activities_json,
        offers_json=excluded.offers_json,
        prices_json=excluded.prices_json,
        updated_at=excluded.updated_at`
    )
    .run({
      slug: col.slug,
      collection_id: col.collectionId || `os-${col.slug}`,
      name: col.name || col.slug,
      image: col.image || '',
      banner: col.banner || col.image || '',
      description: col.description || '',
      contract_address: col.contractAddress || null,
      chain: col.chain || 'robinhood',
      floor_price: col.floorPrice || 0,
      volume_24h: col.volume24h || 0,
      volume_total: col.volumeTotal || 0,
      owners: col.owners || 0,
      items: col.items || 0,
      listed_count: col.listedCount || col.nfts?.length || 0,
      listed_pct: col.listedPct || 0,
      source: col.source || 'opensea',
      synced_at: col.syncedAt || now,
      sync_ms: col.syncMs ?? null,
      activities_json: JSON.stringify(col.activities || []),
      offers_json: JSON.stringify(col.offers || []),
      prices_json: JSON.stringify(col.prices || []),
      updated_at: now,
    })
}

/**
 * Replace NFT rows for a collection (merge-safe enrich fields if existing better).
 */
export function dbReplaceNfts(slug, nfts, collectionId) {
  const database = getDb()
  const now = new Date().toISOString()
  const existing = database
    .prepare('SELECT token_id, name, image, owner, traits_json, enriched FROM nfts WHERE slug = ?')
    .all(slug)
  const prevByToken = new Map(existing.map((r) => [String(r.token_id), r]))

  const insert = database.prepare(
    `INSERT INTO nfts (
      id, slug, collection_id, token_id, name, image, owner, listed, price,
      rarity_rank, traits_json, enriched, updated_at
    ) VALUES (
      @id, @slug, @collection_id, @token_id, @name, @image, @owner, @listed, @price,
      @rarity_rank, @traits_json, @enriched, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      image=excluded.image,
      owner=excluded.owner,
      listed=excluded.listed,
      price=excluded.price,
      rarity_rank=excluded.rarity_rank,
      traits_json=excluded.traits_json,
      enriched=excluded.enriched,
      updated_at=excluded.updated_at,
      collection_id=excluded.collection_id`
  )

  // Also upsert by (slug, token_id) if id scheme differs
  const bySlugToken = database.prepare(
    `INSERT INTO nfts (
      id, slug, collection_id, token_id, name, image, owner, listed, price,
      rarity_rank, traits_json, enriched, updated_at
    ) VALUES (
      @id, @slug, @collection_id, @token_id, @name, @image, @owner, @listed, @price,
      @rarity_rank, @traits_json, @enriched, @updated_at
    )
    ON CONFLICT(slug, token_id) DO UPDATE SET
      id=excluded.id,
      name=excluded.name,
      image=excluded.image,
      owner=excluded.owner,
      listed=excluded.listed,
      price=excluded.price,
      rarity_rank=excluded.rarity_rank,
      traits_json=excluded.traits_json,
      enriched=excluded.enriched,
      updated_at=excluded.updated_at,
      collection_id=excluded.collection_id`
  )

  database.exec('BEGIN')
  try {
    for (const n of nfts || []) {
      const tokenId = String(n.tokenId)
      const old = prevByToken.get(tokenId)
      let name = n.name
      let image = n.image
      let owner = n.owner
      let traits = n.traits || []
      if (old) {
        const oldImage = old.image
        const oldName = old.name
        if ((!image || String(image).includes('dicebear')) && oldImage) image = oldImage
        if ((!name || String(name).startsWith('#')) && oldName) name = oldName
        if ((!owner || owner === 'unknown') && old.owner) owner = old.owner
        const oldTraits = parseJson(old.traits_json, [])
        if ((traits?.length || 0) <= 2 && oldTraits.length > 2) traits = oldTraits
      }
      const traitsJson = JSON.stringify(traits || [])
      const enriched = isEnriched(image, name, traits)
      const id = n.id || `${collectionId || `os-${slug}`}-os-${tokenId}`
      const row = {
        id,
        slug,
        collection_id: collectionId || n.collectionId || `os-${slug}`,
        token_id: tokenId,
        name: name || `#${tokenId}`,
        image: image || '',
        owner: owner || 'unknown',
        listed: n.listed === false ? 0 : 1,
        price: n.price ?? null,
        rarity_rank: n.rarityRank ?? null,
        traits_json: traitsJson,
        enriched,
        updated_at: now,
      }
      try {
        bySlugToken.run(row)
      } catch {
        insert.run(row)
      }
    }
    // Mark tokens no longer in the active listing set as unlisted (no ghost floors)
    const activeIds = (nfts || []).map((n) => String(n.tokenId))
    if (activeIds.length) {
      const placeholders = activeIds.map(() => '?').join(',')
      database
        .prepare(
          `UPDATE nfts SET listed = 0, price = NULL, updated_at = ?
           WHERE slug = ? AND listed = 1 AND token_id NOT IN (${placeholders})`
        )
        .run(now, slug, ...activeIds)
    } else {
      // Empty book: unlist everything for this slug
      database
        .prepare(
          `UPDATE nfts SET listed = 0, price = NULL, updated_at = ? WHERE slug = ? AND listed = 1`
        )
        .run(now, slug)
    }
    database.exec('COMMIT')
  } catch (e) {
    try {
      database.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }
}

/** Listed inventory only (for API / cache — not historical unlisted rows). */
export function dbListListedNfts(slug) {
  return getDb()
    .prepare(
      `SELECT * FROM nfts WHERE slug = ? AND listed = 1 ORDER BY
        CASE WHEN price IS NULL THEN 1 ELSE 0 END, price ASC`
    )
    .all(slug)
    .map(rowToNft)
}

export function dbPatchNfts(slug, patchesByToken) {
  const database = getDb()
  const now = new Date().toISOString()
  const sel = database.prepare(
    'SELECT * FROM nfts WHERE slug = ? AND token_id = ?'
  )
  const upd = database.prepare(
    `UPDATE nfts SET
      name = COALESCE(?, name),
      image = COALESCE(?, image),
      owner = COALESCE(?, owner),
      traits_json = COALESCE(?, traits_json),
      rarity_rank = COALESCE(?, rarity_rank),
      enriched = ?,
      updated_at = ?
     WHERE slug = ? AND token_id = ?`
  )
  let n = 0
  database.exec('BEGIN')
  try {
    for (const [tokenId, p] of patchesByToken.entries()) {
      const cur = sel.get(slug, String(tokenId))
      if (!cur) continue
      const name = p.name || cur.name
      const image = p.image || cur.image
      const traitsArr = p.traits?.length
        ? p.traits
        : parseJson(cur.traits_json, [])
      const traits = p.traits?.length ? JSON.stringify(p.traits) : null
      const rarity = p.rarityRank ?? null
      upd.run(
        p.name || null,
        p.image || null,
        p.owner || null,
        traits,
        rarity,
        isEnriched(image, name, traitsArr),
        now,
        slug,
        String(tokenId)
      )
      n++
    }
    database.exec('COMMIT')
  } catch (e) {
    try {
      database.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }
  return n
}

export function dbGetCollection(slug, { includeNfts = true, listedOnly = true } = {}) {
  const row = getDb().prepare('SELECT * FROM collections WHERE slug = ?').get(slug)
  if (!row) return null
  let nfts = []
  if (includeNfts) {
    // Default listed-only for sync/cache memory; public API uses dbListNftsPage(scope=all)
    nfts = getDb()
      .prepare(
        listedOnly
          ? `SELECT * FROM nfts WHERE slug = ? AND listed = 1
             ORDER BY CASE WHEN price IS NULL THEN 1 ELSE 0 END, price ASC`
          : `SELECT * FROM nfts WHERE slug = ?
             ORDER BY listed DESC,
               CASE WHEN price IS NULL THEN 1 ELSE 0 END,
               price ASC,
               CAST(token_id AS INTEGER) ASC`
      )
      .all(slug)
      .map(rowToNft)
  }
  return rowToCollection(row, nfts)
}

/**
 * Paginated NFT book for marketplace UI.
 * scope=all → listed first, then unlisted (so offers work on not-for-sale tokens).
 * scope=listed | unlisted for filters.
 */
export function dbListNftsPage(
  slug,
  { offset = 0, limit = 48, scope = 'all' } = {}
) {
  const database = getDb()
  const off = Math.max(0, Number(offset) || 0)
  const lim = Math.min(500, Math.max(1, Number(limit) || 48))
  const sc = String(scope || 'all').toLowerCase()

  let where = 'slug = ?'
  if (sc === 'listed') where += ' AND listed = 1'
  else if (sc === 'unlisted') where += ' AND (listed = 0 OR listed IS NULL)'

  const total = database
    .prepare(`SELECT COUNT(*) AS c FROM nfts WHERE ${where}`)
    .get(slug).c
  const listed = database
    .prepare(`SELECT COUNT(*) AS c FROM nfts WHERE slug = ? AND listed = 1`)
    .get(slug).c
  const unlisted = database
    .prepare(
      `SELECT COUNT(*) AS c FROM nfts WHERE slug = ? AND (listed = 0 OR listed IS NULL)`
    )
    .get(slug).c

  const rows = database
    .prepare(
      `SELECT * FROM nfts WHERE ${where}
       ORDER BY listed DESC,
         CASE WHEN price IS NULL THEN 1 ELSE 0 END,
         price ASC,
         CAST(token_id AS INTEGER) ASC
       LIMIT ? OFFSET ?`
    )
    .all(slug, lim, off)
    .map(rowToNft)

  return {
    nfts: rows,
    offset: off,
    limit: lim,
    nftsTotal: Number(total || 0),
    listedCount: Number(listed || 0),
    unlistedCount: Number(unlisted || 0),
    hasMore: off + rows.length < Number(total || 0),
  }
}

/**
 * Upsert catalog tokens without wiping listing flags on tokens not in this batch.
 * Used when paging the full OpenSea collection (listed + not listed).
 */
export function dbMergeCatalogNfts(slug, nfts, collectionId) {
  if (!nfts?.length) return 0
  const database = getDb()
  const now = new Date().toISOString()
  const existing = database
    .prepare(
      'SELECT token_id, name, image, owner, traits_json, enriched, listed, price FROM nfts WHERE slug = ?'
    )
    .all(slug)
  const prevByToken = new Map(existing.map((r) => [String(r.token_id), r]))

  const bySlugToken = database.prepare(
    `INSERT INTO nfts (
      id, slug, collection_id, token_id, name, image, owner, listed, price,
      rarity_rank, traits_json, enriched, updated_at
    ) VALUES (
      @id, @slug, @collection_id, @token_id, @name, @image, @owner, @listed, @price,
      @rarity_rank, @traits_json, @enriched, @updated_at
    )
    ON CONFLICT(slug, token_id) DO UPDATE SET
      id=excluded.id,
      name=excluded.name,
      image=excluded.image,
      owner=excluded.owner,
      listed=excluded.listed,
      price=excluded.price,
      rarity_rank=COALESCE(excluded.rarity_rank, rarity_rank),
      traits_json=excluded.traits_json,
      enriched=excluded.enriched,
      updated_at=excluded.updated_at,
      collection_id=excluded.collection_id`
  )

  let n = 0
  database.exec('BEGIN')
  try {
    for (const raw of nfts) {
      const tokenId = String(raw.tokenId)
      const old = prevByToken.get(tokenId)
      let name = raw.name
      let image = raw.image
      let owner = raw.owner
      let traits = raw.traits || []
      if (old) {
        if ((!image || String(image).includes('dicebear')) && old.image)
          image = old.image
        if ((!name || String(name).startsWith('#')) && old.name) name = old.name
        if ((!owner || owner === 'unknown') && old.owner) owner = old.owner
        const oldTraits = parseJson(old.traits_json, [])
        if ((traits?.length || 0) <= 2 && oldTraits.length > 2) traits = oldTraits
      }
      // Prefer explicit listing from catalog merge (price map); keep prior listed if unknown
      let listed =
        raw.listed === true ? 1 : raw.listed === false ? 0 : old?.listed ? 1 : 0
      let price =
        raw.price != null
          ? raw.price
          : listed
            ? old?.price ?? null
            : null
      if (!listed) price = null

      const traitsJson = JSON.stringify(traits || [])
      const enriched = isEnriched(image, name, traits)
      const id =
        raw.id || `${collectionId || `os-${slug}`}-os-${tokenId}`
      bySlugToken.run({
        id,
        slug,
        collection_id: collectionId || raw.collectionId || `os-${slug}`,
        token_id: tokenId,
        name: name || `#${tokenId}`,
        image: image || '',
        owner: owner || 'unknown',
        listed,
        price,
        rarity_rank: raw.rarityRank ?? null,
        traits_json: traitsJson,
        enriched,
        updated_at: now,
      })
      n++
    }
    database.exec('COMMIT')
  } catch (e) {
    try {
      database.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }
  return n
}

export function dbListCollections({ withNfts = false } = {}) {
  const rows = getDb()
    .prepare('SELECT * FROM collections ORDER BY volume_24h DESC')
    .all()
  return rows.map((r) => {
    if (!withNfts) return rowToCollection(r, [])
    return dbGetCollection(r.slug, { includeNfts: true })
  })
}

export function dbGetNftById(id) {
  const database = getDb()
  let row = database.prepare('SELECT * FROM nfts WHERE id = ?').get(id)
  if (row) return rowToNft(row)

  const m = String(id).match(/^(.*)-os-(.+)$/)
  if (!m) return null
  const tokenId = m[2]
  const left = m[1]
  const slugGuess = left.replace(/^os\d+-/, '').replace(/^os-/, '')

  if (slugGuess) {
    row = database
      .prepare('SELECT * FROM nfts WHERE slug = ? AND token_id = ?')
      .get(slugGuess, tokenId)
    if (row) return rowToNft(row)
  }

  row = database.prepare('SELECT * FROM nfts WHERE token_id = ? LIMIT 1').get(tokenId)
  return row ? rowToNft(row) : null
}

export function dbGetNftBySlugToken(slug, tokenId) {
  const row = getDb()
    .prepare('SELECT * FROM nfts WHERE slug = ? AND token_id = ?')
    .get(slug, String(tokenId))
  return row ? rowToNft(row) : null
}

export function dbUnenriched(slug, limit = 40) {
  // Priority: missing real art (dicebear / gray stubs / empty)
  return getDb()
    .prepare(
      `SELECT token_id, slug FROM nfts
       WHERE slug = ?
         AND (
           enriched = 0
           OR image IS NULL OR image = ''
           OR image LIKE '%dicebear%'
           OR image LIKE 'data:image/svg%'
           OR image LIKE '%seed=openhood%'
           OR image LIKE '%image_type_logo%'
           OR image LIKE '%image_type_hero%'
         )
       LIMIT ?`
    )
    .all(slug, limit)
    .map((r) => ({
      tokenId: String(r.token_id),
      slug: r.slug,
    }))
}

export function dbStats() {
  const database = getDb()
  const collections = database.prepare('SELECT COUNT(*) AS c FROM collections').get().c
  const nfts = database.prepare('SELECT COUNT(*) AS c FROM nfts').get().c
  const enriched = database
    .prepare('SELECT COUNT(*) AS c FROM nfts WHERE enriched = 1')
    .get().c
  const listed = database
    .prepare('SELECT COUNT(*) AS c FROM nfts WHERE listed = 1')
    .get().c
  const visits = database.prepare('SELECT COUNT(*) AS c FROM visits').get().c
  const users = database.prepare('SELECT COUNT(*) AS c FROM users').get().c
  return { collections, nfts, enriched, listed, visits, users }
}

/** Match client/server verified policy (OpenSea + ≥3 ETH total volume) */
const VERIFIED_MIN_VOLUME_ETH = Number(process.env.VERIFIED_MIN_VOLUME_ETH || 3)

/**
 * Public marketplace gate — browsable Robinhood collections.
 *
 * Must stay FAST (SQL aggregates only). Scanning every NFT row in JS
 * OOMs/timeouts Fly and leaves the site with only demo collections.
 *
 * Show when there are active listings and the book is mostly real art
 * (not a wall of stubs). Full 100% enrich is tracked in admin progress.
 */
export function isContentReady(listed, enriched, stubs, _missingMeta = 0) {
  const L = Number(listed || 0)
  const E = Number(enriched || 0)
  const S = Number(stubs || 0)
  if (L <= 0) return false
  // Fully art-complete
  if (S === 0 && E >= Math.max(1, Math.floor(L * 0.9))) return true
  // Mostly filled — enough for a real marketplace grid
  if (S <= Math.max(5, Math.floor(L * 0.2)) && E >= Math.max(1, Math.floor(L * 0.4)))
    return true
  // Small books: any real art + listings is fine
  if (L <= 30 && S <= Math.max(3, Math.floor(L * 0.35))) return true
  // Has listings and non-trivial filled share
  if (E >= 10 && E >= L * 0.25) return true
  return false
}

/** Short-lived cache so home/collections polls don't re-scan every hit */
let readySlugCache = { at: 0, set: null }
const READY_SLUG_TTL_MS = 30_000

/**
 * Per-slug listed completeness — pure SQL GROUP BY (never load 1M rows into JS).
 */
function dbNftCompletenessAgg() {
  return getDb()
    .prepare(
      `SELECT slug,
         SUM(CASE WHEN listed = 1 THEN 1 ELSE 0 END) AS listed,
         SUM(CASE WHEN listed = 1 AND enriched = 1 THEN 1 ELSE 0 END) AS enriched,
         SUM(CASE WHEN listed = 1 AND (
           image IS NULL OR image = '' OR image LIKE '%dicebear%'
             OR image LIKE 'data:image/svg%' OR image LIKE '%seed=openhood%'
             OR image LIKE '%image_type_logo%' OR image LIKE '%image_type_hero%'
             OR image LIKE '%image_type_featured%'
         ) THEN 1 ELSE 0 END) AS stubs,
         SUM(CASE WHEN listed = 1 AND (
           traits_json IS NULL OR traits_json = '' OR traits_json = '[]'
             OR length(traits_json) < 8
         ) THEN 1 ELSE 0 END) AS missing_meta
       FROM nfts
       GROUP BY slug`
    )
    .all()
    .map((r) => ({
      slug: r.slug,
      listed: Number(r.listed || 0),
      enriched: Number(r.enriched || 0),
      stubs: Number(r.stubs || 0),
      missing_meta: Number(r.missing_meta || 0),
    }))
}

/**
 * Set of slugs that passed isContentReady (public catalog filter).
 */
export function dbReadySlugSet({ force = false } = {}) {
  const now = Date.now()
  if (
    !force &&
    readySlugCache.set &&
    now - readySlugCache.at < READY_SLUG_TTL_MS
  ) {
    return readySlugCache.set
  }
  const nftAgg = dbNftCompletenessAgg()
  const set = new Set()
  for (const a of nftAgg) {
    if (isContentReady(a.listed, a.enriched, a.stubs, a.missing_meta)) {
      set.add(a.slug)
    }
  }
  // Also include collection shells that report listings but nft agg missed
  // (meta-only rows still useful on Discover)
  try {
    const shells = getDb()
      .prepare(
        `SELECT slug, listed_count FROM collections
         WHERE listed_count > 0 AND (image IS NOT NULL AND image != '' AND image NOT LIKE '%dicebear%')`
      )
      .all()
    for (const s of shells) {
      if (!set.has(s.slug) && Number(s.listed_count) > 0) {
        // Only add if we have some NFT rows already (avoid empty ghosts)
        const has = nftAgg.find((x) => x.slug === s.slug)
        if (has && has.listed > 0) {
          // already considered
        } else if (has && has.listed === 0) {
          /* skip */
        } else if (!has && Number(s.listed_count) >= 5) {
          // Fall through: allow high-signal shells from collections table
          // when nfts table lagging — still need listed in nfts for pages
        }
      }
    }
  } catch {
    /* ignore */
  }
  readySlugCache = { at: now, set }
  return set
}

/** Invalidate ready cache after sync/enrich (optional callers) */
export function invalidateReadySlugCache() {
  readySlugCache = { at: 0, set: null }
}

/**
 * Per-collection content health for admin panel.
 * status: ready | partial | empty | shell
 * Ordered: verified first, then by listed count.
 */
export function dbContentStatus() {
  const database = getDb()
  const cols = database
    .prepare(
      `SELECT slug, name, image, floor_price, volume_24h, volume_total, listed_count, items,
              synced_at, contract_address
       FROM collections
       ORDER BY
         CASE WHEN volume_total >= ${VERIFIED_MIN_VOLUME_ETH} THEN 0 ELSE 1 END,
         volume_total DESC,
         listed_count DESC,
         volume_24h DESC`
    )
    .all()

  // Completeness uses listed-only art/meta (same as public marketplace gate)
  const completeAgg = dbNftCompletenessAgg()
  const bySlug = new Map(completeAgg.map((r) => [r.slug, r]))
  // total nfts (listed + unlisted) for admin display only
  const nftCounts = database
    .prepare(`SELECT slug, COUNT(*) AS nfts FROM nfts GROUP BY slug`)
    .all()
  const nftsBySlug = new Map(nftCounts.map((r) => [r.slug, Number(r.nfts || 0)]))

  let withListings = 0
  let empty = 0
  let shell = 0
  let ready = 0
  let partial = 0
  let withImage = 0
  let totalStubs = 0
  let totalEnriched = 0
  let totalListed = 0
  let totalNfts = 0

  const collections = cols.map((c) => {
    const a = bySlug.get(c.slug) || {
      listed: 0,
      enriched: 0,
      stubs: 0,
      missing_meta: 0,
    }
    const listed = Number(a.listed || c.listed_count || 0)
    const nfts = nftsBySlug.get(c.slug) || 0
    const enriched = Number(a.enriched || 0)
    const stubs = Number(a.stubs || 0)
    const missingMeta = Number(a.missing_meta || 0)
    const hasImage = Boolean(c.image && !String(c.image).includes('dicebear'))
    // Progress = min(art, meta) completeness toward 100% marketplace ready
    const complete = Math.min(enriched, listed - stubs, listed - missingMeta)
    const enrichPct =
      listed > 0
        ? Math.min(100, Math.round((Math.max(0, complete) / Math.max(listed, 1)) * 100))
        : 0

    const volumeTotal = Number(c.volume_total || 0)
    const verified =
      Number.isFinite(volumeTotal) && volumeTotal >= VERIFIED_MIN_VOLUME_ETH

    let status = 'shell'
    if (listed === 0 && nfts === 0) {
      status = c.synced_at ? 'empty' : 'shell'
      empty++
      if (!c.synced_at) shell++
    } else if (
      listed > 0 &&
      isContentReady(listed, enriched, stubs, missingMeta)
    ) {
      status = 'ready'
      ready++
    } else if (listed > 0) {
      status = 'partial'
      partial++
    } else {
      status = 'empty'
      empty++
    }
    if (listed > 0) withListings++
    if (hasImage) withImage++
    totalStubs += stubs
    totalEnriched += enriched
    totalListed += listed
    totalNfts += nfts

    return {
      slug: c.slug,
      name: c.name || c.slug,
      listedCount: listed,
      nftsCount: nfts,
      enrichedCount: enriched,
      stubCount: stubs,
      missingMetaCount: missingMeta,
      enrichPct,
      hasImage,
      floorPrice: c.floor_price || 0,
      volume24h: c.volume_24h || 0,
      volumeTotal,
      verified,
      items: c.items || 0,
      syncedAt: c.synced_at || null,
      contractAddress: c.contract_address || null,
      status,
    }
  })

  const verifiedCount = collections.filter((c) => c.verified).length

  // Keep public ready cache in sync with admin view (strict 100% only)
  readySlugCache = {
    at: Date.now(),
    set: new Set(
      collections.filter((c) => c.status === 'ready').map((c) => c.slug)
    ),
  }

  return {
    summary: {
      collections: cols.length,
      verified: verifiedCount,
      verifiedMinVolumeEth: VERIFIED_MIN_VOLUME_ETH,
      withListings,
      empty: empty - shell > 0 ? empty - shell : empty,
      shell,
      ready,
      partial,
      withImage,
      totalNfts,
      totalListed,
      totalEnriched,
      totalStubs,
      enrichPct:
        totalListed > 0
          ? Math.round((totalEnriched / totalListed) * 100)
          : 0,
    },
    collections,
  }
}

// ─── Analytics ─────────────────────────────────────────────────────────────

export function dbInsertVisit(v) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO visits (
        id, ts, at, path, page, session_id, wallet, ip_hash,
        country, country_code, region, city, timezone, locale, language,
        device, referrer, connected, payload_json
      ) VALUES (
        @id, @ts, @at, @path, @page, @session_id, @wallet, @ip_hash,
        @country, @country_code, @region, @city, @timezone, @locale, @language,
        @device, @referrer, @connected, @payload_json
      )`
    )
    .run({
      id: v.id,
      ts: v.ts,
      at: v.at,
      path: v.path || null,
      page: v.page || null,
      session_id: v.sessionId || null,
      wallet: v.wallet || null,
      ip_hash: v.ipHash || null,
      country: v.geo?.country || null,
      country_code: v.geo?.countryCode || null,
      region: v.geo?.region || null,
      city: v.geo?.city || null,
      timezone: v.timezone || v.geo?.timezone || null,
      locale: v.locale || null,
      language: v.language || null,
      device: v.device || null,
      referrer: v.referrer || null,
      connected: v.connected ? 1 : 0,
      payload_json: JSON.stringify(v),
    })
}

export function dbUpsertUser(u) {
  getDb()
    .prepare(
      `INSERT INTO users (
        id, kind, wallet, session_id, visits, first_seen, last_seen, last_path,
        locale, timezone, top_country, top_device, countries_json, devices_json, last_geo_json
      ) VALUES (
        @id, @kind, @wallet, @session_id, @visits, @first_seen, @last_seen, @last_path,
        @locale, @timezone, @top_country, @top_device, @countries_json, @devices_json, @last_geo_json
      )
      ON CONFLICT(id) DO UPDATE SET
        kind=excluded.kind,
        wallet=excluded.wallet,
        session_id=excluded.session_id,
        visits=excluded.visits,
        last_seen=excluded.last_seen,
        last_path=excluded.last_path,
        locale=excluded.locale,
        timezone=excluded.timezone,
        top_country=excluded.top_country,
        top_device=excluded.top_device,
        countries_json=excluded.countries_json,
        devices_json=excluded.devices_json,
        last_geo_json=excluded.last_geo_json`
    )
    .run({
      id: u.id,
      kind: u.kind,
      wallet: u.wallet || null,
      session_id: u.sessionId || null,
      visits: u.visits || 0,
      first_seen: u.firstSeen,
      last_seen: u.lastSeen,
      last_path: u.lastPath || null,
      locale: u.locale || null,
      timezone: u.timezone || null,
      top_country: u.topCountry || null,
      top_device: u.topDevice || null,
      countries_json: JSON.stringify(u.countries || {}),
      devices_json: JSON.stringify(u.devices || {}),
      last_geo_json: JSON.stringify(u.lastGeo || null),
    })
}

export function dbGetUser(id) {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    wallet: row.wallet,
    sessionId: row.session_id,
    visits: row.visits,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    lastPath: row.last_path,
    locale: row.locale,
    timezone: row.timezone,
    topCountry: row.top_country,
    topDevice: row.top_device,
    countries: parseJson(row.countries_json, {}),
    devices: parseJson(row.devices_json, {}),
    lastGeo: parseJson(row.last_geo_json, null),
  }
}

export function dbListVisits(limit = 8000) {
  return getDb()
    .prepare('SELECT * FROM visits ORDER BY ts DESC LIMIT ?')
    .all(limit)
    .map((r) => ({
      id: r.id,
      ts: r.ts,
      at: r.at,
      path: r.path,
      page: r.page,
      sessionId: r.session_id,
      wallet: r.wallet,
      ipHash: r.ip_hash,
      geo: {
        country: r.country,
        countryCode: r.country_code,
        region: r.region,
        city: r.city,
        timezone: r.timezone,
      },
      timezone: r.timezone,
      locale: r.locale,
      language: r.language,
      device: r.device,
      referrer: r.referrer,
      connected: Boolean(r.connected),
    }))
    .reverse()
}

export function dbListUsers(limit = 4000) {
  return getDb()
    .prepare('SELECT * FROM users ORDER BY last_seen DESC LIMIT ?')
    .all(limit)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      wallet: r.wallet,
      sessionId: r.session_id,
      visits: r.visits,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      lastPath: r.last_path,
      locale: r.locale,
      timezone: r.timezone,
      topCountry: r.top_country,
      topDevice: r.top_device,
      countries: parseJson(r.countries_json, {}),
      devices: parseJson(r.devices_json, {}),
      lastGeo: parseJson(r.last_geo_json, null),
    }))
}

export function dbTrimVisits(max = 8000) {
  const database = getDb()
  const count = database.prepare('SELECT COUNT(*) AS c FROM visits').get().c
  if (count <= max) return
  database
    .prepare(
      `DELETE FROM visits WHERE id IN (
         SELECT id FROM visits ORDER BY ts ASC LIMIT ?
       )`
    )
    .run(count - max)
}

/**
 * One-time import of legacy index-store.json + analytics-store.json if present.
 */
export function migrateJsonIfNeeded() {
  const database = getDb()
  const already = metaGet('json_migrated', false)
  if (already) return

  const storeFile = path.join(DATA_DIR, 'index-store.json')
  if (fs.existsSync(storeFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(storeFile, 'utf8'))
      if (raw?.collections) {
        for (const [slug, row] of Object.entries(raw.collections)) {
          dbUpsertCollection({ ...row, slug })
          if (row.nfts?.length) {
            dbReplaceNfts(slug, row.nfts, row.collectionId || `os-${slug}`)
          }
        }
        console.log(
          `[db] migrated ${Object.keys(raw.collections).length} collections from JSON`
        )
      }
      if (raw?.meta) {
        for (const [k, v] of Object.entries(raw.meta)) {
          if (k === 'startedAt') continue
          metaSet(k, v)
        }
      }
    } catch (e) {
      console.warn('[db] JSON collection migrate failed', e?.message || e)
    }
  }

  const analyticsFile = path.join(DATA_DIR, 'analytics-store.json')
  if (fs.existsSync(analyticsFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(analyticsFile, 'utf8'))
      if (Array.isArray(raw.visits)) {
        for (const v of raw.visits) {
          try {
            dbInsertVisit({
              ...v,
              geo: v.geo || {},
              sessionId: v.sessionId,
              ipHash: v.ipHash,
            })
          } catch {
            /* skip bad row */
          }
        }
        console.log(`[db] migrated ${raw.visits.length} visits from JSON`)
      }
      if (raw.users && typeof raw.users === 'object') {
        for (const u of Object.values(raw.users)) {
          try {
            dbUpsertUser(u)
          } catch {
            /* skip */
          }
        }
      }
      if (raw.stats) {
        for (const [k, v] of Object.entries(raw.stats)) metaSet(`analytics_${k}`, v)
      }
    } catch (e) {
      console.warn('[db] JSON analytics migrate failed', e?.message || e)
    }
  }

  metaSet('json_migrated', true)
  console.log('[db] migration flag set', dbStats())
}
