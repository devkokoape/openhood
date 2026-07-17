/**
 * Runs the Robinhood mainnet indexer: OpenSea catalog + Blockscout ERC-721 discovery
 * + risk classification + problem detection for the admin panel.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Collection, IndexerReport } from '../types'
import {
  applyRiskToAll,
  buildIndexerReport,
  fetchMainnetErc721Tokens,
  mergeIndexedCollections,
  VERIFIED_MIN_VOLUME_ETH,
} from '../lib/indexer'

export function useMainnetIndexer(baseCollections: Collection[]) {
  const [mainnetRaw, setMainnetRaw] = useState<Awaited<
    ReturnType<typeof fetchMainnetErc721Tokens>
  > | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastScanAt, setLastScanAt] = useState<string | null>(null)
  const [scanTick, setScanTick] = useState(0)

  const scan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const tokens = await fetchMainnetErc721Tokens(6)
      setMainnetRaw(tokens)
      setLastScanAt(new Date().toISOString())
      setScanTick((t) => t + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Indexer scan failed')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial mainnet discovery
  useEffect(() => {
    void scan()
    const id = window.setInterval(() => void scan(), 120_000)
    return () => window.clearInterval(id)
  }, [scan])

  const indexedCollections = useMemo(() => {
    void scanTick
    const opensea = baseCollections.filter(
      (c) => c.source === 'opensea' || c.openseaUrl
    )
    const other = baseCollections.filter(
      (c) => c.source !== 'opensea' && !c.openseaUrl
    )
    const tokens = mainnetRaw || []
    const merged = mergeIndexedCollections(opensea, tokens)
    // Keep demo/onchain entries that aren't in merge
    const mergedIds = new Set(merged.map((c) => c.id))
    const extras = other.filter((c) => !mergedIds.has(c.id))
    // Prefer contract match: drop extras that share contract with merged
    const mergedContracts = new Set(
      merged.map((c) => c.contractAddress?.toLowerCase()).filter(Boolean) as string[]
    )
    const extrasClean = extras.filter((c) => {
      const a = c.contractAddress?.toLowerCase()
      if (a && mergedContracts.has(a)) return false
      return true
    })
    return applyRiskToAll([...merged, ...extrasClean])
  }, [baseCollections, mainnetRaw, scanTick])

  const report: IndexerReport = useMemo(
    () => buildIndexerReport(indexedCollections),
    [indexedCollections]
  )

  return {
    loading,
    error,
    lastScanAt,
    scan,
    indexedCollections,
    report,
    verifiedMinVolumeEth: VERIFIED_MIN_VOLUME_ETH,
    mainnetTokenCount: mainnetRaw?.length ?? 0,
  }
}
