/**
 * Background sync: OpenSea → SQLite
 * Strategy:
 *  1) Meta first (listings / offers / events / floor) — seconds
 *  2) Per-token metadata for listed IDs (reliable; catalog paging misses sparse listings)
 *  3) Single serial queue — no concurrent OpenSea storms
 */
import {
  enrichImages,
  fetchAllBestListings,
  fetchCollection,
  fetchCollectionEvents,
  fetchCollectionOffers,
  fetchCollectionStats,
  fillListedFromCatalog,
  hasRealTraits,
  isPlaceholderImage,
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

/** Built-in high-priority + full Robinhood snapshot when INDEX_SLUGS unset */
export const PRIORITY_SLUGS = [
  'gremlin-cartel',
  'onchainhoodies-',
  'py0py0py0py0',
  'robinhood-punks',
  'robbin-hood-babies',
  'pixelhoodclan',
  'hoodini',
  'chogies-robin-hood',
  'therobinhood',
  'robinhood-kitties',
  'hoodiliosnft',
  'degen-hood',
  'rh-ape-cartel',
  'robinalpha',
  'eternals-robinhood',
  'ascii-cats-robinhood',
  'robinhood-stonk',
  '8skullz',
  'cashcat-nft',
  'robinhood-bugs',
  'much-wow-nft',
  'opepenhood',
  'quack-ventures',
  'robinzuki',
  'ofh00d',
  'doomps',
  'zerebro-rhood-agent',
  '4663-hoods',
  'robinhoodmigos',
]

const SNAPSHOT_SLUGS = [
  'gremlin-cartel',
  'onchainhoodies-',
  'py0py0py0py0',
  'robinhood-punks',
  'robbin-hood-babies',
  'pixelhoodclan',
  'hoodini',
  'robinhood-kitties',
  'hoodiliosnft',
  'degen-hood',
  'rh-ape-cartel',
  'robinalpha',
  'eternals-robinhood',
  'robinhood-apes-nft',
  'ascii-cats-robinhood',
  'robinhood-stonk',
  '8skullz',
  'robbob',
  'mozestreetart',
  'rcminerpack',
  'cashcat-nft',
  'rcopy-genesis',
  'robinhood-bugs',
  'robinhood-dinos',
  'skull-hood-pfp',
  'much-wow-nft',
  'gravelinclub',
  'non-playable-hoodies',
  'robin-pass',
  'sherwoodghosts',
  'lost-echoes-rc',
  'robin-frogs',
  'opepenhood',
  'robinhoodchungos',
  'robindroids-nft',
  'quack-ventures',
  'robinzuki',
  'aurafy',
  'chogies-robin-hood',
  'ofh00d',
  'therobinhood',
  'robin-thugz',
  'robinhood-rocks-onchain',
  'robinhood-pengs',
  'doomps',
  'robinhood-mews',
  'nutsycollective',
  'kibo-rh',
  'zerebro-rhood-agent',
  '4663-hoods',
  'robinhoodmigos',
]

export function defaultSlugs() {
  const env = (process.env.INDEX_SLUGS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (env.length) return [...new Set([...PRIORITY_SLUGS, ...env])]
  return [...new Set([...PRIORITY_SLUGS, ...SNAPSHOT_SLUGS])]
}

/** Serial job queue */
const queue = []
let queueRunning = false
let busy = false
let cursor = 0

export function enqueueSync(slug, { full = true, front = false } = {}) {
  if (!slug) return
  // de-dupe
  const exists = queue.find((j) => j.slug === slug && j.full === full)
  if (exists) return
  const job = { slug, full }
  if (front) queue.unshift(job)
  else queue.push(job)
  void pumpQueue()
}

async function pumpQueue() {
  if (queueRunning) return
  queueRunning = true
  try {
    while (queue.length) {
      const job = queue.shift()
      try {
        if (job.full) await syncSlug(job.slug)
        else await syncSlugMeta(job.slug)
      } catch (e) {
        console.error(`[queue] ${job.slug}`, e?.message || e)
        setMeta({ lastError: `${job.slug}: ${e?.message || e}` })
      }
      await new Promise((r) => setTimeout(r, 300))
    }
  } finally {
    queueRunning = false
  }
}

export function isSyncBusy() {
  return busy || queueRunning || queue.length > 0
}

export function queueDepth() {
  return queue.length
}

/**
 * Fast path: listings + offers + events + stats only (~2–5s).
 * Saves stubs so clients show prices immediately.
 */
export async function syncSlugMeta(slug) {
  const t0 = Date.now()
  console.log(`[sync:meta] start ${slug}`)
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
      console.warn(`[sync:meta] ${slug}: empty listings, keep previous`)
      return prev
    }
    // Collection shell so Discover still has metadata even with 0 active listings
    const name = colMeta?.name || slug
    const image = colMeta?.image_url || ''
    const banner = colMeta?.banner_image_url || image
    const floor = stats?.total?.floor_price ?? 0
    const volume24h =
      stats?.intervals?.find((i) => i.interval === 'one_day')?.volume ?? 0
    const volumeTotal = stats?.total?.volume ?? 0
    const owners = stats?.total?.num_owners ?? 0
    const items = colMeta?.total_supply || colMeta?.unique_item_count || 0
    const collectionId = `os-${slug}`
    const row = {
      slug,
      collectionId,
      name,
      image,
      banner,
      description: colMeta?.description || `${name} on Robinhood Chain`,
      contractAddress: colMeta?.contracts?.[0]?.address || null,
      chain: colMeta?.contracts?.[0]?.chain || 'robinhood',
      floorPrice: +Number(floor).toPrecision(6),
      volume24h: +Number(volume24h).toPrecision(6),
      volumeTotal: +Number(volumeTotal).toPrecision(6),
      owners,
      items,
      listedCount: 0,
      listedPct: 0,
      nfts: [],
      activities: mapEvents(slug, collectionId, events),
      offers: mapOffers(collectionId, offerRows),
      prices: [],
      source: 'opensea',
      syncedAt: new Date().toISOString(),
      syncMs: Date.now() - t0,
      indexPhase: 'meta-empty-book',
    }
    putCollection(slug, row)
    console.warn(`[sync:meta] ${slug}: no active listings (shell saved)`)
    return row
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

  // Merge with previous enriched art when re-syncing meta
  const prev = getCollection(slug)
  let nfts = listingsToNfts(listings, collectionId, { name })
  if (prev?.nfts?.length) {
    const byTok = new Map(prev.nfts.map((n) => [String(n.tokenId), n]))
    nfts = nfts.map((n) => {
      const old = byTok.get(String(n.tokenId))
      if (!old) return n
      const oldImg = old.image
      const keepImg =
        oldImg &&
        !String(oldImg).includes('dicebear') &&
        !/image_type_(logo|hero)/i.test(oldImg)
      return {
        ...n,
        name: old.name && !String(old.name).startsWith('#') ? old.name : n.name,
        image: keepImg ? oldImg : n.image,
        owner: old.owner && old.owner !== 'unknown' ? old.owner : n.owner,
        traits: (old.traits?.length || 0) > 2 ? old.traits : n.traits,
        rarityRank: old.rarityRank ?? n.rarityRank,
      }
    })
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
    indexPhase: 'meta',
  }
  putCollection(slug, row)
  console.log(
    `[sync:meta] ${slug}: ${listedCount} listed, ${offers.length} offers in ${row.syncMs}ms`
  )
  return row
}

/**
 * Fill names/images for listed tokens by direct NFT API (reliable).
 * Catalog paging only works when most of supply is listed (e.g. gremlin).
 */
export async function syncSlugItems(slug) {
  const t0 = Date.now()
  let row = getCollection(slug)
  if (!row?.nfts?.length) {
    row = await syncSlugMeta(slug)
  }
  const contract = row.contractAddress
  const chain = row.chain || 'robinhood'
  if (!contract) return row

  const need = row.nfts.filter(
    (n) =>
      isPlaceholderImage(n.image) ||
      !n.name ||
      String(n.name).startsWith('#') ||
      !hasRealTraits(n.traits)
  )
  if (!need.length) {
    console.log(`[sync:items] ${slug}: already complete (${row.nfts.length})`)
    return row
  }

  console.log(
    `[sync:items] ${slug}: enriching ${need.length}/${row.nfts.length} (art+traits)`
  )

  // 1) Bulk catalog pages (50/req) — fastest when supply is dense
  let nfts = await fillListedFromCatalog(
    slug,
    row.nfts,
    row.collectionId || `os-${slug}`,
    { maxPages: 80 }
  )

  // 2) Per-token for remaining stubs / missing traits
  const still = nfts.filter(
    (n) => isPlaceholderImage(n.image) || !hasRealTraits(n.traits)
  )
  if (still.length) {
    const listings = still.map((n) => ({
      tokenId: String(n.tokenId),
      contract,
      chain,
    }))
    nfts = await enrichImages(nfts, listings, {
      chain,
      concurrency: Number(process.env.ENRICH_CONCURRENCY || 8),
      limit: still.length,
      onlyMissing: true,
    })
  }

  const next = {
    ...row,
    nfts,
    syncMs: (row.syncMs || 0) + (Date.now() - t0),
    indexPhase: 'items',
    syncedAt: new Date().toISOString(),
  }
  putCollection(slug, next)
  const filled = nfts.filter((n) => !isPlaceholderImage(n.image)).length
  const withTraits = nfts.filter((n) => hasRealTraits(n.traits)).length
  console.log(
    `[sync:items] ${slug}: art ${filled}/${nfts.length}, traits ${withTraits}/${nfts.length} in ${Date.now() - t0}ms`
  )
  return next
}

/** Full sync: meta then items */
export async function syncSlug(slug) {
  busy = true
  try {
    await syncSlugMeta(slug)
    return await syncSlugItems(slug)
  } finally {
    busy = false
  }
}

export async function syncOnce(slugs = defaultSlugs()) {
  // Prefer queue so we don't stampede
  const batchSize = Number(process.env.SYNC_BATCH || 2)
  const start = cursor % slugs.length
  for (let i = 0; i < Math.min(batchSize, slugs.length); i++) {
    enqueueSync(slugs[(start + i) % slugs.length], { full: true })
  }
  cursor = (start + batchSize) % slugs.length
  setMeta({
    lastFullSyncAt: new Date().toISOString(),
    syncCount: (getMeta().syncCount || 0) + 1,
    slugQueue: slugs,
  })
  return getMeta()
}

/** Boot: meta-first for many collections (fast), then full items in queue */
export async function warmPriority() {
  const slugs = defaultSlugs()
  // Meta-only first pass (quick prices for everyone)
  const metaN = Number(process.env.WARM_META_N || 20)
  for (const slug of slugs.slice(0, metaN)) {
    try {
      await syncSlugMeta(slug)
    } catch (e) {
      console.error(`[warm:meta] ${slug}`, e?.message || e)
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  // Then full item enrich for top collections
  for (const slug of PRIORITY_SLUGS.slice(0, 12)) {
    enqueueSync(slug, { full: true })
  }
  setMeta({ lastFullSyncAt: new Date().toISOString() })
}

/**
 * Background: keep filling unenriched tokens across all collections.
 */
let enrichBusy = false
export async function enrichPass() {
  if (enrichBusy || busy || queueRunning) return
  enrichBusy = true
  try {
    // Prefer collections with most stubs first so non-Gremlin catch up
    const cols = [...listCollections()].sort((a, b) => {
      const am = (a.nfts || []).filter(
        (n) => isPlaceholderImage(n.image) || !hasRealTraits(n.traits)
      ).length
      const bm = (b.nfts || []).filter(
        (n) => isPlaceholderImage(n.image) || !hasRealTraits(n.traits)
      ).length
      return bm - am
    })
    for (const c of cols) {
      const missing = unenrichedTokens(
        c.slug,
        Number(process.env.ENRICH_BATCH || 120)
      )
      if (!missing.length) continue
      const contract = c.contractAddress
      if (!contract) continue
      console.log(`[enrich] ${c.slug}: ${missing.length} need art/traits`)

      // Prefer catalog bulk fill first (traits + images)
      try {
        const filled = await fillListedFromCatalog(
          c.slug,
          c.nfts || [],
          c.collectionId || `os-${c.slug}`,
          { maxPages: 40 }
        )
        if (filled?.length) {
          putCollection(c.slug, {
            ...c,
            nfts: filled,
            syncedAt: new Date().toISOString(),
            indexPhase: 'enrich-catalog',
          })
        }
      } catch (e) {
        console.warn(`[enrich] catalog ${c.slug}`, e?.message || e)
      }

      const stillMissing = unenrichedTokens(
        c.slug,
        Number(process.env.ENRICH_BATCH || 80)
      )
      if (!stillMissing.length) {
        console.log(`[enrich] ${c.slug}: catalog filled remaining`)
        break
      }

      const patches = new Map()
      let i = 0
      const conc = Number(process.env.ENRICH_CONCURRENCY || 8)
      async function worker() {
        while (i < stillMissing.length) {
          const m = stillMissing[i++]
          try {
            const raw = await fetchNft(
              m.chain || c.chain || 'robinhood',
              contract,
              m.tokenId
            )
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
          await new Promise((r) => setTimeout(r, 25))
        }
      }
      await Promise.all(
        Array.from(
          { length: Math.min(conc, stillMissing.length) },
          () => worker()
        )
      )
      if (patches.size) {
        patchCollectionNfts(c.slug, patches)
        console.log(`[enrich] ${c.slug}: patched ${patches.size}`)
      }
      break // one collection per pass
    }
  } finally {
    enrichBusy = false
  }
}
