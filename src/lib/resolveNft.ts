/**
 * Resolve an OpenSea NFT for detail pages after hard refresh.
 * Order: memory → IndexedDB catalog → Fly indexer → live OpenSea.
 */
import type { Nft } from '../types'
import {
  cacheOpenSeaNfts,
  fetchOpenSeaNft,
  getCachedOpenSeaNft,
  openSeaNftId,
  pickBestNftImage,
} from './opensea'
import { getCollectionStore, getCollectionStoreSync } from './collectionStore'
import { fetchIndexerCollection, hasIndexerUrl, indexerUrl } from './indexerApi'

export function parseNftRouteId(id: string): {
  collectionId: string | null
  tokenId: string | null
  slugGuess: string | null
} {
  const m = id.match(/^(.*)-os-(.+)$/)
  if (!m) return { collectionId: null, tokenId: null, slugGuess: null }
  const collectionId = m[1]
  const tokenId = m[2]
  // os1-gremlin-cartel or os-gremlin-cartel → gremlin-cartel
  const slugGuess = collectionId
    .replace(/^os\d+-/, '')
    .replace(/^os-/, '')
  return { collectionId, tokenId, slugGuess: slugGuess || null }
}

function findInCatalog(id: string, tokenId: string | null): Nft | null {
  // Scan memory + sync localStorage catalogs
  const tryEntry = (nfts: Nft[] | undefined) => {
    if (!nfts?.length) return null
    const exact = nfts.find((n) => n.id === id)
    if (exact) return exact
    if (tokenId) {
      const byTok = nfts.find((n) => String(n.tokenId) === tokenId)
      if (byTok) return byTok
    }
    return null
  }

  // Sync layer only — full IDB is async elsewhere
  // We don't have list-all-sync; scan known slug from id
  const { slugGuess } = parseNftRouteId(id)
  if (slugGuess) {
    const hit = tryEntry(getCollectionStoreSync(slugGuess)?.nfts)
    if (hit) return hit
  }
  return null
}

export async function resolveNftById(
  id: string,
  opts?: {
    slug?: string
    contractAddress?: string
    chain?: string
    collectionId?: string
  }
): Promise<Nft | null> {
  if (!id) return null

  // 1) In-memory
  const mem = getCachedOpenSeaNft(id)
  if (mem) return mem

  const { collectionId, tokenId, slugGuess } = parseNftRouteId(id)
  const slug = opts?.slug || slugGuess

  // 2) Local catalog (sync + IDB)
  const localSync = findInCatalog(id, tokenId)
  if (localSync) {
    cacheOpenSeaNfts([localSync])
    return localSync
  }
  if (slug) {
    const store = await getCollectionStore(slug)
    if (store?.nfts?.length) {
      const hit =
        store.nfts.find((n) => n.id === id) ||
        (tokenId
          ? store.nfts.find((n) => String(n.tokenId) === tokenId)
          : undefined)
      if (hit) {
        // Normalize id to route id for cache
        const normalized = { ...hit, id, collectionId: opts?.collectionId || hit.collectionId }
        cacheOpenSeaNfts([normalized])
        return normalized
      }
    }
  }

  // 3) Fly indexer
  if (hasIndexerUrl()) {
    try {
      const q = new URLSearchParams()
      if (slug) q.set('slug', slug)
      if (tokenId) q.set('tokenId', tokenId)
      if (opts?.contractAddress) q.set('contract', opts.contractAddress)
      if (opts?.chain) q.set('chain', opts.chain)
      const res = await fetch(
        `${indexerUrl()}/v1/nfts/${encodeURIComponent(id)}?${q.toString()}`,
        { headers: { accept: 'application/json' }, cache: 'no-store' }
      )
      if (res.ok) {
        const data = (await res.json()) as { nft?: Nft }
        if (data.nft) {
          const nft = {
            ...data.nft,
            id,
            collectionId:
              opts?.collectionId || data.nft.collectionId || collectionId || data.nft.collectionId,
          }
          cacheOpenSeaNfts([nft])
          return nft
        }
      }
      // Fallback: collection payload
      if (slug) {
        const col = await fetchIndexerCollection(slug)
        const hit = col?.nfts?.find(
          (n) => n.id === id || String(n.tokenId) === tokenId
        )
        if (hit) {
          const nft = {
            ...hit,
            id,
            collectionId: opts?.collectionId || hit.collectionId,
          }
          cacheOpenSeaNfts([nft])
          return nft
        }
      }
    } catch {
      /* continue */
    }
  }

  // 4) Live OpenSea by contract
  if (tokenId && opts?.contractAddress) {
    try {
      const raw = await fetchOpenSeaNft(
        opts.chain || 'robinhood',
        opts.contractAddress,
        tokenId
      )
      if (raw) {
        const colId = opts.collectionId || collectionId || `os-${slug || 'nft'}`
        const nft: Nft = {
          id: openSeaNftId(colId, tokenId),
          tokenId: Number(tokenId) || 0,
          name: raw.name || `#${tokenId}`,
          collectionId: colId,
          image:
            pickBestNftImage(raw) ||
            `https://api.dicebear.com/7.x/shapes/svg?seed=${colId}-${tokenId}`,
          owner: raw.owners?.[0]?.address?.toLowerCase() || 'unknown',
          listed: false,
          traits: (raw.traits || [])
            .filter((t) => t.trait_type != null && t.value != null)
            .map((t) => ({
              trait_type: String(t.trait_type),
              value: String(t.value),
            })),
        }
        // Prefer route id
        nft.id = id
        cacheOpenSeaNfts([nft])
        return nft
      }
    } catch {
      /* ignore */
    }
  }

  return null
}
