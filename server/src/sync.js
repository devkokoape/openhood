/**
 * Background sync: OpenSea → store
 */
import {
  enrichImages,
  fetchAllBestListings,
  fetchCollection,
  fetchCollectionEvents,
  fetchCollectionOffers,
  fetchCollectionStats,
  listingsToNfts,
  mapEvents,
  mapOffers,
} from './opensea.js'
import {
  getCollection,
  getMeta,
  listCollections,
  patchCollectionNfts,
  putCollection,
  setMeta,
  unenrichedTokens,
} from './store.js'
import { fetchNft } from './opensea.js'

/** Priority slugs (high volume / demo) — always first. */
export const PRIORITY_SLUGS = [
  'gremlin-cartel',
  'onchainhoodies-',
  'robinhood-punks',
  'robbin-hood-babies',
  'pixelhoodclan',
  'hoodini',
  'robinhood-kitties',
  'py0py0py0py0',
]

/** Extra Robinhood slugs from snapshot catalog (can override via env). */
export function defaultSlugs() {
  const env = (process.env.INDEX_SLUGS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (env.length) return [...new Set([...PRIORITY_SLUGS, ...env])]
  return [...PRIORITY_SLUGS]
}

let busy = false
let cursor = 0

export async function syncSlug(slug) {
  const t0 = Date.now()
  console.log(`[sync] start ${slug}`)

  const collectionId = `os-${slug}`
  const [listings, events, offerRows, stats, colMeta] = await Promise.all([
    fetchAllBestListings(slug, { maxPages: 80 }),
    fetchCollectionEvents(slug, 50),
    fetchCollectionOffers(slug, 3),
    fetchCollectionStats(slug),
    fetchCollection(slug),
  ])

  if (!listings.length) {
    const prev = getCollection(slug)
    if (prev?.nfts?.length) {
      console.warn(`[sync] ${slug}: empty listings, keeping previous ${prev.nfts.length}`)
      return prev
    }
    throw new Error(`No listings for ${slug}`)
  }

  const name = colMeta?.name || slug
  const image = colMeta?.image_url || ''
  const banner = colMeta?.banner_image_url || image
  const floor = stats?.total?.floor_price ?? listings[0]?.priceEth ?? 0
  const volume24h =
    stats?.intervals?.find((i) => i.interval === 'one_day')?.volume ?? 0
  const volumeTotal = stats?.total?.volume ?? 0
  const owners = stats?.total?.num_owners ?? 0
  const items = colMeta?.total_supply || colMeta?.unique_item_count || 0

  let nfts = listingsToNfts(listings, collectionId, { name, image })
  // Enrich a large batch on every sync (rest filled by background enrich loop)
  const enrichLimit = Number(process.env.ENRICH_LIMIT || 250)
  try {
    nfts = await enrichImages(nfts, listings, {
      chain: colMeta?.contracts?.[0]?.chain || 'robinhood',
      concurrency: Number(process.env.ENRICH_CONCURRENCY || 8),
      limit: enrichLimit,
    })
  } catch (e) {
    console.warn(`[sync] enrich ${slug}`, e?.message || e)
  }

  const activities = mapEvents(slug, collectionId, events)
  const offers = mapOffers(collectionId, offerRows)
  const listedCount = listings.length
  const listedPct = items > 0 ? +((listedCount / items) * 100).toFixed(1) : 0

  const row = {
    slug,
    collectionId,
    name,
    image,
    banner,
    description: colMeta?.description || `${name} on Robinhood Chain`,
    contractAddress: colMeta?.contracts?.[0]?.address || listings[0]?.contract,
    chain: colMeta?.contracts?.[0]?.chain || 'robinhood',
    floorPrice: +Number(floor).toPrecision(6),
    volume24h: +Number(volume24h).toPrecision(6),
    volumeTotal: +Number(volumeTotal).toPrecision(6),
    owners,
    items,
    listedCount,
    listedPct,
    nfts,
    activities,
    offers,
    prices: listings.map((L) => [L.tokenId, L.priceEth]),
    source: 'opensea',
    syncedAt: new Date().toISOString(),
    syncMs: Date.now() - t0,
  }

  putCollection(slug, row)
  console.log(
    `[sync] done ${slug}: ${listedCount} listed, ${activities.length} events, ${offers.length} offers in ${row.syncMs}ms`
  )
  return row
}

export async function syncOnce(slugs = defaultSlugs()) {
  if (busy) {
    console.log('[sync] already running, skip')
    return getMeta()
  }
  busy = true
  setMeta({ lastError: null })
  try {
    // Round-robin a few each cycle so we stay fresh without hammering
    const batchSize = Number(process.env.SYNC_BATCH || 3)
    const start = cursor % slugs.length
    const batch = []
    for (let i = 0; i < Math.min(batchSize, slugs.length); i++) {
      batch.push(slugs[(start + i) % slugs.length])
    }
    cursor = (start + batch.length) % slugs.length

    for (const slug of batch) {
      try {
        await syncSlug(slug)
      } catch (e) {
        console.error(`[sync] fail ${slug}`, e?.message || e)
        setMeta({ lastError: `${slug}: ${e?.message || e}` })
      }
      await new Promise((r) => setTimeout(r, 400))
    }

    setMeta({
      lastFullSyncAt: new Date().toISOString(),
      syncCount: (getMeta().syncCount || 0) + 1,
      slugQueue: slugs,
    })
  } finally {
    busy = false
  }
  return getMeta()
}

export async function warmPriority() {
  for (const slug of PRIORITY_SLUGS.slice(0, 4)) {
    try {
      await syncSlug(slug)
    } catch (e) {
      console.error(`[warm] ${slug}`, e?.message || e)
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  setMeta({ lastFullSyncAt: new Date().toISOString() })
}

export function isSyncBusy() {
  return busy
}

/**
 * Continuously fill missing NFT images/names for stored collections.
 * Runs between listing syncs so deep-scroll items get real art.
 */
let enrichBusy = false
export async function enrichPass() {
  if (enrichBusy || busy) return
  enrichBusy = true
  try {
    const cols = listCollections()
    for (const c of cols) {
      const missing = unenrichedTokens(c.slug, Number(process.env.ENRICH_BATCH || 40))
      if (!missing.length) continue
      const contract = c.contractAddress || missing[0]?.contract
      if (!contract) continue
      console.log(`[enrich] ${c.slug}: ${missing.length} items`)
      const patches = new Map()
      for (const m of missing) {
        try {
          const raw = await fetchNft(m.chain || 'robinhood', m.contract || contract, m.tokenId)
          if (!raw) continue
          patches.set(String(m.tokenId), {
            name: raw.name || undefined,
            image: raw.image_url || raw.display_image_url || undefined,
            owner: raw.owners?.[0]?.address?.toLowerCase() || undefined,
            traits: (raw.traits || [])
              .filter((t) => t.trait_type != null && t.value != null)
              .map((t) => ({
                trait_type: String(t.trait_type),
                value: String(t.value),
              })),
          })
        } catch {
          /* skip */
        }
        await new Promise((r) => setTimeout(r, 50))
      }
      if (patches.size) {
        patchCollectionNfts(c.slug, patches)
        console.log(`[enrich] ${c.slug}: patched ${patches.size}`)
      }
      // one collection per pass to stay polite to OpenSea
      break
    }
  } finally {
    enrichBusy = false
  }
}
