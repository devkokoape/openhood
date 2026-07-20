/**
 * OpenSea v2 client for the indexer (server-side — no CORS, key from env).
 */

const OPENSEA_HOST = 'https://api.opensea.io/api/v2'

function apiKey() {
  return (process.env.OPENSEA_API_KEY || process.env.VITE_OPENSEA_API_KEY || '').trim()
}

function headers() {
  const h = { accept: 'application/json' }
  const k = apiKey()
  if (k) h['X-API-KEY'] = k
  return h
}

export async function openSeaGet(path, attempt = 0) {
  const url = `${OPENSEA_HOST}${path.startsWith('/') ? path : `/${path}`}`
  try {
    const res = await fetch(url, { headers: headers() })
    if ((res.status === 429 || res.status >= 500) && attempt < 8) {
      // Exponential backoff on 429 — OpenSea rate limits kill enrich otherwise
      const retryAfter = Number(res.headers.get('retry-after') || 0)
      const wait =
        retryAfter > 0
          ? retryAfter * 1000
          : Math.min(30_000, 800 * 2 ** attempt + (res.status === 429 ? 2000 : 0))
      await sleep(wait)
      return openSeaGet(path, attempt + 1)
    }
    if (res.status === 404) return null
    if (!res.ok) {
      const err = new Error(`OpenSea ${res.status} ${path}`)
      err.status = res.status
      err.rateLimited = res.status === 429
      throw err
    }
    return await res.json()
  } catch (e) {
    if (e?.status) throw e // propagate 4xx/5xx after retries
    if (attempt < 3) {
      await sleep(500 * (attempt + 1))
      return openSeaGet(path, attempt + 1)
    }
    throw e
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export function parseListing(L) {
  if (L.status && L.status !== 'ACTIVE') return null
  const tokenId =
    L.asset?.identifier ||
    L.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria
  if (tokenId == null || tokenId === '') return null

  let eth = 0
  const raw = L.price?.current?.value
  const dec = L.price?.current?.decimals ?? 18
  if (raw != null) eth = Number(raw) / 10 ** dec
  // Fallback: sum consideration (same as client) when price.current missing
  if ((!Number.isFinite(eth) || eth <= 0) && L.protocol_data?.parameters?.consideration) {
    try {
      let wei = 0n
      for (const c of L.protocol_data.parameters.consideration) {
        if (c.itemType === 0 || c.itemType === '0') {
          wei += BigInt(c.startAmount || c.endAmount || 0)
        }
      }
      if (wei > 0n) eth = Number(wei) / 1e18
    } catch {
      /* ignore */
    }
  }
  if (!Number.isFinite(eth) || eth <= 0) return null

  return {
    tokenId: String(tokenId),
    contract:
      L.asset?.contract || L.protocol_data?.parameters?.offer?.[0]?.token,
    chain: L.chain || 'robinhood',
    priceEth: +eth.toPrecision(8),
    seller: L.protocol_data?.parameters?.offerer?.toLowerCase() || null,
    orderHash: L.order_hash || null,
  }
}

/**
 * Full best-listings book.
 * Returns { listings, complete } — complete=false if rate-limited mid-fetch
 * so callers do NOT overwrite a larger previous book with a thin partial.
 */
export async function fetchAllBestListings(slug, { maxPages = 80, onPage } = {}) {
  const all = []
  const seen = new Set()
  let next = undefined
  let complete = true

  for (let page = 0; page < maxPages; page++) {
    let path = `/listings/collection/${encodeURIComponent(slug)}/best?limit=200`
    if (next) path += `&next=${encodeURIComponent(next)}`
    let data
    try {
      data = await openSeaGet(path)
    } catch (e) {
      console.warn(`[listings] ${slug} page ${page}: ${e?.message || e}`)
      complete = false
      break
    }
    if (!data) {
      // true empty page = end of book only when first page
      if (page === 0) complete = true
      else complete = false
      break
    }
    const rows = data?.listings || []
    if (!rows.length) break

    const batch = []
    for (const L of rows) {
      const p = parseListing(L)
      if (!p) continue
      if (seen.has(p.tokenId)) {
        const i = all.findIndex((x) => x.tokenId === p.tokenId)
        if (i >= 0 && p.priceEth < all[i].priceEth) all[i] = p
        continue
      }
      seen.add(p.tokenId)
      batch.push(p)
      all.push(p)
    }
    onPage?.(batch, all.length)
    next = data?.next
    if (!next) break
    await sleep(100)
  }

  if (next) complete = false // hit maxPages mid-book

  all.sort((a, b) => a.priceEth - b.priceEth)
  // Back-compat: array-like + metadata
  all.complete = complete
  return all
}

export async function fetchCollectionEvents(slug, limit = 50) {
  try {
    const data = await openSeaGet(
      `/events/collection/${encodeURIComponent(slug)}?limit=${Math.min(50, limit)}`
    )
    return data?.asset_events || []
  } catch {
    return []
  }
}

export async function fetchCollectionOffers(slug, maxPages = 3) {
  const all = []
  let next = undefined
  for (let page = 0; page < maxPages; page++) {
    let path = `/offers/collection/${encodeURIComponent(slug)}?limit=50`
    if (next) path += `&next=${encodeURIComponent(next)}`
    let data
    try {
      data = await openSeaGet(path)
    } catch {
      break
    }
    const rows = data?.offers || []
    if (!rows.length) break
    all.push(...rows)
    next = data?.next
    if (!next) break
    await sleep(60)
  }
  return all
}

export async function fetchCollectionStats(slug) {
  try {
    return await openSeaGet(`/collections/${encodeURIComponent(slug)}/stats`)
  } catch {
    return null
  }
}

export async function fetchCollection(slug) {
  try {
    return await openSeaGet(`/collections/${encodeURIComponent(slug)}`)
  } catch {
    return null
  }
}

/**
 * Discover OpenSea collections on Robinhood MAINNET only (chain=robinhood).
 * Never pulls testnet. Returns lightweight rows for indexer seed.
 */
/**
 * Discover OpenSea collections on Robinhood MAINNET.
 * Pulls several sort orders so NEW / hyped launches appear even before
 * they have 7d volume (created_date + one_day_volume + seven_day_volume).
 */
export async function fetchAllRobinhoodCollections({
  maxPages = 30,
  pageSize = 100,
  chain = 'robinhood',
  orderBy = 'seven_day_volume',
} = {}) {
  const out = []
  const seen = new Set()
  // Force mainnet OpenSea chain id
  const chainId = chain === 'robinhood' || !chain ? 'robinhood' : chain
  if (/testnet|sepolia|46630/i.test(chainId)) {
    console.warn('[discover] refusing testnet chain', chainId)
    return []
  }

  const orders = Array.isArray(orderBy)
    ? orderBy
    : [orderBy || 'seven_day_volume']

  for (const order of orders) {
    let next = undefined
    const pages =
      order === 'created_date' || order === 'one_day_volume'
        ? Math.min(maxPages, 12)
        : maxPages
    for (let page = 0; page < pages; page++) {
      let path = `/collections?chain=${encodeURIComponent(chainId)}&limit=${pageSize}&order_by=${encodeURIComponent(order)}`
      if (next) path += `&next=${encodeURIComponent(next)}`
      let data
      try {
        data = await openSeaGet(path)
      } catch (e) {
        console.warn(`[discover] ${order} page ${page}`, e?.message || e)
        break
      }
      const rows = data?.collections || []
      if (!rows.length) break
      for (const c of rows) {
        const slug = c.collection || c.slug
        if (!slug || seen.has(slug)) continue
        const contractChain = String(
          c.contracts?.[0]?.chain || chainId
        ).toLowerCase()
        if (/testnet|sepolia|46630/.test(contractChain)) continue
        // Only accept robinhood mainnet contracts
        if (contractChain && contractChain !== 'robinhood') continue
        seen.add(slug)
        out.push({
          slug,
          name: c.name || slug,
          image: c.image_url || '',
          banner: c.banner_image_url || c.image_url || '',
          description: c.description || '',
          contractAddress: c.contracts?.[0]?.address || null,
          chain: 'robinhood',
          items: c.total_supply || c.unique_item_count || 0,
          owner: c.owner || null,
          openseaUrl: c.opensea_url || `https://opensea.io/collection/${slug}`,
          // Prefer ranking signal from order used
          _discoverOrder: order,
          _createdDate: c.created_date || null,
        })
      }
      next = data?.next
      if (!next) break
      await sleep(120)
    }
  }
  console.log(
    `[discover] robinhood MAINNET collections: ${out.length} (orders=${orders.join(',')})`
  )
  return out
}

export async function fetchNft(chain, contract, tokenId) {
  const data = await openSeaGet(
    `/chain/${encodeURIComponent(chain)}/contract/${encodeURIComponent(contract)}/nfts/${encodeURIComponent(String(tokenId))}`
  )
  return data?.nft || null
}

export function mapEvents(slug, collectionId, events) {
  const acts = []
  for (const e of events) {
    const typeRaw = (e.event_type || '').toLowerCase()
    const orderType = (e.order_type || '').toLowerCase()
    let type = 'transfer'
    if (orderType.includes('item_offer') || orderType.includes('collection_offer')) {
      type = orderType.includes('collection') ? 'collection_offer' : 'offer'
    } else if (orderType.includes('listing')) type = 'listing'
    else if (typeRaw.includes('sale') || typeRaw === 'successful') type = 'sale'
    else if (typeRaw === 'order') {
      type = orderType.includes('offer')
        ? 'offer'
        : orderType.includes('list')
          ? 'listing'
          : 'offer'
    } else if (typeRaw.includes('list')) type = 'listing'
    else if (typeRaw.includes('offer') || typeRaw.includes('bid')) type = 'offer'
    else if (typeRaw.includes('mint')) type = 'mint'
    else if (typeRaw.includes('cancel')) continue

    const tokenId =
      e.nft?.identifier || e.asset?.identifier || e.asset?.token_id || undefined
    const tsRaw = e.event_timestamp
    const ts =
      typeof tsRaw === 'number'
        ? new Date(tsRaw > 1e12 ? tsRaw : tsRaw * 1000).toISOString()
        : tsRaw
          ? new Date(tsRaw).toISOString()
          : new Date().toISOString()

    let price
    if (e.payment?.quantity) {
      const dec = e.payment.token?.decimals ?? e.payment.decimals ?? 18
      price = Number(e.payment.quantity) / 10 ** dec
    }

    const from = e.maker || e.from_address || e.seller || 'unknown'
    const to = e.taker || e.to_address || e.buyer

    acts.push({
      id: `os-${slug}-${e.order_hash || tokenId || 'x'}-${ts}-${type}`,
      type,
      collectionId,
      nftId: tokenId ? `${collectionId}-os-${tokenId}` : undefined,
      from: short(from),
      to: to ? short(to) : undefined,
      price: price != null && Number.isFinite(price) ? +price.toPrecision(6) : undefined,
      timestamp: ts,
    })
  }
  return acts.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

export function mapOffers(collectionId, rows) {
  const out = []
  for (const r of rows) {
    if (r.status && r.status !== 'ACTIVE') continue
    const raw = r.price?.value ?? r.protocol_data?.parameters?.offer?.[0]?.startAmount
    const dec = r.price?.decimals ?? 18
    if (raw == null) continue
    const eth = Number(raw) / 10 ** dec
    if (!Number.isFinite(eth) || eth <= 0) continue
    const tokenId = r.asset?.identifier
    const isCollection =
      !tokenId || tokenId === 'null' || r.criteria?.encoded_token_ids === '*'
    const end = r.protocol_data?.parameters?.endTime
    const expiresAt = end
      ? new Date(Number(end) * 1000).toISOString()
      : new Date(Date.now() + 86400000).toISOString()
    const offerer = r.protocol_data?.parameters?.offerer || 'unknown'
    out.push({
      id: `os-offer-${r.order_hash || `${collectionId}-${eth}`}`,
      type: isCollection ? 'collection' : 'item',
      collectionId,
      nftId: !isCollection && tokenId ? `${collectionId}-os-${tokenId}` : undefined,
      offerer: offerer.toLowerCase(),
      price: +eth.toPrecision(6),
      expiresAt,
      createdAt: new Date().toISOString(),
    })
  }
  return out.sort((a, b) => b.price - a.price)
}

export function listingsToNfts(listings, collectionId, { name = '' } = {}) {
  const byToken = new Map()
  for (const L of listings) {
    const prev = byToken.get(L.tokenId)
    if (!prev || L.priceEth < prev.priceEth) byToken.set(L.tokenId, L)
  }
  const out = []
  for (const L of byToken.values()) {
    const tid = Number(L.tokenId)
    // Neutral stub (gray) — NOT green OpenHood branding (users confused it with testnet)
    const stubSvg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#1a1d21" width="400" height="400"/><text x="200" y="200" text-anchor="middle" fill="#6b7280" font-family="sans-serif" font-size="28">#${L.tokenId}</text></svg>`
    )
    out.push({
      id: `${collectionId}-os-${L.tokenId}`,
      tokenId: Number.isSafeInteger(tid) ? tid : parseInt(L.tokenId, 10) || 0,
      name: name ? `${name} #${L.tokenId}` : `#${L.tokenId}`,
      collectionId,
      image: `data:image/svg+xml,${stubSvg}`,
      owner: L.seller || 'unknown',
      listed: true,
      price: L.priceEth,
      traits: [
        { trait_type: 'Status', value: 'Listed' },
        { trait_type: 'Token ID', value: String(L.tokenId) },
      ],
    })
  }
  out.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  return out
}

function isPlaceholderImage(image) {
  if (!image) return true
  const s = String(image)
  if (s.includes('dicebear')) return true
  if (s.startsWith('data:image/svg')) return true
  if (s.includes('seed=openhood')) return true
  if (/image_type_(logo|hero|featured)/i.test(s)) return true
  if (/\/collection\/[^/]+\/image_type_/i.test(s)) return true
  return false
}

/** Stub traits from listings-only path — not real NFT attributes for filters */
function hasRealTraits(traits) {
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
 * Page OpenSea collection NFT catalog (50/req) and merge real art/names onto listed tokens.
 * Much faster than 1 request per NFT.
 */
export async function fillListedFromCatalog(slug, nfts, collectionId, { maxPages = 120 } = {}) {
  const byToken = new Map(nfts.map((n) => [String(n.tokenId), { ...n }]))
  const needed = new Set(
    nfts
      .filter(
        (n) =>
          isPlaceholderImage(n.image) ||
          !n.name ||
          String(n.name).startsWith('#') ||
          !hasRealTraits(n.traits)
      )
      .map((n) => String(n.tokenId))
  )
  if (!needed.size) return nfts

  let next = undefined
  for (let page = 0; page < maxPages && needed.size > 0; page++) {
    let path = `/collection/${encodeURIComponent(slug)}/nfts?limit=50`
    if (next) path += `&next=${encodeURIComponent(next)}`
    const data = await openSeaGet(path)
    const rows = data?.nfts || []
    if (!rows.length) break
    for (const raw of rows) {
      const tid = raw.identifier != null ? String(raw.identifier) : ''
      if (!tid || !needed.has(tid)) continue
      const existing = byToken.get(tid)
      if (!existing) continue
      const image = raw.image_url || raw.display_image_url || existing.image
      const traits = (raw.traits || [])
        .filter((t) => t.trait_type != null && t.value != null)
        .map((t) => ({ trait_type: String(t.trait_type), value: String(t.value) }))
      byToken.set(tid, {
        ...existing,
        name: raw.name || existing.name,
        image,
        owner: raw.owners?.[0]?.address?.toLowerCase() || existing.owner,
        traits: hasRealTraits(traits)
          ? traits
          : hasRealTraits(existing.traits)
            ? existing.traits
            : traits.length
              ? traits
              : existing.traits,
        rarityRank: raw.rarity?.rank ?? existing.rarityRank,
      })
      // Only drop from needed once we have real art AND real traits/metadata
      const nextRow = byToken.get(tid)
      if (
        nextRow &&
        !isPlaceholderImage(nextRow.image) &&
        hasRealTraits(nextRow.traits) &&
        nextRow.name &&
        !String(nextRow.name).startsWith('#')
      ) {
        needed.delete(tid)
      }
      // Keep paging for tokens that still lack art or metadata
    }
    next = data?.next
    if (!next) break
    await sleep(40)
  }
  console.log(
    `[catalog-fill] ${slug}: filled ${nfts.length - needed.size}/${nfts.length}, remaining stubs ${needed.size}`
  )
  return Array.from(byToken.values()).sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
}

/**
 * Per-token OpenSea fetch for listed IDs. Reliable for sparse listings
 * (catalog paging only helps when most of supply is listed).
 */
export async function enrichImages(
  nfts,
  listings,
  { chain = 'robinhood', concurrency = 6, limit = 500, onlyMissing = true } = {}
) {
  const contract =
    listings.find((L) => L.contract)?.contract ||
    nfts.find((n) => n.contract)?.contract
  // Build targets from listings OR missing nfts
  let targets = listings?.length
    ? listings.map((L) => ({
        tokenId: String(L.tokenId),
        contract: L.contract || contract,
        chain: L.chain || chain,
      }))
    : nfts.map((n) => ({
        tokenId: String(n.tokenId),
        contract,
        chain,
      }))

  if (onlyMissing) {
    const need = new Set(
      nfts
        .filter(
          (n) =>
            isPlaceholderImage(n.image) ||
            !n.name ||
            String(n.name).startsWith('#') ||
            !hasRealTraits(n.traits)
        )
        .map((n) => String(n.tokenId))
    )
    targets = targets.filter((t) => need.has(String(t.tokenId)))
  }

  if (!contract && !targets.some((t) => t.contract)) return nfts
  targets = targets.slice(0, limit)
  if (!targets.length) return nfts

  let i = 0
  const patches = new Map()

  async function worker() {
    while (i < targets.length) {
      const idx = i++
      const L = targets[idx]
      const c = L.contract || contract
      if (!c) continue
      try {
        const nft = await fetchNft(L.chain || chain, c, L.tokenId)
        if (!nft) continue
        patches.set(String(L.tokenId), {
          name: nft.name || undefined,
          image: nft.image_url || nft.display_image_url || undefined,
          owner: nft.owners?.[0]?.address?.toLowerCase() || undefined,
          traits: (nft.traits || [])
            .filter((t) => t.trait_type != null && t.value != null)
            .map((t) => ({
              trait_type: String(t.trait_type),
              value: String(t.value),
            })),
        })
      } catch {
        /* skip */
      }
      await sleep(30)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () => worker())
  )

  return nfts.map((n) => {
    const p = patches.get(String(n.tokenId))
    if (!p) return n
    return {
      ...n,
      name: p.name || n.name,
      image: p.image || n.image,
      owner: p.owner || n.owner,
      traits: hasRealTraits(p.traits)
        ? p.traits
        : hasRealTraits(n.traits)
          ? n.traits
          : p.traits?.length
            ? p.traits
            : n.traits,
    }
  })
}

export { isPlaceholderImage, hasRealTraits }

function short(addr) {
  if (!addr || addr.length < 12) return addr || 'unknown'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
