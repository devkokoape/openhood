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
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(400 * (attempt + 1))
      return openSeaGet(path, attempt + 1)
    }
    if (!res.ok) return null
    return await res.json()
  } catch {
    if (attempt < 2) {
      await sleep(300)
      return openSeaGet(path, attempt + 1)
    }
    return null
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

/** Full best-listings book (limit 200 pages). */
export async function fetchAllBestListings(slug, { maxPages = 80, onPage } = {}) {
  const all = []
  const seen = new Set()
  let next = undefined

  for (let page = 0; page < maxPages; page++) {
    let path = `/listings/collection/${encodeURIComponent(slug)}/best?limit=200`
    if (next) path += `&next=${encodeURIComponent(next)}`
    const data = await openSeaGet(path)
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
    await sleep(80)
  }

  all.sort((a, b) => a.priceEth - b.priceEth)
  return all
}

export async function fetchCollectionEvents(slug, limit = 50) {
  const data = await openSeaGet(
    `/events/collection/${encodeURIComponent(slug)}?limit=${Math.min(50, limit)}`
  )
  return data?.asset_events || []
}

export async function fetchCollectionOffers(slug, maxPages = 3) {
  const all = []
  let next = undefined
  for (let page = 0; page < maxPages; page++) {
    let path = `/offers/collection/${encodeURIComponent(slug)}?limit=50`
    if (next) path += `&next=${encodeURIComponent(next)}`
    const data = await openSeaGet(path)
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
  return openSeaGet(`/collections/${encodeURIComponent(slug)}/stats`)
}

export async function fetchCollection(slug) {
  return openSeaGet(`/collections/${encodeURIComponent(slug)}`)
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
    // Always stub with dicebear — never collection logo (that blocks enrich detection)
    out.push({
      id: `${collectionId}-os-${L.tokenId}`,
      tokenId: Number.isSafeInteger(tid) ? tid : parseInt(L.tokenId, 10) || 0,
      name: name ? `${name} #${L.tokenId}` : `#${L.tokenId}`,
      collectionId,
      image: `https://api.dicebear.com/7.x/shapes/svg?seed=${collectionId}-${L.tokenId}&backgroundColor=0b0e11,00c805`,
      owner: L.seller || 'unknown',
      listed: true,
      price: L.priceEth,
      traits: [
        { trait_type: 'Status', value: 'Listed' },
        { trait_type: 'Token ID', value: L.tokenId },
      ],
    })
  }
  out.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  return out
}

function isPlaceholderImage(image) {
  if (!image) return true
  if (String(image).includes('dicebear')) return true
  if (/image_type_(logo|hero|featured)/i.test(image)) return true
  if (/\/collection\/[^/]+\/image_type_/i.test(image)) return true
  return false
}

/**
 * Page OpenSea collection NFT catalog (50/req) and merge real art/names onto listed tokens.
 * Much faster than 1 request per NFT.
 */
export async function fillListedFromCatalog(slug, nfts, collectionId, { maxPages = 120 } = {}) {
  const byToken = new Map(nfts.map((n) => [String(n.tokenId), { ...n }]))
  const needed = new Set(
    nfts
      .filter((n) => isPlaceholderImage(n.image) || !n.name || String(n.name).startsWith('#'))
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
        traits: traits.length > 2 ? traits : existing.traits,
        rarityRank: raw.rarity?.rank ?? existing.rarityRank,
      })
      needed.delete(tid)
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
            !n.image ||
            String(n.image).includes('dicebear') ||
            /image_type_(logo|hero)/i.test(n.image)
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
      traits: p.traits?.length ? p.traits : n.traits,
    }
  })
}

function short(addr) {
  if (!addr || addr.length < 12) return addr || 'unknown'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
