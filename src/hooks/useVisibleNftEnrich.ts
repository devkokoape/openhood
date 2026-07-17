/**
 * Progressively fill real NFT art/names for remaining placeholders.
 * Uses collection catalog pages (bulk) first, then per-token API.
 */
import { useEffect, useRef } from 'react'
import type { Nft } from '../types'
import {
  cacheOpenSeaNfts,
  enrichNftsFromOpenSea,
  fillListedNftMetadata,
  nftNeedsMetadata,
} from '../lib/opensea'

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
  const ran = useRef(false)
  const busy = useRef(false)
  const nftsRef = useRef(nfts)
  nftsRef.current = nfts

  useEffect(() => {
    if (!opts.enabled || !opts.slug || !opts.collectionId) return
    const missing = nfts.filter((n) =>
      nftNeedsMetadata(n, opts.collectionImage)
    )
    if (missing.length === 0) return
    if (busy.current) return

    let cancelled = false
    busy.current = true

    ;(async () => {
      try {
        // Bulk catalog pages cover most tokens efficiently
        const filled = await fillListedNftMetadata(
          opts.slug!,
          opts.collectionId!,
          nftsRef.current,
          {
            maxPages: 80,
            collectionImage: opts.collectionImage,
            signal: { cancelled: false },
            onProgress: (partial) => {
              if (cancelled) return
              opts.onPatch(partial)
            },
          }
        )
        if (cancelled) return
        opts.onPatch(filled)
        cacheOpenSeaNfts(filled)

        // Per-token for leftovers
        const still = filled.filter((n) =>
          nftNeedsMetadata(n, opts.collectionImage)
        )
        if (still.length && opts.contractAddress) {
          const patches = await enrichNftsFromOpenSea(
            still.slice(0, 100).map((n) => ({
              tokenId: n.tokenId,
              chain: opts.chain || 'robinhood',
              contract: opts.contractAddress!,
            })),
            opts.collectionId!,
            {
              chain: opts.chain || 'robinhood',
              contract: opts.contractAddress,
              concurrency: 6,
            }
          )
          if (cancelled || !patches.size) return
          const next = filled.map((n) => {
            const p = patches.get(String(n.tokenId))
            if (!p) return n
            return {
              ...n,
              name: p.name || n.name,
              image: p.image || n.image,
              owner: p.owner || n.owner,
              traits: p.traits?.length ? p.traits : n.traits,
              rarityRank: p.rarityRank ?? n.rarityRank,
            }
          })
          cacheOpenSeaNfts(next)
          opts.onPatch(next)
        }
      } finally {
        busy.current = false
        ran.current = true
      }
    })()

    return () => {
      cancelled = true
    }
    // Re-run when slug changes or many stubs appear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opts.enabled,
    opts.slug,
    opts.collectionId,
    opts.contractAddress,
    nfts.length,
  ])
}
