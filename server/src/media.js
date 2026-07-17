/**
 * Local image cache on Fly volume — serve NFT/collection art from our server
 * after first fetch so the marketplace loads images faster than OpenSea CDN alone.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getDataDir } from './db.js'
import { dbGetNftBySlugToken, getDb } from './db.js'

const MEDIA_DIR = () => path.join(getDataDir(), 'media')

export function ensureMediaDir() {
  try {
    fs.mkdirSync(path.join(MEDIA_DIR(), 'nft'), { recursive: true })
    fs.mkdirSync(path.join(MEDIA_DIR(), 'col'), { recursive: true })
    fs.mkdirSync(path.join(MEDIA_DIR(), 'proxy'), { recursive: true })
  } catch {
    /* ignore */
  }
}

function extFromContentType(ct, url) {
  const c = (ct || '').toLowerCase()
  if (c.includes('png')) return '.png'
  if (c.includes('jpeg') || c.includes('jpg')) return '.jpg'
  if (c.includes('webp')) return '.webp'
  if (c.includes('gif')) return '.gif'
  if (c.includes('svg')) return '.svg'
  if (c.includes('mp4')) return '.mp4'
  if (c.includes('webm')) return '.webm'
  const m = String(url || '').split('?')[0].match(/\.(png|jpe?g|webp|gif|svg|mp4|webm)$/i)
  return m ? `.${m[1].toLowerCase().replace('jpeg', 'jpg')}` : '.img'
}

function contentTypeFromExt(ext) {
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    default:
      return 'application/octet-stream'
  }
}

function hashUrl(url) {
  return crypto.createHash('sha1').update(String(url)).digest('hex')
}

/**
 * Download remote media to destPath if missing. Returns { path, contentType } or null.
 */
export async function cacheRemoteMedia(url, destBaseNoExt) {
  if (!url || !/^https?:\/\//i.test(url)) return null
  if (url.includes('dicebear.com')) return null

  ensureMediaDir()
  // already cached with any ext?
  for (const ext of ['.png', '.jpg', '.webp', '.gif', '.svg', '.mp4', '.webm', '.img']) {
    const p = destBaseNoExt + ext
    if (fs.existsSync(p) && fs.statSync(p).size > 100) {
      return { path: p, contentType: contentTypeFromExt(ext) }
    }
  }

  try {
    const res = await fetch(url, {
      headers: {
        accept: 'image/*,video/*,*/*',
        'user-agent': 'openhood-indexer/1.0',
      },
      signal: AbortSignal.timeout(20_000),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    const ext = extFromContentType(ct, url)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 50) return null
    const dest = destBaseNoExt + ext
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const tmp = dest + '.tmp'
    fs.writeFileSync(tmp, buf)
    fs.renameSync(tmp, dest)
    return { path: dest, contentType: contentTypeFromExt(ext) || ct }
  } catch (e) {
    console.warn('[media] cache fail', url?.slice(0, 80), e?.message || e)
    return null
  }
}

export function nftMediaPath(slug, tokenId) {
  const safeSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeTok = String(tokenId).replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(MEDIA_DIR(), 'nft', safeSlug, safeTok)
}

export function collectionMediaPath(slug) {
  const safeSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(MEDIA_DIR(), 'col', safeSlug)
}

export function proxyMediaPath(url) {
  return path.join(MEDIA_DIR(), 'proxy', hashUrl(url))
}

/** Cache NFT image from DB remote URL */
export async function cacheNftMedia(slug, tokenId, remoteUrl) {
  const base = nftMediaPath(slug, tokenId)
  return cacheRemoteMedia(remoteUrl, base)
}

/** Find cached nft file */
export function findCachedNft(slug, tokenId) {
  const base = nftMediaPath(slug, tokenId)
  for (const ext of ['.png', '.jpg', '.webp', '.gif', '.svg', '.img']) {
    const p = base + ext
    if (fs.existsSync(p) && fs.statSync(p).size > 100) {
      return { path: p, contentType: contentTypeFromExt(ext) }
    }
  }
  return null
}

export function findCachedFile(baseNoExt) {
  for (const ext of ['.png', '.jpg', '.webp', '.gif', '.svg', '.mp4', '.webm', '.img']) {
    const p = baseNoExt + ext
    if (fs.existsSync(p) && fs.statSync(p).size > 100) {
      return { path: p, contentType: contentTypeFromExt(ext) }
    }
  }
  return null
}

/**
 * Resolve media for HTTP response: local cache or fetch+cache from remote.
 */
export async function resolveNftMedia(slug, tokenId) {
  const hit = findCachedNft(slug, tokenId)
  if (hit) return { ...hit, cached: true }

  const row = dbGetNftBySlugToken(slug, tokenId)
  const remote = row?.image
  if (!remote || remote.includes('dicebear')) return null

  const cached = await cacheNftMedia(slug, tokenId, remote)
  if (cached) return { ...cached, cached: false }
  return null
}

export async function resolveCollectionMedia(slug) {
  const base = collectionMediaPath(slug)
  const hit = findCachedFile(base)
  if (hit) return { ...hit, cached: true }

  const row = getDb().prepare('SELECT image, banner FROM collections WHERE slug = ?').get(slug)
  // Prefer still logo over video banner for card thumbs
  const remote = row?.image || row?.banner
  if (!remote) return null
  if (/\.(mp4|webm)(\?|$)/i.test(remote)) {
    // try logo only
    if (row?.image && row.image !== remote) {
      const c = await cacheRemoteMedia(row.image, base)
      if (c) return { ...c, cached: false }
    }
    return null
  }
  const c = await cacheRemoteMedia(remote, base)
  return c ? { ...c, cached: false } : null
}

/**
 * Background: cache images for listed NFTs missing local files.
 */
let mediaBusy = false
export async function mediaCachePass({ perCollection = 30 } = {}) {
  if (mediaBusy) return
  mediaBusy = true
  try {
    ensureMediaDir()
    const cols = getDb()
      .prepare('SELECT slug FROM collections ORDER BY volume_24h DESC')
      .all()
    for (const { slug } of cols) {
      const rows = getDb()
        .prepare(
          `SELECT token_id, image FROM nfts
           WHERE slug = ? AND listed = 1 AND image IS NOT NULL AND image != ''
           AND image NOT LIKE '%dicebear%'
           ORDER BY price ASC
           LIMIT 200`
        )
        .all(slug)
      let n = 0
      for (const r of rows) {
        if (findCachedNft(slug, r.token_id)) continue
        await cacheNftMedia(slug, r.token_id, r.image)
        n++
        if (n >= perCollection) break
        await new Promise((r) => setTimeout(r, 30))
      }
      if (n > 0) console.log(`[media] cached ${n} images for ${slug}`)
      // one collection per pass
      if (n > 0) break
    }
  } finally {
    mediaBusy = false
  }
}

export function mediaStats() {
  ensureMediaDir()
  let files = 0
  let bytes = 0
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      const st = fs.statSync(p)
      if (st.isDirectory()) walk(p)
      else {
        files++
        bytes += st.size
      }
    }
  }
  walk(MEDIA_DIR())
  return { files, bytes, mb: Math.round(bytes / 1024 / 1024) }
}
