/**
 * Refresh Robinhood OpenSea snapshot JSON (stats + collection meta).
 * Run: node scripts/refresh-opensea-snapshot.cjs
 * Optional: OPENSEA_API_KEY=... for list endpoints / higher limits.
 */
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'src', 'data', 'opensea-robinhood-snapshot.json')
const API = 'https://api.opensea.io/api/v2'

const FALLBACK_SLUGS = [
  'onchainhoodies-',
  'gremlin-cartel',
  'robinhood-punks',
  'robinhood-pengs',
  'robinhoodmigos',
  'py0py0py0py0',
  'ascii-cats-robinhood',
  'robbin-hood-babies',
  'hoodiliosnft',
  'hoodini',
]

function headers() {
  const h = { accept: 'application/json' }
  const key = process.env.OPENSEA_API_KEY || process.env.VITE_OPENSEA_API_KEY
  if (key) h['X-API-KEY'] = key
  return h
}

async function get(url) {
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

async function main() {
  let slugs = FALLBACK_SLUGS
  try {
    const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'))
    if (Array.isArray(existing) && existing.length) {
      slugs = existing.map((r) => r.slug).filter(Boolean)
    }
  } catch {
    /* use fallback */
  }

  // Prefer discovery list when key present
  if (process.env.OPENSEA_API_KEY || process.env.VITE_OPENSEA_API_KEY) {
    try {
      const listed = await get(
        `${API}/collections?chain=robinhood&limit=50&order_by=seven_day_volume`
      )
      if (listed.collections?.length) {
        slugs = listed.collections.map((c) => c.collection).filter(Boolean)
        console.log('Discovered', slugs.length, 'Robinhood collections')
      }
    } catch (e) {
      console.warn('List collections failed, using known slugs:', e.message)
    }
  }

  let previous = []
  try {
    previous = JSON.parse(fs.readFileSync(OUT, 'utf8'))
    if (!Array.isArray(previous)) previous = []
  } catch {
    previous = []
  }
  const prevBySlug = new Map(previous.map((r) => [r.slug, r]))

  const rows = []
  for (const slug of slugs) {
    try {
      const [collection, stats] = await Promise.all([
        get(`${API}/collections/${encodeURIComponent(slug)}`),
        get(`${API}/collections/${encodeURIComponent(slug)}/stats`),
      ])
      if (stats?.total && collection?.name) {
        rows.push({ slug, collection, stats })
        console.log(
          '✓',
          slug,
          'floor',
          stats.total.floor_price,
          'vol24',
          stats.intervals?.find((i) => i.interval === 'one_day')?.volume
        )
      } else if (prevBySlug.has(slug)) {
        rows.push(prevBySlug.get(slug))
        console.warn('~ kept previous', slug)
      }
    } catch (e) {
      if (prevBySlug.has(slug)) {
        rows.push(prevBySlug.get(slug))
        console.warn('~ kept previous', slug, e.message)
      } else {
        console.warn('✗', slug, e.message)
      }
    }
    await new Promise((r) => setTimeout(r, 350))
  }

  // Keep any previous rows not in this run
  for (const [slug, row] of prevBySlug) {
    if (!rows.find((r) => r.slug === slug)) rows.push(row)
  }

  if (!rows.length) {
    console.error('No rows fetched — aborting write')
    process.exit(1)
  }

  rows.sort(
    (a, b) =>
      (b.stats.total?.volume || 0) - (a.stats.total?.volume || 0)
  )
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n')
  console.log('Wrote', rows.length, 'collections →', OUT)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
