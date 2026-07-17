/**
 * Optional light fill when Fly has not finished item enrich yet.
 * Prefer server poll; only per-token OpenSea for a small batch (never 100+ catalog pages).
 */
import { useEffect, useRef } from 'react'
import type { Nft } from '../types'
import {
  cacheOpenSeaNfts,
  enrichNftsFromOpenSea,
  nftNeedsMetadata,
} from '../lib/opensea'
import { hasIndexerUrl } from '../lib/indexerApi'

export function useVisibleNftEnrich(
  nfts: Nft[],
  opts: {
    enabled: boolean
    slug?: string
    collectionId?: string
    contractAddress?: string
    chain?: string
    collectionImage?: string
    onPatch: (next: Nft[]) => void
  }
) {
  const busy = useRef(false)
  const nftsRef = useRef(nfts)
  nftsRef.current = nfts

  useEffect(() => {
    // When Fly indexer is on, server owns enrich — avoid browser OpenSea storms
    if (hasIndexerUrl()) return
    if (!opts.enabled || !opts.collectionId || !opts.contractAddress) return
    const missing = nfts.filter((n) =>
      nftNeedsMetadata(n, opts.collectionImage)
    )
    if (missing.length === 0 || busy.current) return

    let cancelled = false
    busy.current = true
    ;(async () => {
      try {
        const patches = await enrichNftsFromOpenSea(
          missing.slice(0, 40).map((n) => ({
            tokenId: n.tokenId,
            chain: opts.chain || 'robinhood',
            contract: opts.contractAddress!,
          })),
          opts.collectionId!,
          {
            chain: opts.chain || 'robinhood',
            contract: opts.contractAddress,
            concurrency: 5,
          }
        )
        if (cancelled || !patches.size) return
        const next = nftsRef.current.map((n) => {
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
        cacheOpenSeaNfts(next)
        opts.onPatch(next)
      } finally {
        busy.current = false
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    opts.enabled,
    opts.collectionId,
    opts.contractAddress,
    nfts.length,
  ])
}
