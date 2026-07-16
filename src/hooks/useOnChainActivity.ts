/**
 * Index marketplace + NFT mint events from Robinhood testnet for activity feed & volume stats.
 */
import { useCallback, useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import {
  type Address,
  type Log,
  formatEther,
  parseAbiItem,
  zeroAddress,
} from 'viem'
import {
  DEMO_NFT_ADDRESS,
  MARKETPLACE_ADDRESS,
  MARKETPLACE_CHAIN_ID,
  MARKETPLACE_DEPLOY_BLOCK,
  ONCHAIN_COLLECTION_ID,
  isMarketplaceDeployed,
  onChainNftId,
} from '../lib/marketplace'
import { formatAddress } from '../lib/address'
import type { Activity, OpenSeaIntervals } from '../types'

const listedEvent = parseAbiItem(
  'event Listed(uint256 indexed listingId, address indexed seller, address indexed nft, uint256 tokenId, uint256 price)'
)
const boughtEvent = parseAbiItem(
  'event Bought(uint256 indexed listingId, address indexed buyer, address indexed seller, address nft, uint256 tokenId, uint256 price, uint256 fee)'
)
const cancelledEvent = parseAbiItem(
  'event ListingCancelled(uint256 indexed listingId)'
)
const auctionCreatedEvent = parseAbiItem(
  'event AuctionCreated(uint256 indexed auctionId, address indexed seller, address indexed nft, uint256 tokenId, uint256 reservePrice, uint64 endTime)'
)
const bidPlacedEvent = parseAbiItem(
  'event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount)'
)
const auctionSettledEvent = parseAbiItem(
  'event AuctionSettled(uint256 indexed auctionId, address indexed winner, address indexed seller, uint256 price, uint256 fee)'
)
const auctionCancelledEvent = parseAbiItem(
  'event AuctionCancelled(uint256 indexed auctionId)'
)
const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
)

export type OnChainVolumeStats = {
  volume24h: number
  volumeTotal: number
  sales24h: number
  salesTotal: number
  volume7d: number
  sales7d: number
  volume30d: number
  sales30d: number
  intervals: OpenSeaIntervals
}

const emptyStats: OnChainVolumeStats = {
  volume24h: 0,
  volumeTotal: 0,
  sales24h: 0,
  salesTotal: 0,
  volume7d: 0,
  sales7d: 0,
  volume30d: 0,
  sales30d: 0,
  intervals: {
    volume1d: 0,
    sales1d: 0,
    volume7d: 0,
    sales7d: 0,
    volume30d: 0,
    sales30d: 0,
    volumeTotal: 0,
    salesTotal: 0,
  },
}

function short(addr: string): string {
  return formatAddress(addr)
}

function ethNum(wei: bigint): number {
  return Number(formatEther(wei))
}

type SalePoint = { price: number; ts: number }

function buildStats(sales: SalePoint[]): OnChainVolumeStats {
  const now = Date.now()
  const d1 = now - 86_400_000
  const d7 = now - 7 * 86_400_000
  const d30 = now - 30 * 86_400_000

  let volumeTotal = 0
  let volume24h = 0
  let volume7d = 0
  let volume30d = 0
  let salesTotal = 0
  let sales24h = 0
  let sales7d = 0
  let sales30d = 0

  for (const s of sales) {
    if (s.price <= 0) continue
    volumeTotal += s.price
    salesTotal++
    if (s.ts >= d1) {
      volume24h += s.price
      sales24h++
    }
    if (s.ts >= d7) {
      volume7d += s.price
      sales7d++
    }
    if (s.ts >= d30) {
      volume30d += s.price
      sales30d++
    }
  }

  const round = (n: number) => +n.toPrecision(6)

  return {
    volume24h: round(volume24h),
    volumeTotal: round(volumeTotal),
    sales24h,
    salesTotal,
    volume7d: round(volume7d),
    sales7d,
    volume30d: round(volume30d),
    sales30d,
    intervals: {
      volume1d: round(volume24h),
      sales1d: sales24h,
      volume7d: round(volume7d),
      sales7d,
      volume30d: round(volume30d),
      sales30d,
      volumeTotal: round(volumeTotal),
      salesTotal,
    },
  }
}

export function useOnChainActivity() {
  const publicClient = usePublicClient({ chainId: MARKETPLACE_CHAIN_ID })
  const enabled = isMarketplaceDeployed()
  const [activities, setActivities] = useState<Activity[]>([])
  const [stats, setStats] = useState<OnChainVolumeStats>(emptyStats)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!enabled || !publicClient) return
    setLoading(true)
    setError(null)
    try {
      const fromBlock = MARKETPLACE_DEPLOY_BLOCK
      const toBlock = 'latest' as const
      const market = MARKETPLACE_ADDRESS

      const [
        listedLogs,
        boughtLogs,
        cancelledLogs,
        auctionCreatedLogs,
        bidLogs,
        settledLogs,
        auctionCancelledLogs,
        mintLogs,
      ] = await Promise.all([
        publicClient.getLogs({
          address: market,
          event: listedEvent,
          fromBlock,
          toBlock,
        }),
        publicClient.getLogs({
          address: market,
          event: boughtEvent,
          fromBlock,
          toBlock,
        }),
        publicClient.getLogs({
          address: market,
          event: cancelledEvent,
          fromBlock,
          toBlock,
        }),
        publicClient.getLogs({
          address: market,
          event: auctionCreatedEvent,
          fromBlock,
          toBlock,
        }),
        publicClient.getLogs({
          address: market,
          event: bidPlacedEvent,
          fromBlock,
          toBlock,
        }),
        publicClient.getLogs({
          address: market,
          event: auctionSettledEvent,
          fromBlock,
          toBlock,
        }),
        publicClient.getLogs({
          address: market,
          event: auctionCancelledEvent,
          fromBlock,
          toBlock,
        }),
        publicClient.getLogs({
          address: DEMO_NFT_ADDRESS,
          event: transferEvent,
          args: { from: zeroAddress },
          fromBlock,
          toBlock,
        }),
      ])

      const allLogs: Log[] = [
        ...listedLogs,
        ...boughtLogs,
        ...cancelledLogs,
        ...auctionCreatedLogs,
        ...bidLogs,
        ...settledLogs,
        ...auctionCancelledLogs,
        ...mintLogs,
      ]

      const blockNums = [
        ...new Set(
          allLogs
            .map((l) => l.blockNumber)
            .filter((b): b is bigint => b != null)
        ),
      ]

      const tsMap = new Map<string, number>()
      await Promise.all(
        blockNums.map(async (bn) => {
          try {
            const block = await publicClient.getBlock({ blockNumber: bn })
            tsMap.set(bn.toString(), Number(block.timestamp) * 1000)
          } catch {
            tsMap.set(bn.toString(), Date.now())
          }
        })
      )

      const tsOf = (log: Log) => {
        const bn = log.blockNumber?.toString() ?? '0'
        return tsMap.get(bn) ?? Date.now()
      }
      const isoOf = (log: Log) => new Date(tsOf(log)).toISOString()

      const acts: Activity[] = []
      const sales: SalePoint[] = []

      for (const log of mintLogs) {
        const args = log.args as { to?: Address; tokenId?: bigint }
        if (args.tokenId == null || !args.to) continue
        acts.push({
          id: `chain-mint-${log.transactionHash}-${args.tokenId}`,
          type: 'mint',
          collectionId: ONCHAIN_COLLECTION_ID,
          nftId: onChainNftId(args.tokenId),
          from: short(args.to),
          to: short(args.to),
          price: 0,
          timestamp: isoOf(log),
        })
      }

      for (const log of listedLogs) {
        const args = log.args as {
          listingId?: bigint
          seller?: Address
          tokenId?: bigint
          price?: bigint
        }
        if (args.tokenId == null || !args.seller || args.price == null) continue
        acts.push({
          id: `chain-list-${log.transactionHash}-${args.listingId}`,
          type: 'listing',
          collectionId: ONCHAIN_COLLECTION_ID,
          nftId: onChainNftId(args.tokenId),
          from: short(args.seller),
          price: ethNum(args.price),
          timestamp: isoOf(log),
        })
      }

      for (const log of boughtLogs) {
        const args = log.args as {
          listingId?: bigint
          buyer?: Address
          seller?: Address
          tokenId?: bigint
          price?: bigint
        }
        if (
          args.tokenId == null ||
          !args.buyer ||
          !args.seller ||
          args.price == null
        )
          continue
        const price = ethNum(args.price)
        sales.push({ price, ts: tsOf(log) })
        acts.push({
          id: `chain-sale-${log.transactionHash}-${args.listingId}`,
          type: 'sale',
          collectionId: ONCHAIN_COLLECTION_ID,
          nftId: onChainNftId(args.tokenId),
          from: short(args.seller),
          to: short(args.buyer),
          price,
          timestamp: isoOf(log),
        })
      }

      for (const log of cancelledLogs) {
        const args = log.args as { listingId?: bigint }
        acts.push({
          id: `chain-cancel-${log.transactionHash}-${args.listingId}`,
          type: 'transfer',
          collectionId: ONCHAIN_COLLECTION_ID,
          from: 'marketplace',
          to: 'seller',
          timestamp: isoOf(log),
        })
      }

      for (const log of auctionCreatedLogs) {
        const args = log.args as {
          auctionId?: bigint
          seller?: Address
          tokenId?: bigint
          reservePrice?: bigint
        }
        if (args.tokenId == null || !args.seller) continue
        acts.push({
          id: `chain-auc-${log.transactionHash}-${args.auctionId}`,
          type: 'listing',
          collectionId: ONCHAIN_COLLECTION_ID,
          nftId: onChainNftId(args.tokenId),
          from: short(args.seller),
          price: args.reservePrice != null ? ethNum(args.reservePrice) : undefined,
          timestamp: isoOf(log),
        })
      }

      for (const log of bidLogs) {
        const args = log.args as {
          auctionId?: bigint
          bidder?: Address
          amount?: bigint
        }
        if (!args.bidder || args.amount == null) continue
        acts.push({
          id: `chain-bid-${log.transactionHash}-${args.auctionId}`,
          type: 'bid',
          collectionId: ONCHAIN_COLLECTION_ID,
          from: short(args.bidder),
          price: ethNum(args.amount),
          timestamp: isoOf(log),
        })
      }

      for (const log of settledLogs) {
        const args = log.args as {
          auctionId?: bigint
          winner?: Address
          seller?: Address
          price?: bigint
        }
        if (!args.seller || args.price == null) continue
        const price = ethNum(args.price)
        if (price > 0 && args.winner && args.winner !== zeroAddress) {
          sales.push({ price, ts: tsOf(log) })
          acts.push({
            id: `chain-settle-${log.transactionHash}-${args.auctionId}`,
            type: 'sale',
            collectionId: ONCHAIN_COLLECTION_ID,
            from: short(args.seller),
            to: short(args.winner),
            price,
            timestamp: isoOf(log),
          })
        }
      }

      for (const log of auctionCancelledLogs) {
        const args = log.args as { auctionId?: bigint }
        acts.push({
          id: `chain-auc-cancel-${log.transactionHash}-${args.auctionId}`,
          type: 'transfer',
          collectionId: ONCHAIN_COLLECTION_ID,
          from: 'auction',
          to: 'seller',
          timestamp: isoOf(log),
        })
      }

      acts.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )

      setActivities(acts)
      setStats(buildStats(sales))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load chain activity'
      setError(msg.slice(0, 160))
      console.warn('[useOnChainActivity]', e)
    } finally {
      setLoading(false)
    }
  }, [enabled, publicClient])

  useEffect(() => {
    void refetch()
    if (!enabled) return
    const id = window.setInterval(() => void refetch(), 3_000)
    return () => window.clearInterval(id)
  }, [enabled, refetch])

  return {
    enabled,
    activities,
    stats,
    loading,
    error,
    refetch,
  }
}
