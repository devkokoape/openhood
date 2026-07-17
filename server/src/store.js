/**
 * In-memory + optional disk persistence (Fly volume at /data).
 */
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : './data')
const STORE_FILE = path.join(DATA_DIR, 'index-store.json')

/** @type {Map<string, any>} */
const collections = new Map()

let meta = {
  startedAt: new Date().toISOString(),
  lastFullSyncAt: null,
  lastError: null,
  syncCount: 0,
  slugQueue: [],
}

export function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  } catch {
    /* ignore */
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
      }
    }
    if (raw?.meta) meta = { ...meta, ...raw.meta, startedAt: meta.startedAt }
    console.log(`[store] loaded ${collections.size} collections from disk`)
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
    const obj = {
      meta,
      collections: Object.fromEntries(collections.entries()),
      savedAt: new Date().toISOString(),
    }
    const tmp = `${STORE_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(obj))
    fs.renameSync(tmp, STORE_FILE)
  } catch (e) {
    console.warn('[store] save failed', e?.message || e)
  }
}

export function getMeta() {
  return {
    ...meta,
    collectionCount: collections.size,
    listedTotal: [...collections.values()].reduce(
      (s, c) => s + (c.listedCount || 0),
      0
    ),
  }
}

export function setMeta(patch) {
  meta = { ...meta, ...patch }
  scheduleSave()
}

export function putCollection(slug, row) {
  collections.set(slug, {
    ...row,
    slug,
    updatedAt: new Date().toISOString(),
  })
  scheduleSave()
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
