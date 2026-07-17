/**
 * OpenHood indexer API — Fly-ready Node server.
 *
 * Market data:
 *   GET  /health
 *   GET  /v1/status
 *   GET  /v1/collections
 *   GET  /v1/collections/:slug
 *   POST /v1/sync | /v1/sync/:slug
 *
 * Analytics (admin dashboard):
 *   POST /v1/analytics/visit
 *   GET  /v1/analytics/dashboard
 */
import http from 'node:http'
import fs from 'node:fs'
import {
  loadFromDisk,
  getCollection,
  getNft,
  listCollections,
  listCollectionSummaries,
  getMeta,
  saveToDisk,
  storageInfo,
} from './store.js'
import {
  defaultSlugs,
  enrichPass,
  enqueueSync,
  isSyncBusy,
  queueDepth,
  syncOnce,
  syncSlugMeta,
  warmPriority,
} from './sync.js'
import { fetchNft } from './opensea.js'
import {
  analyticsCounts,
  buildDashboard,
  loadAnalytics,
  recordVisit,
  saveAnalytics,
} from './analytics.js'
import {
  cacheRemoteMedia,
  ensureMediaDir,
  mediaCachePass,
  mediaStats,
  proxyMediaPath,
  resolveCollectionMedia,
  resolveNftMedia,
} from './media.js'

const PORT = Number(process.env.PORT || 8080)
const SYNC_SECRET = (process.env.SYNC_SECRET || '').trim()
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 45_000)

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-sync-secret, x-admin-key'
  )
  res.setHeader('Access-Control-Max-Age', '86400')
}

function json(res, status, body, cacheSec = 0) {
  cors(res)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control':
      status === 200 && cacheSec > 0
        ? `public, max-age=${cacheSec}`
        : 'no-store',
  })
  res.end(JSON.stringify(body))
}

function sendFile(res, filePath, contentType, cacheSec = 86400) {
  cors(res)
  const buf = fs.readFileSync(filePath)
  res.writeHead(200, {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Length': buf.length,
    'Cache-Control': `public, max-age=${cacheSec}, immutable`,
  })
  res.end(buf)
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size < 64_000) chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

function authorized(req) {
  if (!SYNC_SECRET) return true
  const h = req.headers['x-sync-secret'] || req.headers['x-admin-key']
  return h === SYNC_SECRET
}

function summarize(row) {
  return {
    slug: row.slug,
    collectionId: row.collectionId,
    name: row.name,
    image: row.image,
    banner: row.banner,
    floorPrice: row.floorPrice,
    volume24h: row.volume24h,
    volumeTotal: row.volumeTotal,
    owners: row.owners,
    items: row.items,
    listedCount: row.listedCount,
    listedPct: row.listedPct,
    contractAddress: row.contractAddress,
    chain: row.chain,
    source: row.source,
    syncedAt: row.syncedAt,
    activityCount: row.activities?.length || 0,
    offerCount: row.offers?.length || 0,
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const { pathname } = url

  if (req.method === 'OPTIONS') {
    cors(res)
    res.writeHead(204)
    res.end()
    return
  }

  try {
    if (req.method === 'GET' && pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'openhood-indexer',
        ts: Date.now(),
        uptimeSec: Math.floor(process.uptime()),
        ...analyticsCounts(),
        media: mediaStats(),
      })
    }

    if (req.method === 'GET' && pathname === '/v1/status') {
      return json(res, 200, {
        ...getMeta(),
        busy: isSyncBusy(),
        queueDepth: queueDepth(),
        slugs: defaultSlugs(),
        hasOpenSeaKey: Boolean(
          (process.env.OPENSEA_API_KEY || process.env.VITE_OPENSEA_API_KEY || '').trim()
        ),
        analytics: analyticsCounts(),
        storage: storageInfo(),
        media: mediaStats(),
        uptimeSec: Math.floor(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      })
    }

    // —— Media cache (images stored on Fly volume) ——
    // GET /v1/media/nft/:slug/:tokenId
    if (req.method === 'GET' && pathname.startsWith('/v1/media/nft/')) {
      const parts = pathname.slice('/v1/media/nft/'.length).split('/').filter(Boolean)
      const slug = decodeURIComponent(parts[0] || '')
      const tokenId = decodeURIComponent(parts[1] || '')
      if (!slug || !tokenId) return json(res, 400, { error: 'slug and tokenId required' })
      const media = await resolveNftMedia(slug, tokenId)
      if (!media) {
        // optional redirect to remote fallback query
        const fb = url.searchParams.get('fallback')
        if (fb && /^https?:\/\//i.test(fb)) {
          cors(res)
          res.writeHead(302, { Location: fb })
          res.end()
          return
        }
        return json(res, 404, { error: 'image not found' })
      }
      return sendFile(res, media.path, media.contentType, 604800)
    }

    // GET /v1/media/collection/:slug
    if (req.method === 'GET' && pathname.startsWith('/v1/media/collection/')) {
      const slug = decodeURIComponent(pathname.slice('/v1/media/collection/'.length))
      if (!slug) return json(res, 400, { error: 'slug required' })
      const media = await resolveCollectionMedia(slug)
      if (!media) {
        const fb = url.searchParams.get('fallback')
        if (fb && /^https?:\/\//i.test(fb)) {
          cors(res)
          res.writeHead(302, { Location: fb })
          res.end()
          return
        }
        return json(res, 404, { error: 'collection image not found' })
      }
      return sendFile(res, media.path, media.contentType, 604800)
    }

    // GET /v1/media/proxy?url=
    if (req.method === 'GET' && pathname === '/v1/media/proxy') {
      const remote = url.searchParams.get('url')
      if (!remote || !/^https?:\/\//i.test(remote)) {
        return json(res, 400, { error: 'url required' })
      }
      const base = proxyMediaPath(remote)
      const hit = await cacheRemoteMedia(remote, base)
      if (!hit) return json(res, 404, { error: 'proxy fetch failed' })
      return sendFile(res, hit.path, hit.contentType, 604800)
    }

    if (req.method === 'GET' && pathname === '/v1/collections') {
      const rows = listCollections().map(summarize)
      return json(res, 200, { collections: rows, count: rows.length }, 5)
    }

    // GET /v1/nfts/:id  — detail page resolve after refresh
    if (req.method === 'GET' && pathname.startsWith('/v1/nfts/')) {
      const rawId = decodeURIComponent(pathname.slice('/v1/nfts/'.length))
      if (!rawId) return json(res, 400, { error: 'missing id' })
      let nft = getNft(rawId)
      if (!nft) {
        // Live OpenSea fallback: ?slug=&tokenId=&contract=
        const slug = url.searchParams.get('slug')
        const tokenId = url.searchParams.get('tokenId')
        const contract = url.searchParams.get('contract')
        const chain = url.searchParams.get('chain') || 'robinhood'
        if (slug && tokenId && contract) {
          try {
            const raw = await fetchNft(chain, contract, tokenId)
            if (raw) {
              const price = url.searchParams.get('price')
              nft = {
                id: `os-${slug}-os-${tokenId}`,
                tokenId: Number(tokenId) || 0,
                name: raw.name || `#${tokenId}`,
                collectionId: `os-${slug}`,
                image: raw.image_url || raw.display_image_url || '',
                owner: raw.owners?.[0]?.address?.toLowerCase() || 'unknown',
                listed: price != null && Number(price) > 0,
                price: price != null ? Number(price) : undefined,
                traits: (raw.traits || [])
                  .filter((t) => t.trait_type != null && t.value != null)
                  .map((t) => ({
                    trait_type: String(t.trait_type),
                    value: String(t.value),
                  })),
                _slug: slug,
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
      if (!nft) return json(res, 404, { error: 'nft not found', id: rawId })
      const { _slug, ...rest } = nft
      return json(
        res,
        200,
        { nft: rest, slug: _slug || null },
        30
      )
    }

    if (req.method === 'GET' && pathname.startsWith('/v1/collections/')) {
      const rest = pathname.slice('/v1/collections/'.length)
      const parts = rest.split('/').filter(Boolean)
      const slug = decodeURIComponent(parts[0] || '')
      if (!slug) return json(res, 400, { error: 'missing slug' })

      // GET /v1/collections/:slug/nfts/:tokenId
      if (parts[1] === 'nfts' && parts[2]) {
        const tokenId = decodeURIComponent(parts[2])
        let nft = getNft(slug, tokenId)
        if (!nft) {
          const row = getCollection(slug)
          if (row?.contractAddress) {
            try {
              const raw = await fetchNft(
                row.chain || 'robinhood',
                row.contractAddress,
                tokenId
              )
              if (raw) {
                nft = {
                  id: `${row.collectionId || `os-${slug}`}-os-${tokenId}`,
                  tokenId: Number(tokenId) || 0,
                  name: raw.name || `#${tokenId}`,
                  collectionId: row.collectionId || `os-${slug}`,
                  image: raw.image_url || raw.display_image_url || '',
                  owner: raw.owners?.[0]?.address?.toLowerCase() || 'unknown',
                  listed: false,
                  traits: (raw.traits || [])
                    .filter((t) => t.trait_type != null && t.value != null)
                    .map((t) => ({
                      trait_type: String(t.trait_type),
                      value: String(t.value),
                    })),
                  _slug: slug,
                }
              }
            } catch {
              /* ignore */
            }
          }
        }
        if (!nft) return json(res, 404, { error: 'nft not found', slug, tokenId })
        const { _slug, ...restNft } = nft
        return json(res, 200, { nft: restNft, slug }, 30)
      }

      // Fast path: always serve SQLite if we have data (no OpenSea wait)
      let row = getCollection(slug)
      if (row?.nfts?.length) {
        // Keep improving in background if stubs remain
        const stubs = (row.nfts || []).filter(
          (n) =>
            !n.image ||
            String(n.image).includes('dicebear') ||
            /image_type_(logo|hero)/i.test(n.image)
        ).length
        if (stubs > 10) enqueueSync(slug, { full: true })
      } else {
        // Not indexed yet: try quick meta sync with hard timeout, else 202
        try {
          row = await Promise.race([
            syncSlugMeta(slug),
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error('meta timeout')), 12_000)
            ),
          ])
          enqueueSync(slug, { full: true }) // art fills in background
        } catch (e) {
          enqueueSync(slug, { full: true, front: true })
          return json(
            res,
            202,
            {
              indexing: true,
              slug,
              error: e?.message || 'indexing',
              message:
                'Collection is being indexed. Poll this endpoint again in a few seconds.',
              nfts: [],
              activities: [],
              offers: [],
              listedCount: 0,
            },
            0
          )
        }
      }

      if (!row?.nfts?.length) {
        return json(res, 202, {
          indexing: true,
          slug,
          nfts: [],
          listedCount: 0,
          activities: [],
          offers: [],
        })
      }

      const lite = url.searchParams.get('lite') !== '0'
      const limit = Math.min(
        500,
        Math.max(1, Number(url.searchParams.get('limit') || (lite ? 120 : 300)))
      )
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))
      const allNfts = row.nfts || []
      const slice = allNfts.slice(offset, offset + limit)
      // Lean cards: drop heavy traits on first paint
      const leanNfts = lite
        ? slice.map((n) => ({
            id: n.id,
            tokenId: n.tokenId,
            name: n.name,
            collectionId: n.collectionId,
            image: n.image,
            owner: n.owner,
            listed: n.listed,
            price: n.price,
            rarityRank: n.rarityRank,
          }))
        : slice

      return json(
        res,
        200,
        {
          ...summarize(row),
          description: row.description,
          indexPhase: row.indexPhase,
          nfts: leanNfts,
          nftsTotal: allNfts.length,
          offset,
          limit,
          hasMore: offset + limit < allNfts.length,
          activities: (row.activities || []).slice(0, lite ? 30 : 80),
          offers: (row.offers || []).slice(0, lite ? 30 : 80),
          prices: lite ? undefined : row.prices || [],
        },
        5
      )
    }

    // —— Analytics ——
    if (req.method === 'POST' && pathname === '/v1/analytics/visit') {
      const body = await readBody(req)
      const result = await recordVisit(req, body)
      return json(res, 200, result)
    }

    if (
      req.method === 'GET' &&
      (pathname === '/v1/analytics/dashboard' || pathname === '/v1/admin/dashboard')
    ) {
      // Optional lock: if SYNC_SECRET set and ADMIN_OPEN=0, require key
      const lock = process.env.ADMIN_DASHBOARD_OPEN === '0'
      if (lock && !authorized(req)) {
        return json(res, 401, { error: 'unauthorized' })
      }
      const dash = buildDashboard({
        collections: listCollectionSummaries(),
        serverMeta: {
          ...getMeta(),
          busy: isSyncBusy(),
          hasOpenSeaKey: Boolean(
            (process.env.OPENSEA_API_KEY || process.env.VITE_OPENSEA_API_KEY || '').trim()
          ),
          slugs: defaultSlugs(),
        },
      })
      return json(res, 200, dash)
    }

    if (req.method === 'POST' && pathname === '/v1/sync') {
      if (!authorized(req)) return json(res, 401, { error: 'unauthorized' })
      const meta = await syncOnce()
      return json(res, 200, { ok: true, meta })
    }

    if (req.method === 'POST' && pathname.startsWith('/v1/sync/')) {
      if (!authorized(req)) return json(res, 401, { error: 'unauthorized' })
      const slug = decodeURIComponent(pathname.slice('/v1/sync/'.length))
      const row = await syncSlug(slug)
      return json(res, 200, { ok: true, summary: summarize(row) })
    }

    return json(res, 404, { error: 'not found' })
  } catch (e) {
    console.error('[http]', e)
    return json(res, 500, { error: e?.message || 'server error' })
  }
})

async function main() {
  loadFromDisk()
  loadAnalytics()
  ensureMediaDir()

  const once = process.argv.includes('--once')
  if (once) {
    await warmPriority()
    saveToDisk()
    saveAnalytics()
    process.exit(0)
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[openhood-indexer] listening on :${PORT}`)
    console.log(`[openhood-indexer] slugs: ${defaultSlugs().join(', ')}`)
    console.log(
      `[openhood-indexer] OpenSea key: ${
        (process.env.OPENSEA_API_KEY || process.env.VITE_OPENSEA_API_KEY || '').trim()
          ? 'yes'
          : 'NO — set OPENSEA_API_KEY'
      }`
    )
    console.log(`[openhood-indexer] media cache on volume · ${JSON.stringify(mediaStats())}`)
  })

  // Phase 1: meta pre-index (listings + offers + events + catalog names)
  setTimeout(() => {
    void warmPriority().catch((e) => console.error('[warm]', e))
  }, 500)

  setInterval(() => {
    void syncOnce().catch((e) => console.error('[loop]', e))
  }, SYNC_INTERVAL_MS)

  // Phase 2: fill remaining metadata stubs
  setInterval(() => {
    void enrichPass().catch((e) => console.error('[enrich]', e))
  }, Number(process.env.ENRICH_INTERVAL_MS || 20_000))

  // Phase 3: download token art onto Fly disk for fast serving
  setInterval(() => {
    void mediaCachePass({ perCollection: 40 }).catch((e) =>
      console.error('[media]', e)
    )
  }, Number(process.env.MEDIA_INTERVAL_MS || 25_000))

  // Persist analytics periodically
  setInterval(() => saveAnalytics(), 60_000)

  const shutdown = () => {
    console.log('[shutdown] saving…')
    saveToDisk()
    saveAnalytics()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
