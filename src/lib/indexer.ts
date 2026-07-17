/**
 * OpenHood mainnet indexer + risk classifier.
 *
 * Independence strategy:
 * 1. OpenSea Robinhood catalog = liquidity / volume ground truth when available
 * 2. Blockscout mainnet ERC-721 tokens = on-chain discovery independent of OpenSea
 * 3. Cross-match by contract address → enrich; unmatched mainnet tokens are risk-scored
 *
 * Policy (product rule):
 * - OpenSea + total volume ≥ VERIFIED_MIN_VOLUME_ETH → verified
 * - Everything else on Robinhood → high_risk or trash (never auto-verified)
 */

import type {
  Collection,
  CollectionRisk,
  IndexerProblem,
  IndexerReport,
  OpenSeaIntervals,
} from '../types'

/** OpenSea collections need this lifetime volume (ETH) to be verified */
export const VERIFIED_MIN_VOLUME_ETH = 3

const MAINNET_EXPLORER = 'https://robinhoodchain.blockscout.com'
const MAINNET_CHAIN_ID = 4663

export interface BlockscoutToken {
  address_hash?: string
  address?: string
  name?: string | null
  symbol?: string | null
  holders_count?: string | number | null
  total_supply?: string | number | null
  type?: string
  icon_url?: string | null
  reputation?: string | null
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function shortAddr(addr?: string): string {
  if (!addr) return '0xUnknown'
  if (addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function emptyIntervals(volumeTotal = 0, salesTotal = 0): OpenSeaIntervals {
  return {
    volume1d: 0,
    sales1d: 0,
    volume7d: 0,
    sales7d: 0,
    volume30d: 0,
    sales30d: 0,
    volumeTotal,
    salesTotal,
  }
}

/** Spam / low-signal heuristics for unnamed or junk collections */
function looksLikeSpam(name: string, symbol?: string): boolean {
  const s = `${name} ${symbol || ''}`.toLowerCase()
  if (!name || name === 'Unknown' || name.length < 2) return true
  if (/^(test|temp|xxx|aaa|untitled|null|undefined)/i.test(name)) return true
  if (/(free\s*mint|airdrop|claim\s*now|\$\$\$)/i.test(s)) return true
  if (/^0x[a-f0-9]{6,}$/i.test(name)) return true
  return false
}

/**
 * Core risk policy.
 * verified ⇔ OpenSea source AND volumeTotal ≥ 3 ETH
 */
export function classifyCollectionRisk(c: Collection): {
  risk: CollectionRisk
  verified: boolean
  reasons: string[]
} {
  const reasons: string[] = []
  const vol = c.volumeTotal || 0
  const owners = c.owners || 0
  const items = c.items || 0

  // Demo / OpenHood test surface
  if (c.source === 'demo' || c.id === 'onchain-openhood-demo') {
    reasons.push('OpenHood demo / testnet collection')
    return { risk: 'demo', verified: false, reasons }
  }

  // OpenSea catalog path
  if (c.source === 'opensea' || c.openseaUrl) {
    if (vol >= VERIFIED_MIN_VOLUME_ETH) {
      reasons.push(
        `OpenSea-listed with ${vol.toFixed(2)} ETH total volume (≥ ${VERIFIED_MIN_VOLUME_ETH} ETH)`
      )
      return { risk: 'verified', verified: true, reasons }
    }
    reasons.push(
      `OpenSea-listed but total volume ${vol.toFixed(4)} ETH is below ${VERIFIED_MIN_VOLUME_ETH} ETH threshold`
    )
    if (owners < 50) reasons.push(`Thin ownership (${owners} owners)`)
    if (items > 0 && owners / items < 0.02)
      reasons.push('Very low owner/item ratio (possible concentration)')
    return { risk: 'high_risk', verified: false, reasons }
  }

  // Mainnet-discovered without OpenSea liquidity
  if (c.source === 'mainnet') {
    if (looksLikeSpam(c.name)) {
      reasons.push('Name/symbol matches spam heuristics')
      return { risk: 'trash', verified: false, reasons }
    }
    if (owners >= 100 && items >= 100) {
      reasons.push(
        `On-chain ERC-721 with ${owners} holders but no OpenSea ≥${VERIFIED_MIN_VOLUME_ETH} ETH volume`
      )
      return { risk: 'high_risk', verified: false, reasons }
    }
    reasons.push('Discovered on Robinhood mainnet without OpenSea volume qualification')
    if (owners < 20) reasons.push(`Very few holders (${owners})`)
    return { risk: 'trash', verified: false, reasons }
  }

  // Unknown path
  reasons.push('Unknown source — treated as untrusted')
  return { risk: 'trash', verified: false, reasons }
}

/** Apply risk classification onto a collection (immutable) */
export function withRisk(c: Collection): Collection {
  const { risk, verified, reasons } = classifyCollectionRisk(c)
  return {
    ...c,
    risk,
    verified,
    riskReasons: reasons,
  }
}

export function applyRiskToAll(list: Collection[]): Collection[] {
  return list.map(withRisk)
}

/** Fetch ERC-721 tokens from Robinhood mainnet Blockscout (paginated). */
export async function fetchMainnetErc721Tokens(
  maxPages = 5
): Promise<BlockscoutToken[]> {
  const out: BlockscoutToken[] = []
  let nextUrl: string | null =
    `${MAINNET_EXPLORER}/api/v2/tokens?type=ERC-721`

  for (let page = 0; page < maxPages && nextUrl; page++) {
    try {
      const res = await fetch(nextUrl, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) break
      const data = (await res.json()) as {
        items?: BlockscoutToken[]
        next_page_params?: Record<string, string | number>
      }
      const items = data.items || []
      out.push(...items)

      if (data.next_page_params) {
        const q = new URLSearchParams()
        for (const [k, v] of Object.entries(data.next_page_params)) {
          q.set(k, String(v))
        }
        q.set('type', 'ERC-721')
        nextUrl = `${MAINNET_EXPLORER}/api/v2/tokens?${q.toString()}`
      } else {
        nextUrl = null
      }
    } catch {
      break
    }
  }
  return out
}

/** Map a Blockscout ERC-721 token into our Collection shape (pre-risk). */
export function blockscoutTokenToCollection(
  t: BlockscoutToken,
  index: number
): Collection {
  const address = (t.address_hash || t.address || '').toLowerCase()
  const name = t.name?.trim() || t.symbol?.trim() || `Unknown ${shortAddr(address)}`
  const symbol = t.symbol?.trim() || 'NFT'
  const holders = num(t.holders_count)
  const supply = num(t.total_supply)
  const image =
    t.icon_url ||
    `https://api.dicebear.com/7.x/shapes/svg?seed=${address || index}&backgroundColor=1a1f24,ff5000`

  return {
    id: `mainnet-${address || index}`,
    name,
    slug: `rh-${address.slice(2, 10) || index}`,
    description: `ERC-721 discovered on Robinhood mainnet via Blockscout indexer. Symbol: ${symbol}. Not auto-verified — requires OpenSea volume ≥ ${VERIFIED_MIN_VOLUME_ETH} ETH.`,
    image,
    banner: image,
    floorPrice: 0,
    volume24h: 0,
    volumeTotal: 0,
    items: supply || holders,
    owners: holders,
    founder: shortAddr(address),
    verified: false,
    contractAddress: address || undefined,
    chain: 'robinhood',
    source: 'mainnet',
    category: 'discovered',
    intervals: emptyIntervals(),
  }
}

/**
 * Merge OpenSea collections with mainnet-discovered tokens.
 * OpenSea wins on contract match; unmatched mainnet tokens are appended.
 */
export function mergeIndexedCollections(
  openseaCols: Collection[],
  mainnetTokens: BlockscoutToken[]
): Collection[] {
  const byContract = new Map<string, Collection>()
  const withoutContract: Collection[] = []

  for (const c of openseaCols) {
    const addr = c.contractAddress?.toLowerCase()
    if (addr) byContract.set(addr, c)
    else withoutContract.push(c)
  }

  const discovered: Collection[] = []
  let i = 0
  for (const t of mainnetTokens) {
    const addr = (t.address_hash || t.address || '').toLowerCase()
    if (!addr) continue
    if (byContract.has(addr)) {
      // Enrich OpenSea entry with live holder counts when better
      const existing = byContract.get(addr)!
      const holders = num(t.holders_count)
      const supply = num(t.total_supply)
      byContract.set(addr, {
        ...existing,
        owners: Math.max(existing.owners || 0, holders),
        items: Math.max(existing.items || 0, supply, existing.items || 0),
        chain: 'robinhood',
      })
      continue
    }
    discovered.push(blockscoutTokenToCollection(t, i++))
  }

  return [...withoutContract, ...byContract.values(), ...discovered]
}

/** Problem detector for admin panel */
export function detectIndexerProblems(collections: Collection[]): IndexerProblem[] {
  const problems: IndexerProblem[] = []
  let n = 0
  const id = () => `prob-${++n}`

  const verified = collections.filter((c) => c.risk === 'verified')
  const trash = collections.filter((c) => c.risk === 'trash')

  if (verified.length === 0) {
    problems.push({
      id: id(),
      severity: 'critical',
      code: 'NO_VERIFIED',
      title: 'No verified collections',
      detail: `No OpenSea collection currently meets ≥ ${VERIFIED_MIN_VOLUME_ETH} ETH total volume.`,
    })
  }

  if (trash.length > collections.length * 0.6 && collections.length > 10) {
    problems.push({
      id: id(),
      severity: 'warning',
      code: 'TRASH_DOMINANCE',
      title: 'Trash-tier majority',
      detail: `${trash.length}/${collections.length} collections classified as trash. Consider filtering default browse to verified only.`,
    })
  }

  for (const c of collections) {
    if (c.source === 'opensea' && c.volumeTotal > 0 && c.volumeTotal < VERIFIED_MIN_VOLUME_ETH) {
      problems.push({
        id: id(),
        severity: 'warning',
        code: 'LOW_VOLUME_OPENSEA',
        title: `Low-volume OpenSea: ${c.name}`,
        detail: `Total volume ${c.volumeTotal.toFixed(4)} ETH < ${VERIFIED_MIN_VOLUME_ETH} ETH → high_risk (not verified).`,
        collectionId: c.id,
        collectionName: c.name,
        contractAddress: c.contractAddress,
      })
    }

    if (c.risk === 'trash' && (c.owners || 0) > 500) {
      problems.push({
        id: id(),
        severity: 'info',
        code: 'POPULAR_TRASH',
        detail: `${c.owners} holders but trash-tier (no OpenSea ≥${VERIFIED_MIN_VOLUME_ETH} ETH volume). Manual review recommended.`,
        title: `Popular untrusted: ${c.name}`,
        collectionId: c.id,
        collectionName: c.name,
        contractAddress: c.contractAddress,
      })
    }

    if (c.contractAddress && !/^0x[a-fA-F0-9]{40}$/.test(c.contractAddress)) {
      problems.push({
        id: id(),
        severity: 'critical',
        code: 'BAD_CONTRACT',
        title: `Invalid contract on ${c.name}`,
        detail: `Address "${c.contractAddress}" is not a valid EVM address.`,
        collectionId: c.id,
        collectionName: c.name,
        contractAddress: c.contractAddress,
      })
    }

    if (c.items > 0 && c.owners > c.items * 1.5) {
      problems.push({
        id: id(),
        severity: 'info',
        code: 'OWNER_SUPPLY_MISMATCH',
        title: `Owner > supply anomaly: ${c.name}`,
        detail: `owners=${c.owners} items=${c.items} — indexer data may be stale or incomplete.`,
        collectionId: c.id,
        collectionName: c.name,
      })
    }

    if (c.floorPrice > 0 && c.volumeTotal === 0 && c.source === 'opensea') {
      problems.push({
        id: id(),
        severity: 'warning',
        code: 'FLOOR_NO_VOLUME',
        title: `Floor without volume: ${c.name}`,
        detail: `Floor ${c.floorPrice} ETH but reported total volume is 0.`,
        collectionId: c.id,
        collectionName: c.name,
      })
    }
  }

  // Cap problem list size for UI
  const critical = problems.filter((p) => p.severity === 'critical')
  const rest = problems.filter((p) => p.severity !== 'critical')
  return [...critical, ...rest].slice(0, 80)
}

export function buildIndexerReport(collections: Collection[]): IndexerReport {
  const scored = applyRiskToAll(collections)
  const problems = detectIndexerProblems(scored)

  const verified = scored.filter((c) => c.risk === 'verified')
  const highRisk = scored.filter((c) => c.risk === 'high_risk')
  const trash = scored.filter((c) => c.risk === 'trash')
  const demo = scored.filter((c) => c.risk === 'demo')

  return {
    updatedAt: new Date().toISOString(),
    chainId: MAINNET_CHAIN_ID,
    chainName: 'Robinhood Chain Mainnet',
    totals: {
      collections: scored.length,
      verified: verified.length,
      highRisk: highRisk.length,
      trash: trash.length,
      demo: demo.length,
      mainnetDiscovered: scored.filter((c) => c.source === 'mainnet').length,
      openseaIndexed: scored.filter((c) => c.source === 'opensea').length,
      volumeVerifiedEth: verified.reduce((s, c) => s + (c.volumeTotal || 0), 0),
      problems: problems.length,
    },
    problems,
    collections: scored,
  }
}

export const RISK_LABELS: Record<
  CollectionRisk,
  { label: string; short: string; tone: 'green' | 'orange' | 'muted' | 'blue' }
> = {
  verified: { label: 'Verified', short: 'Verified', tone: 'green' },
  high_risk: { label: 'High risk', short: 'High risk', tone: 'orange' },
  trash: { label: 'Trash', short: 'Trash', tone: 'muted' },
  demo: { label: 'Demo', short: 'Demo', tone: 'blue' },
}
