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
  openSeaGet,
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
import { dbMergeCatalogNfts, dbListNftsPage } from './db.js'

/** Same policy as client: OpenSea + lifetime volume ≥ this → verified */
export const VERIFIED_MIN_VOLUME_ETH = Number(
  process.env.VERIFIED_MIN_VOLUME_ETH || 3
)

/** OpenSea chain id for Robinhood mainnet (never testnet) */
export const MAINNET_CHAIN = 'robinhood'

/**
 * Mainnet-only filter. OpenSea uses chain="robinhood" for mainnet.
 * Rejects testnet / demo / non-RH chains.
 */
export function isMainnetCollection(c) {
  if (!c) return false
  const chain = String(c.chain || MAINNET_CHAIN).toLowerCase()
  if (/testnet|sepolia|46630/.test(chain)) return false
  // OpenSea mainnet identifier (and blank → treat as mainnet default)
  if (chain && chain !== MAINNET_CHAIN && chain !== 'robinhood') return false
  const slug = String(c.slug || '')
  // Never index local OpenHood demo / testnet mint surface
  if (/^openhood-testnet|^open-pixels$|^openhood-demo/i.test(slug)) return false
  return true
}

/**
 * Worth queuing for download: mainnet + real market signal
 * (verified, volume, active listings, or hard priority slug).
 * Skips empty spam shells with no activity.
 */
export function isMainnetMarketCollection(c) {
  if (!isMainnetCollection(c)) return false
  if (PRIORITY_SLUGS.includes(c.slug)) return true
  if (isVerifiedCollection(c)) return true
  const vol = Number(c.volumeTotal ?? c.volume_total ?? 0)
  const vol24 = Number(c.volume24h ?? c.volume_24h ?? 0)
  const listed = Number(c.listedCount ?? c.nfts?.length ?? 0)
  return vol > 0 || vol24 > 0 || listed > 0
}

/**
 * Verified-first ordering for download/sync queues.
 * 1) verified (volumeTotal ≥ 3 ETH), highest volume first
 * 2) PRIORITY_SLUGS
 * 3) rest by listedCount / volume
 * mainnetOnly=true (default) drops non-mainnet / empty spam
 */
export function isVerifiedCollection(c) {
  if (!c) return false
  if (!isMainnetCollection(c)) return false
  const vol = Number(c.volumeTotal ?? c.volume_total ?? 0)
  return Number.isFinite(vol) && vol >= VERIFIED_MIN_VOLUME_ETH
}

/** @returns {string[]} slugs ordered verified → priority → rest */
export function slugsVerifiedFirst(slugs = defaultSlugs(), { mainnetOnly = true } = {}) {
  const set = new Set(slugs.filter(Boolean))
  const cols = listCollections()
  const bySlug = new Map(cols.map((c) => [c.slug, c]))

  const verified = []
  const priority = []
  const rest = []

  for (const slug of set) {
    const c = bySlug.get(slug) || { slug, chain: MAINNET_CHAIN }
    if (mainnetOnly && !isMainnetCollection(c)) continue
    if (mainnetOnly && !isMainnetMarketCollection(c) && !PRIORITY_SLUGS.includes(slug)) {
      // still allow empty priority shells; skip pure spam shells
      continue
    }
    if (isVerifiedCollection(c)) verified.push(slug)
    else if (PRIORITY_SLUGS.includes(slug)) priority.push(slug)
    else rest.push(slug)
  }

  const vol = (slug) => {
    const c = bySlug.get(slug)
    return Number(c?.volumeTotal || c?.volume24h || 0)
  }
  const listed = (slug) => {
    const c = bySlug.get(slug)
    return Number(c?.listedCount || c?.nfts?.length || 0)
  }

  verified.sort((a, b) => vol(b) - vol(a) || listed(b) - listed(a))
  priority.sort((a, b) => vol(b) - vol(a) || listed(b) - listed(a))
  rest.sort((a, b) => vol(b) - vol(a) || listed(b) - listed(a))

  return [...verified, ...priority, ...rest]
}

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
 * Discover every Robinhood collection on OpenSea and optionally queue meta sync.
 * @param {{ enqueueNew?: boolean }} opts enqueueNew=false seeds shells only (no queue flood)
 */
export async function discoverPass({ enqueueNew = true } = {}) {
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
      if (enqueueNew) {
        const isPriority = PRIORITY_SLUGS.includes(r.slug)
        enqueueSync(r.slug, { full: false, front: isPriority })
      }
    }
    console.log(
      `[discover] ${discoveredSlugs.length} RH collections, seeded ${seeded} new shells (enqueueNew=${enqueueNew})`
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
/** Avoid re-queueing catalog for same slug too often */
const catalogQueuedAt = new Map()

export function enqueueSync(slug, { full = true, front = false } = {}) {
  if (!slug) return
  // de-dupe
  const exists = queue.find(
    (j) => j.slug === slug && j.full === full && !j.catalog
  )
  if (exists) return
  const job = { slug, full, catalog: false }
  if (front) queue.unshift(job)
  else queue.push(job)
  void pumpQueue()
}

/**
 * Queue full-collection catalog download (listed + unlisted) so buyers can
 * browse not-for-sale items and make offers.
 */
export function enqueueCatalog(slug, { front = false } = {}) {
  if (!slug) return
  const last = catalogQueuedAt.get(slug) || 0
  if (Date.now() - last < 10 * 60_000) return // once per 10 min
  if (queue.find((j) => j.slug === slug && j.catalog)) return
  catalogQueuedAt.set(slug, Date.now())
  const job = { slug, full: false, catalog: true }
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
        if (job.catalog) await syncSlugCatalog(job.slug)
        else if (job.full) await syncSlug(job.slug)
        else await syncSlugMeta(job.slug)
      } catch (e) {
        console.error(`[queue] ${job.slug}`, e?.message || e)
        const msg = `${job.slug}: ${e?.message || e}`
        // 429 is expected under load — don't scare admin UI as a hard failure
        if (e?.status === 429 || e?.rateLimited || /OpenSea 429/.test(msg)) {
          setMeta({ lastWarning: msg, lastRateLimitAt: new Date().toISOString() })
          // Re-queue full enrich later (back of line) so we eventually finish
          if (job.full) {
            enqueueSync(job.slug, { full: true, front: false })
          } else if (job.catalog) {
            catalogQueuedAt.delete(job.slug)
            enqueueCatalog(job.slug, { front: false })
          }
          await new Promise((r) => setTimeout(r, 2500))
        } else {
          setMeta({ lastError: msg })
        }
      }
      // Slightly slower cadence reduces 429 storms
      await new Promise((r) => setTimeout(r, 500))
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
 * Admin: queue OpenSea → Fly download (Robinhood MAINNET only).
 * Order: verified first → priority → rest with market signal.
 * mode:
 *  - mainnet (default): mainnet markets only, verified first, listings then enrich for verified
 *  - verified: full for verified mainnet only (no spam tail)
 *  - all / meta: all mainnet markets listings
 *  - enrich / missing: as before, mainnet-only
 */
export async function downloadAllContent({ mode = 'mainnet' } = {}) {
  const beforeQ = queueDepth()

  if (beforeQ > 80 && mode !== 'enrich' && mode !== 'verified') {
    return {
      ok: true,
      mode,
      discovered: 0,
      slugCount: defaultSlugs().length,
      queued: 0,
      queueDepth: beforeQ,
      busy: isSyncBusy(),
      alreadyRunning: true,
      message: `Download already in progress — queue has ${beforeQ} jobs. Wait for it to drain (watch Content status).`,
    }
  }

  let discovered = 0
  try {
    const slugsFound = await discoverPass({ enqueueNew: false })
    discovered = slugsFound?.length || 0
  } catch (e) {
    console.error('[download] discover', e?.message || e)
  }

  // MAINNET markets only + verified first
  const ordered = slugsVerifiedFirst(defaultSlugs(), { mainnetOnly: true })
  const verifiedSlugs = ordered.filter((slug) =>
    isVerifiedCollection(getCollection(slug))
  )

  let queued = 0
  let metaQueued = 0
  let fullQueued = 0
  let verifiedQueued = 0

  if (mode === 'enrich') {
    const cols = listCollections()
      .filter((c) => isMainnetCollection(c))
      .map((c) => {
        const nfts = c.nfts || []
        const listed = nfts.length || c.listedCount || 0
        const stubs = nfts.filter((n) => isPlaceholderImage(n.image)).length
        return {
          slug: c.slug,
          listed,
          stubs,
          verified: isVerifiedCollection(c),
          vol: Number(c.volumeTotal || 0),
        }
      })
      .filter((c) => c.listed > 0 && c.stubs > Math.max(3, c.listed * 0.15))
      .sort(
        (a, b) =>
          Number(b.verified) - Number(a.verified) ||
          b.vol - a.vol ||
          b.listed - a.listed
      )

    const cap = Number(process.env.ENRICH_QUEUE_CAP || 40)
    for (const c of cols.slice(0, cap)) {
      enqueueSync(c.slug, { full: true, front: c.verified })
      fullQueued++
      queued++
      if (c.verified) verifiedQueued++
    }
  } else if (mode === 'missing') {
    for (const slug of ordered) {
      const c = getCollection(slug)
      const nfts = c?.nfts || []
      const verified = isVerifiedCollection(c)
      if (!c || !nfts.length) {
        enqueueSync(slug, { full: false, front: verified })
        metaQueued++
        queued++
        if (verified) verifiedQueued++
        continue
      }
      const stubs = nfts.filter((n) => isPlaceholderImage(n.image)).length
      if (stubs > Math.max(5, nfts.length * 0.35)) {
        enqueueSync(slug, { full: true, front: verified })
        fullQueued++
        queued++
        if (verified) verifiedQueued++
      }
    }
  } else if (mode === 'verified') {
    // Verified mainnet only — full listings + art (no long spam tail)
    for (const slug of verifiedSlugs) {
      enqueueSync(slug, { full: false, front: true })
      enqueueSync(slug, { full: true, front: true })
      metaQueued++
      fullQueued++
      verifiedQueued++
      queued += 2
    }
  } else if (mode === 'mainnet' || mode === 'all' || mode === 'meta') {
    // Mainnet markets: verified get listings+art first; rest get listings
    for (const slug of verifiedSlugs) {
      enqueueSync(slug, { full: false, front: true })
      enqueueSync(slug, { full: true, front: true })
      metaQueued++
      fullQueued++
      verifiedQueued++
      queued += 2
    }
    for (const slug of ordered) {
      if (verifiedSlugs.includes(slug)) continue
      enqueueSync(slug, { full: false })
      metaQueued++
      queued++
    }
  }

  const qAfter = queueDepth()
  setMeta({
    lastDownloadAt: new Date().toISOString(),
    lastDownloadMode: mode,
    lastDownloadQueued: queued,
    lastVerifiedQueued: verifiedQueued,
    lastDownloadMainnetOnly: true,
    // Progress baseline — done only goes up as queue drains
    progressDone: 0,
    progressLastQueue: qAfter,
    progressStartQueued: qAfter,
  })

  const q = qAfter
  const message =
    mode === 'enrich'
      ? `Mainnet enrich: ${fullQueued} art jobs (${verifiedQueued} verified first). Queue ${q}.`
      : mode === 'missing'
        ? `Mainnet missing: ${metaQueued} listing + ${fullQueued} enrich. Queue ${q}.`
        : mode === 'verified'
          ? `Mainnet verified only: ${verifiedQueued} collections (listings+art). Queue ${q}.`
          : `Mainnet only: ${verifiedQueued} verified first (listings+art), then ${metaQueued - verifiedQueued} other mainnet markets (listings). Queue ${q}.`

  return {
    ok: true,
    mode,
    chain: MAINNET_CHAIN,
    mainnetOnly: true,
    discovered,
    slugCount: ordered.length,
    verifiedCount: verifiedSlugs.length,
    verifiedQueued,
    queued,
    metaQueued,
    fullQueued,
    queueDepth: q,
    busy: isSyncBusy(),
    message,
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

/**
 * Page full OpenSea collection NFT catalog into SQLite (listed + unlisted).
 * Enables marketplace offers on not-for-sale tokens.
 */
export async function syncSlugCatalog(slug, { maxPages } = {}) {
  const pagesCap = Math.min(
    200,
    Math.max(4, Number(maxPages || process.env.CATALOG_MAX_PAGES || 80))
  )
  const t0 = Date.now()
  let row = getCollection(slug)
  if (!row) {
    row = await syncSlugMeta(slug)
  }
  if (!row) return null

  const collectionId = row.collectionId || `os-${slug}`
  // Active listing prices (from listed book / meta)
  const priceByToken = new Map()
  for (const n of row.nfts || []) {
    if (n.listed && n.price != null) {
      priceByToken.set(String(n.tokenId), Number(n.price))
    }
  }
  // Refresh listings if we have few prices
  if (priceByToken.size < 5) {
    try {
      const listings = await fetchAllBestListings(slug, { maxPages: 40 })
      for (const L of listings) {
        priceByToken.set(String(L.tokenId), L.priceEth)
      }
    } catch (e) {
      console.warn(`[catalog] ${slug} listings`, e?.message || e)
    }
  }

  let next = undefined
  let upserted = 0
  let listedHits = 0
  for (let page = 0; page < pagesCap; page++) {
    let path = `/collection/${encodeURIComponent(slug)}/nfts?limit=50`
    if (next) path += `&next=${encodeURIComponent(next)}`
    let data
    try {
      data = await openSeaGet(path)
    } catch (e) {
      console.warn(`[catalog] ${slug} page ${page}`, e?.message || e)
      break
    }
    const rows = data?.nfts || []
    if (!rows.length) break

    const batch = []
    for (const raw of rows) {
      const tid = raw.identifier != null ? String(raw.identifier) : ''
      if (!tid) continue
      const price = priceByToken.get(tid)
      const listed = price != null && Number(price) > 0
      if (listed) listedHits++
      const traits = (raw.traits || [])
        .filter((t) => t.trait_type != null && t.value != null)
        .map((t) => ({
          trait_type: String(t.trait_type),
          value: String(t.value),
        }))
      const tidNum = Number(tid)
      batch.push({
        id: `${collectionId}-os-${tid}`,
        tokenId: Number.isSafeInteger(tidNum) ? tidNum : parseInt(tid, 10) || 0,
        name: raw.name || `#${tid}`,
        collectionId,
        image: raw.image_url || raw.display_image_url || '',
        owner: raw.owners?.[0]?.address?.toLowerCase() || 'unknown',
        listed,
        price: listed ? price : undefined,
        traits,
        rarityRank: raw.rarity?.rank,
      })
    }
    if (batch.length) {
      upserted += dbMergeCatalogNfts(slug, batch, collectionId)
    }
    next = data?.next
    if (!next) break
    await new Promise((r) => setTimeout(r, 60))
  }

  // Ensure every actively listed token still present even if not in catalog pages yet
  if (priceByToken.size) {
    const missingListed = []
    for (const [tid, price] of priceByToken) {
      // cheap check via merge (upsert)
      missingListed.push({
        id: `${collectionId}-os-${tid}`,
        tokenId: Number(tid) || tid,
        name: `#${tid}`,
        collectionId,
        image: '',
        owner: 'unknown',
        listed: true,
        price,
        traits: [
          { trait_type: 'Status', value: 'Listed' },
          { trait_type: 'Token ID', value: String(tid) },
        ],
      })
    }
    // Only fill gaps that might not have been in catalog — merge preserves art
    dbMergeCatalogNfts(slug, missingListed, collectionId)
  }

  const counts = dbListNftsPage(slug, { offset: 0, limit: 1, scope: 'all' })
  console.log(
    `[catalog] ${slug}: upserted~${upserted} pages≤${pagesCap} ` +
      `db total=${counts.nftsTotal} listed=${counts.listedCount} ` +
      `unlisted=${counts.unlistedCount} in ${Date.now() - t0}ms`
  )
  return counts
}

/** Full sync: meta → listed enrich → full catalog (unlisted for offers) */
export async function syncSlug(slug) {
  busy = true
  try {
    await syncSlugMeta(slug)
    await syncSlugItems(slug)
    // Full supply catalog so unlisted tokens appear for offers
    try {
      await syncSlugCatalog(slug)
    } catch (e) {
      console.warn(`[sync:catalog] ${slug}`, e?.message || e)
    }
    return getCollection(slug)
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

/** Boot: discover all RH → meta verified-first → full enrich verified/priority then rest */
export async function warmPriority() {
  // 0) Discover every Robinhood collection from OpenSea
  try {
    await discoverPass({ enqueueNew: false })
  } catch (e) {
    console.error('[warm:discover]', e?.message || e)
  }

  const ordered = slugsVerifiedFirst(defaultSlugs())
  console.log(
    `[warm] indexing ${ordered.length} RH slugs (verified-first, minVol=${VERIFIED_MIN_VOLUME_ETH} ETH)`
  )

  // Meta-only first pass in verified-first order
  const metaN = Number(process.env.WARM_META_N || ordered.length)
  for (const slug of ordered.slice(0, metaN)) {
    try {
      await syncSlugMeta(slug)
    } catch (e) {
      console.error(`[warm:meta] ${slug}`, e?.message || e)
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  // Re-rank after meta has volume stats
  const ranked = slugsVerifiedFirst(defaultSlugs())
  const verified = ranked.filter((s) => isVerifiedCollection(getCollection(s)))

  // Full enrich: verified first, then PRIORITY, then rest with listings
  for (const slug of verified) {
    enqueueSync(slug, { full: true, front: true })
  }
  for (const slug of PRIORITY_SLUGS) {
    if (verified.includes(slug)) continue
    enqueueSync(slug, { full: true, front: true })
  }
  for (const slug of ranked) {
    if (verified.includes(slug) || PRIORITY_SLUGS.includes(slug)) continue
    const c = getCollection(slug)
    if ((c?.nfts?.length || c?.listedCount || 0) > 0) {
      enqueueSync(slug, { full: true })
    }
  }
  setMeta({
    lastFullSyncAt: new Date().toISOString(),
    slugQueue: ranked,
    warmVerifiedCount: verified.length,
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
    // Rank by listed_count shells only — never load every book into RAM
    const cols = [...listCollections()]
      .filter((c) => (c.listedCount || 0) > 0)
      .sort((a, b) => (b.listedCount || 0) - (a.listedCount || 0))
      .slice(0, 12) // one pass: few collections so HTTP isn't starved
    for (const shell of cols) {
      const missing = unenrichedTokens(
        shell.slug,
        Number(process.env.ENRICH_BATCH || 40)
      )
      if (!missing.length) continue
      const c = getCollection(shell.slug) || shell
      const contract = c.contractAddress
      if (!contract) continue
      console.log(`[enrich] ${c.slug}: ${missing.length} need art/traits`)

      // Prefer catalog bulk fill first (traits + images)
      try {
        const filled = await fillListedFromCatalog(
          c.slug,
          c.nfts || [],
          c.collectionId || `os-${c.slug}`,
          { maxPages: 12 }
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
