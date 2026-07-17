/**
 * Progressively enrich NFT images/names for items visible (or near) viewport.
 * Fixes deep-scroll placeholders when only first N were enriched.
 */
import { useEffect, useRef } from 'react'
import type { Nft } from '../types'
import {
  cacheOpenSeaNfts,
  enrichNftsFromOpenSea,
} from '../lib/opensea'

function needsEnrich(n: Nft) {
  return (
    !n.image ||
    n.image.includes('dicebear') ||
    !n.name ||
    n.name.startsWith('#')
  )
}

export function useVisibleNftEnrich(
  nfts: Nft[],
  opts: {
    enabled: boolean
    collectionId?: string
    contractAddress?: string
    chain?: string
    onPatch: (next: Nft[]) => void
  }
) {
  const queue = useRef<Set<string>>(new Set())
  const done = useRef<Set<string>>(new Set())
  const busy = useRef(false)
  const nftsRef = useRef(nfts)
  nftsRef.current = nfts

  useEffect(() => {
    if (!opts.enabled || !opts.contractAddress || !opts.collectionId) return

    const missing = nfts.filter(
      (n) => needsEnrich(n) && !done.current.has(String(n.tokenId))
    )
    // Always seed first 40 missing into queue (above fold + scroll)
    for (const n of missing.slice(0, 40)) {
      queue.current.add(String(n.tokenId))
    }

    const run = async () => {
      if (busy.current || queue.current.size === 0) return
      busy.current = true
      try {
        const batch = Array.from(queue.current).slice(0, 12)
        for (const t of batch) queue.current.delete(t)
        const items = batch.map((tokenId) => ({
          tokenId,
          chain: opts.chain || 'robinhood',
          contract: opts.contractAddress!,
        }))
        const patches = await enrichNftsFromOpenSea(items, opts.collectionId!, {
          chain: opts.chain || 'robinhood',
          contract: opts.contractAddress,
          concurrency: 6,
        })
        for (const t of batch) done.current.add(t)
        if (!patches.size) return
        const next = nftsRef.current.map((n) => {
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
      } finally {
        busy.current = false
        if (queue.current.size) void run()
      }
    }

    void run()
  }, [nfts, opts.enabled, opts.collectionId, opts.contractAddress, opts.chain, opts.onPatch])
}
