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
  fetchAllRobinhoodCollections,
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

/** Live-discovered Robinhood slugs (refreshed by discoverPass) */
let discoveredSlugs = []

export function defaultSlugs() {
  const env = (process.env.INDEX_SLUGS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const meta = getMeta()
  const fromMeta = Array.isArray(meta.discoveredSlugs) ? meta.discoveredSlugs : []
  const live = discoveredSlugs.length ? discoveredSlugs : fromMeta
  // Also include already-indexed collections so we never drop them
  const indexed = listCollections().map((c) => c.slug).filter(Boolean)
  return [
    ...new Set([
      ...PRIORITY_SLUGS,
      ...SNAPSHOT_SLUGS,
      ...env,
      ...live,
      ...indexed,
    ]),
  ]
}

/**
 * Discover every Robinhood collection on OpenSea and queue meta sync for new ones.
 * Call on boot + periodically so new RH collections appear automatically.
 */
export async function discoverPass() {
  try {
    const rows = await fetchAllRobinhoodCollections({ maxPages: 40, pageSize: 100 })
    if (!rows.length) {
      console.warn('[discover] empty — keep previous slug list')
      return defaultSlugs()
    }
    discoveredSlugs = rows.map((r) => r.slug)
    setMeta({
      discoveredSlugs,
      discoveredAt: new Date().toISOString(),
      discoveredCount: discoveredSlugs.length,
    })

    // Seed shells for collections we have never seen (fast discover page coverage)
    let seeded = 0
    for (const r of rows) {
      if (getCollection(r.slug)) continue
      putCollection(r.slug, {
        slug: r.slug,
        collectionId: `os-${r.slug}`,
        name: r.name,
        image: r.image,
        banner: r.banner,
        description: r.description || `${r.name} on Robinhood Chain`,
        contractAddress: r.contractAddress,
        chain: r.chain || 'robinhood',
        floorPrice: 0,
        volume24h: 0,
        volumeTotal: 0,
        owners: 0,
        items: r.items || 0,
        listedCount: 0,
        listedPct: 0,
        nfts: [],
        activities: [],
        offers: [],
        prices: [],
        source: 'opensea',
        syncedAt: new Date().toISOString(),
        indexPhase: 'discovered',
      })
      seeded++
      // Queue meta (listings) — priority first
      const isPriority = PRIORITY_SLUGS.includes(r.slug)
      enqueueSync(r.slug, { full: false, front: isPriority })
    }
    console.log(
      `[discover] ${discoveredSlugs.length} RH collections, seeded ${seeded} new shells`
    )
    return discoveredSlugs
  } catch (e) {
    console.error('[discover]', e?.message || e)
    return defaultSlugs()
  }
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
 * Admin: queue OpenSea → Fly download for many collections.
 * mode:
 *  - all: discover RH + full sync every slug
 *  - missing: full sync only empty / stub-heavy collections
 *  - meta: listings only (faster), then enrich pass fills art
 */
export async function downloadAllContent({ mode = 'all' } = {}) {
  let discovered = 0
  try {
    const slugs = await discoverPass()
    discovered = slugs?.length || 0
  } catch (e) {
    console.error('[download] discover', e?.message || e)
  }

  const slugs = defaultSlugs()
  let queued = 0
  const full = mode !== 'meta'

  if (mode === 'missing') {
    for (const slug of slugs) {
      const c = getCollection(slug)
      const nfts = c?.nfts || []
      const stubs = nfts.filter(
        (n) => isPlaceholderImage(n.image) || !hasRealTraits(n.traits)
      ).length
      const needs =
        !c ||
        !nfts.length ||
        stubs > Math.max(5, nfts.length * 0.25)
      if (!needs) continue
      enqueueSync(slug, { full: true })
      queued++
    }
  } else {
    // Priority first for better UX while full chain queues
    for (const slug of PRIORITY_SLUGS) {
      enqueueSync(slug, { full, front: true })
      queued++
    }
    for (const slug of slugs) {
      if (PRIORITY_SLUGS.includes(slug)) continue
      enqueueSync(slug, { full })
      queued++
    }
  }

  setMeta({
    lastDownloadAt: new Date().toISOString(),
    lastDownloadMode: mode,
    lastDownloadQueued: queued,
  })

  return {
    ok: true,
    mode,
    discovered,
    slugCount: slugs.length,
    queued,
    queueDepth: queueDepth(),
    busy: isSyncBusy(),
    message: full
      ? `Queued ${queued} collections for full OpenSea → Fly download (listings + art + traits). Runs in background.`
      : `Queued ${queued} collections for listings-only (meta) download.`,
  }
}

/**
 * Fast path: listings + offers + events + stats only (~2–5s).
 * Saves stubs so clients show prices immediately.
 */
export async function syncSlugMeta(slug) {
  const t0 = Date.now()
  console.log(`[sync:meta] start ${slug}`)
  const collectionId = `os-${slug}`
  const prev = getCollection(slug)

  let listings = []
  let listingsComplete = true
  let events = []
  let offerRows = []
  let stats = null
  let colMeta = null
  try {
    ;[listings, events, offerRows, stats, colMeta] = await Promise.all([
      fetchAllBestListings(slug, { maxPages: 80 }),
      fetchCollectionEvents(slug, 50).catch(() => []),
      fetchCollectionOffers(slug, 3).catch(() => []),
      fetchCollectionStats(slug).catch(() => null),
      fetchCollection(slug).catch(() => null),
    ])
    listingsComplete = listings.complete !== false
  } catch (e) {
    console.warn(`[sync:meta] ${slug} fetch error:`, e?.message || e)
    if (prev?.nfts?.length) {
      console.warn(`[sync:meta] ${slug}: keep previous after error`)
      return prev
    }
    // Unknown / dead slug — shell only, mark empty-complete so API stops 202-looping
    const row = {
      slug,
      collectionId,
      name: slug,
      image: '',
      banner: '',
      description: '',
      contractAddress: null,
      chain: 'robinhood',
      floorPrice: 0,
      volume24h: 0,
      volumeTotal: 0,
      owners: 0,
      items: 0,
      listedCount: 0,
      listedPct: 0,
      nfts: [],
      activities: [],
      offers: [],
      prices: [],
      source: 'opensea',
      syncedAt: new Date().toISOString(),
      syncMs: Date.now() - t0,
      indexPhase: 'meta-error',
    }
    putCollection(slug, row)
    return row
  }

  // CRITICAL: never overwrite a fat book with a thin partial (rate limit / mid-page fail)
  if (
    prev?.nfts?.length &&
    (!listingsComplete ||
      (listings.length > 0 &&
        listings.length < prev.nfts.length * 0.5 &&
        prev.nfts.length > 20))
  ) {
    console.warn(
      `[sync:meta] ${slug}: partial listings ${listings.length} vs prev ${prev.nfts.length} (complete=${listingsComplete}) — keep previous NFTs, update stats only`
    )
    const floor = stats?.total?.floor_price ?? prev.floorPrice ?? 0
    const volume24h =
      stats?.intervals?.find((i) => i.interval === 'one_day')?.volume ??
      prev.volume24h ??
      0
    const volumeTotal = stats?.total?.volume ?? prev.volumeTotal ?? 0
    const next = {
      ...prev,
      name: colMeta?.name || prev.name,
      image: colMeta?.image_url || prev.image,
      banner: colMeta?.banner_image_url || prev.banner || prev.image,
      floorPrice: +Number(floor).toPrecision(6),
      volume24h: +Number(volume24h).toPrecision(6),
      volumeTotal: +Number(volumeTotal).toPrecision(6),
      owners: stats?.total?.num_owners ?? prev.owners,
      items:
        colMeta?.total_supply ||
        colMeta?.unique_item_count ||
        prev.items,
      contractAddress:
        colMeta?.contracts?.[0]?.address || prev.contractAddress,
      activities: events?.length
        ? mapEvents(slug, collectionId, events)
        : prev.activities,
      offers: offerRows?.length
        ? mapOffers(collectionId, offerRows)
        : prev.offers,
      syncedAt: new Date().toISOString(),
      syncMs: Date.now() - t0,
      indexPhase: 'meta-partial-kept',
    }
    // stats-only write without wiping nfts
    putCollection(slug, next)
    return next
  }

  if (!listings.length) {
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
        !String(oldImg).startsWith('data:image/svg') &&
        !/image_type_(logo|hero)/i.test(oldImg)
      const oldTraits = Array.isArray(old.traits) ? old.traits : []
      const realOld = oldTraits.filter(
        (t) =>
          t?.trait_type &&
          t.trait_type !== 'Status' &&
          t.trait_type !== 'Token ID'
      )
      return {
        ...n,
        name: old.name && !String(old.name).startsWith('#') ? old.name : n.name,
        image: keepImg ? oldImg : n.image,
        owner: old.owner && old.owner !== 'unknown' ? old.owner : n.owner,
        traits: realOld.length ? oldTraits : n.traits,
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
  // Prefer queue so we don't stampede — larger batch covers whole RH chain over time
  const batchSize = Number(process.env.SYNC_BATCH || 4)
  if (!slugs.length) return getMeta()
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

/** Boot: discover all RH → meta for many → full enrich for priority */
export async function warmPriority() {
  // 0) Discover every Robinhood collection from OpenSea
  try {
    await discoverPass()
  } catch (e) {
    console.error('[warm:discover]', e?.message || e)
  }

  const slugs = defaultSlugs()
  console.log(`[warm] indexing ${slugs.length} Robinhood collection slugs`)

  // Meta-only first pass (listings/floor for as many as possible)
  const metaN = Number(process.env.WARM_META_N || slugs.length)
  for (const slug of slugs.slice(0, metaN)) {
    try {
      await syncSlugMeta(slug)
    } catch (e) {
      console.error(`[warm:meta] ${slug}`, e?.message || e)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  // Full art+traits for priority + any with listings already
  for (const slug of PRIORITY_SLUGS) {
    enqueueSync(slug, { full: true })
  }
  // Queue remaining discovered slugs for full enrich (serial, background)
  for (const slug of slugs) {
    if (PRIORITY_SLUGS.includes(slug)) continue
    enqueueSync(slug, { full: true })
  }
  setMeta({
    lastFullSyncAt: new Date().toISOString(),
    slugQueue: slugs,
  })
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
