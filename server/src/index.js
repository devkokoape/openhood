/**
 * OpenHood indexer API — Fly-ready Node server.
 *
 * GET  /health
 * GET  /v1/status
 * GET  /v1/collections
 * GET  /v1/collections/:slug   → full market payload (listings, activity, offers)
 * POST /v1/sync/:slug          → force resync (header x-sync-secret)
 * POST /v1/sync                → sync next batch
 */
import http from 'node:http'
import { loadFromDisk, getCollection, listCollections, getMeta, saveToDisk } from './store.js'
import { defaultSlugs, isSyncBusy, syncOnce, syncSlug, warmPriority } from './sync.js'

const PORT = Number(process.env.PORT || 8080)
const SYNC_SECRET = (process.env.SYNC_SECRET || '').trim()
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 45_000)

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-sync-secret')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function json(res, status, body) {
  cors(res)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=5' : 'no-store',
  })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
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
  return req.headers['x-sync-secret'] === SYNC_SECRET
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
      return json(res, 200, { ok: true, service: 'openhood-indexer', ts: Date.now() })
    }

    if (req.method === 'GET' && pathname === '/v1/status') {
      return json(res, 200, {
        ...getMeta(),
        busy: isSyncBusy(),
        slugs: defaultSlugs(),
        hasOpenSeaKey: Boolean(
          (process.env.OPENSEA_API_KEY || process.env.VITE_OPENSEA_API_KEY || '').trim()
        ),
      })
    }

    if (req.method === 'GET' && pathname === '/v1/collections') {
      const rows = listCollections().map(summarize)
      return json(res, 200, { collections: rows, count: rows.length })
    }

    if (req.method === 'GET' && pathname.startsWith('/v1/collections/')) {
      const slug = decodeURIComponent(pathname.slice('/v1/collections/'.length).split('/')[0])
      if (!slug) return json(res, 400, { error: 'missing slug' })

      let row = getCollection(slug)
      // On-demand sync if missing (first hit)
      if (!row?.nfts?.length) {
        try {
          row = await syncSlug(slug)
        } catch (e) {
          return json(res, 404, {
            error: 'collection not indexed',
            detail: e?.message || String(e),
            slug,
          })
        }
      }

      const lite = url.searchParams.get('lite') === '1'
      if (lite) {
        return json(res, 200, {
          ...summarize(row),
          nfts: (row.nfts || []).slice(0, 200),
          activities: (row.activities || []).slice(0, 40),
          offers: (row.offers || []).slice(0, 30),
        })
      }

      return json(res, 200, {
        ...summarize(row),
        description: row.description,
        nfts: row.nfts || [],
        activities: row.activities || [],
        offers: row.offers || [],
        prices: row.prices || [],
      })
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

  const once = process.argv.includes('--once')
  if (once) {
    await warmPriority()
    saveToDisk()
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
  })

  // Warm priority collections shortly after boot
  setTimeout(() => {
    void warmPriority().catch((e) => console.error('[warm]', e))
  }, 800)

  // Continuous batch sync
  setInterval(() => {
    void syncOnce().catch((e) => console.error('[loop]', e))
  }, SYNC_INTERVAL_MS)

  const shutdown = () => {
    console.log('[shutdown] saving…')
    saveToDisk()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
