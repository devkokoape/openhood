import { useCallback, useMemo } from 'react'
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
  useSwitchChain,
  usePublicClient,
} from 'wagmi'
import { type Address, type Hex, zeroAddress } from 'viem'
import {
  DEMO_NFT_ADDRESS,
  MARKETPLACE_ADDRESS,
  MARKETPLACE_CHAIN_ID,
  MARKETPLACE_EXPLORER,
  ONCHAIN_COLLECTION_ID,
  ONCHAIN_COLLECTION_SLUG,
  marketplaceAbi,
  mockErc721Abi,
  type ChainAuction,
  type ChainListing,
  ethToWei,
  formatWeiPrice,
  isMarketplaceDeployed,
  onChainNftId,
  weiToEth,
} from '../lib/marketplace'
import { openConnectWallet } from '../lib/walletUi'
import type { Collection, Nft } from '../types'

const MAX_SCAN = 64

function asListing(raw: unknown, listingId: bigint): ChainListing | null {
  if (!raw) return null
  if (Array.isArray(raw)) {
    const [seller, nft, tokenId, price, active] = raw as [
      Address,
      Address,
      bigint,
      bigint,
      boolean,
    ]
    return { listingId, seller, nft, tokenId, price, active }
  }
  const o = raw as Record<string, unknown>
  return {
    listingId,
    seller: o.seller as Address,
    nft: o.nft as Address,
    tokenId: o.tokenId as bigint,
    price: o.price as bigint,
    active: Boolean(o.active),
  }
}

function asAuction(raw: unknown, auctionId: bigint): ChainAuction | null {
  if (!raw) return null
  if (Array.isArray(raw)) {
    const [
      seller,
      nft,
      tokenId,
      reservePrice,
      highestBid,
      highestBidder,
      endTime,
      settled,
      active,
    ] = raw as [
      Address,
      Address,
      bigint,
      bigint,
      bigint,
      Address,
      bigint,
      boolean,
      boolean,
    ]
    return {
      auctionId,
      seller,
      nft,
      tokenId,
      reservePrice,
      highestBid,
      highestBidder,
      endTime,
      settled,
      active,
    }
  }
  const o = raw as Record<string, unknown>
  return {
    auctionId,
    seller: o.seller as Address,
    nft: o.nft as Address,
    tokenId: o.tokenId as bigint,
    reservePrice: o.reservePrice as bigint,
    highestBid: o.highestBid as bigint,
    highestBidder: o.highestBidder as Address,
    endTime: o.endTime as bigint,
    settled: Boolean(o.settled),
    active: Boolean(o.active),
  }
}

export function useEnsureMarketChain() {
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { isConnected } = useAccount()

  return useCallback(async () => {
    if (!isConnected) {
      openConnectWallet()
      throw new Error('Connect wallet first')
    }
    if (chainId !== MARKETPLACE_CHAIN_ID) {
      await switchChainAsync({ chainId: MARKETPLACE_CHAIN_ID })
    }
  }, [chainId, isConnected, switchChainAsync])
}

export function useMarketFee() {
  const { data: feeBps } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: marketplaceAbi,
    functionName: 'feeBps',
    query: { enabled: isMarketplaceDeployed() },
  })
  const { data: feeRecipient } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: marketplaceAbi,
    functionName: 'feeRecipient',
    query: { enabled: isMarketplaceDeployed() },
  })
  return {
    feeBps: feeBps != null ? Number(feeBps as bigint) : 250,
    feeRecipient: feeRecipient as Address | undefined,
  }
}

export function useOnChainCollectionMeta(): Collection {
  return useMemo(
    () => ({
      id: ONCHAIN_COLLECTION_ID,
      name: 'OpenHood Testnet',
      slug: ONCHAIN_COLLECTION_SLUG,
      description:
        'Live demo NFTs on Robinhood testnet. List, buy, and auction on-chain with a 2.5% protocol fee. Mint free, list for sale, or run English auctions.',
      image: `https://api.dicebear.com/7.x/shapes/svg?seed=openhood&backgroundColor=00c805`,
      banner: `https://api.dicebear.com/7.x/shapes/svg?seed=openhood-banner&backgroundColor=0b0e11`,
      floorPrice: 0,
      volume24h: 0,
      volumeTotal: 0,
      items: 0,
      owners: 0,
      // Deployer / fee recipient (not the marketplace escrow)
      founder: '0xFd64a84cEfc471Ec7dE84a164D57eF311CCe5Fc6',
      website: MARKETPLACE_EXPLORER,
      verified: true,
      source: 'demo',
      chain: 'robinhood-testnet',
      contractAddress: DEMO_NFT_ADDRESS,
    }),
    []
  )
}

export function useOnChainInventory() {
  const enabled = isMarketplaceDeployed()

  const { data: nextTokenId, refetch: refetchNext } = useReadContract({
    address: DEMO_NFT_ADDRESS,
    abi: mockErc721Abi,
    functionName: 'nextTokenId',
    query: { enabled, refetchInterval: 2_000 },
  })

  const { data: nextListingId, refetch: refetchListings } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: marketplaceAbi,
    functionName: 'nextListingId',
    query: { enabled, refetchInterval: 2_000 },
  })

  const { data: nextAuctionId, refetch: refetchAuctions } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: marketplaceAbi,
    functionName: 'nextAuctionId',
    query: { enabled, refetchInterval: 2_000 },
  })

  const tokenCount =
    nextTokenId != null ? Math.min(Number(nextTokenId as bigint) - 1, MAX_SCAN) : 0
  const listingCount =
    nextListingId != null ? Math.min(Number(nextListingId as bigint) - 1, MAX_SCAN) : 0
  const auctionCount =
    nextAuctionId != null ? Math.min(Number(nextAuctionId as bigint) - 1, MAX_SCAN) : 0

  const ownerCalls = useMemo(() => {
    if (!enabled || tokenCount <= 0) return []
    return Array.from({ length: tokenCount }, (_, i) => ({
      address: DEMO_NFT_ADDRESS as Address,
      abi: mockErc721Abi,
      functionName: 'ownerOf' as const,
      args: [BigInt(i + 1)] as const,
    }))
  }, [enabled, tokenCount])

  const listingCalls = useMemo(() => {
    if (!enabled || listingCount <= 0) return []
    return Array.from({ length: listingCount }, (_, i) => ({
      address: MARKETPLACE_ADDRESS as Address,
      abi: marketplaceAbi,
      functionName: 'listings' as const,
      args: [BigInt(i + 1)] as const,
    }))
  }, [enabled, listingCount])

  const auctionCalls = useMemo(() => {
    if (!enabled || auctionCount <= 0) return []
    return Array.from({ length: auctionCount }, (_, i) => ({
      address: MARKETPLACE_ADDRESS as Address,
      abi: marketplaceAbi,
      functionName: 'auctions' as const,
      args: [BigInt(i + 1)] as const,
    }))
  }, [enabled, auctionCount])

  const { data: owners, refetch: refetchOwners } = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: ownerCalls as any,
    query: { enabled: ownerCalls.length > 0, refetchInterval: 2_000 },
  })

  const { data: listingRaws, refetch: refetchListingRaws } = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: listingCalls as any,
    query: { enabled: listingCalls.length > 0, refetchInterval: 2_000 },
  })

  const { data: auctionRaws, refetch: refetchAuctionRaws } = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: auctionCalls as any,
    query: { enabled: auctionCalls.length > 0, refetchInterval: 2_000 },
  })

  const listings = useMemo(() => {
    const out: ChainListing[] = []
    if (!listingRaws) return out
    listingRaws.forEach((r, i) => {
      if (r.status !== 'success' || r.result == null) return
      const decoded = asListing(r.result, BigInt(i + 1))
      if (!decoded?.active) return
      if (decoded.nft.toLowerCase() !== DEMO_NFT_ADDRESS.toLowerCase()) return
      out.push(decoded)
    })
    return out
  }, [listingRaws])

  const auctions = useMemo(() => {
    const out: ChainAuction[] = []
    if (!auctionRaws) return out
    auctionRaws.forEach((r, i) => {
      if (r.status !== 'success' || r.result == null) return
      const decoded = asAuction(r.result, BigInt(i + 1))
      if (!decoded) return
      // Treat live auctions: active and not settled (ended-but-unsettled still show)
      if (decoded.settled || !decoded.active) return
      const nftAddr = (decoded.nft || '').toLowerCase()
      // Accept our demo NFT; also accept if address empty (decode edge case) when tokenId present
      if (
        nftAddr &&
        nftAddr !== DEMO_NFT_ADDRESS.toLowerCase() &&
        nftAddr !== zeroAddress
      ) {
        return
      }
      out.push(decoded)
    })
    return out
  }, [auctionRaws])

  const listingByToken = useMemo(() => {
    const m = new Map<string, ChainListing>()
    for (const L of listings) m.set(L.tokenId.toString(), L)
    return m
  }, [listings])

  const auctionByToken = useMemo(() => {
    const m = new Map<string, ChainAuction>()
    for (const A of auctions) m.set(A.tokenId.toString(), A)
    return m
  }, [auctions])

  const nfts: Nft[] = useMemo(() => {
    if (tokenCount <= 0) return []
    const list: Nft[] = []
    const marketLower = MARKETPLACE_ADDRESS.toLowerCase()
    for (let i = 1; i <= tokenCount; i++) {
      const ownerResult = owners?.[i - 1]
      const chainOwner =
        ownerResult?.status === 'success'
          ? (ownerResult.result as Address)
          : zeroAddress
      if (!chainOwner || chainOwner === zeroAddress) continue

      const L = listingByToken.get(String(i))
      const A = auctionByToken.get(String(i))
      // Marketplace escrows NFTs on list/auction — show seller as logical owner
      // so cancel/list/profile ownership checks work.
      let logicalOwner = chainOwner
      if (L?.active && L.seller) logicalOwner = L.seller
      else if (A?.active && !A.settled && A.seller) logicalOwner = A.seller
      else if (chainOwner.toLowerCase() === marketLower) {
        if (L?.seller) logicalOwner = L.seller
        else if (A?.seller) logicalOwner = A.seller
      }

      const inAuction = Boolean(A?.active && !A.settled)
      const reserve = A ? formatWeiPrice(A.reservePrice) : undefined
      const highBid =
        A && A.highestBid > 0n ? formatWeiPrice(A.highestBid) : undefined
      // Display price: high bid if any, else reserve for auctions; listing price for fixed
      const auctionDisplay =
        inAuction && (highBid != null || reserve != null)
          ? (highBid ?? reserve)
          : undefined

      list.push({
        id: onChainNftId(i),
        tokenId: i,
        name: `OpenHood Demo #${i}`,
        collectionId: ONCHAIN_COLLECTION_ID,
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=oh-${i}&backgroundColor=00c805,0b0e11`,
        owner: logicalOwner.toLowerCase(),
        listed: Boolean(L?.active),
        price: L?.active ? formatWeiPrice(L.price) : auctionDisplay,
        inAuction,
        auctionPrice: auctionDisplay,
        auctionHighBid: highBid,
        auctionReserve: reserve,
        auctionEndsAt:
          inAuction && A
            ? new Date(Number(A.endTime) * 1000).toISOString()
            : undefined,
        traits: [
          { trait_type: 'Network', value: 'Robinhood Testnet' },
          { trait_type: 'Standard', value: 'ERC-721' },
          { trait_type: 'Token ID', value: String(i) },
          {
            trait_type: 'Status',
            value: inAuction ? 'In auction' : L?.active ? 'Listed' : 'Unlisted',
          },
        ],
      })
    }
    return list
  }, [tokenCount, owners, listingByToken, auctionByToken])

  const collectionPatch = useMemo(() => {
    const floors = listings.map((l) => formatWeiPrice(l.price)).filter((p) => p > 0)
    // Include auction reserves so floor isn't empty when only auctions are live
    for (const n of nfts) {
      if (n.inAuction && n.auctionReserve != null && n.auctionReserve > 0) {
        floors.push(n.auctionReserve)
      }
    }
    const floor = floors.length ? Math.min(...floors) : 0
    const ownersSet = new Set(nfts.map((n) => n.owner.toLowerCase()))
    const marketCount = nfts.filter((n) => n.listed || n.inAuction).length
    return {
      floorPrice: floor,
      items: nfts.length,
      owners: ownersSet.size,
      listedPct: nfts.length > 0 ? +((marketCount / nfts.length) * 100).toFixed(1) : 0,
      // volume filled by useOnChainActivity in MarketplaceContext
      volume24h: 0,
      volumeTotal: 0,
    }
  }, [listings, nfts])

  const refetchAll = useCallback(async () => {
    await Promise.all([
      refetchNext(),
      refetchListings(),
      refetchAuctions(),
      refetchOwners(),
      refetchListingRaws(),
      refetchAuctionRaws(),
    ])
  }, [
    refetchNext,
    refetchListings,
    refetchAuctions,
    refetchOwners,
    refetchListingRaws,
    refetchAuctionRaws,
  ])

  return {
    enabled,
    nfts,
    listings,
    auctions,
    listingByToken,
    auctionByToken,
    collectionPatch,
    refetchAll,
    tokenCount,
  }
}

/** Min bid matching OpenHoodMarketplace.bid (+5%, min +1 wei). */
export function minBidWei(auction: ChainAuction): bigint {
  if (auction.highestBid === 0n) return auction.reservePrice
  let min = auction.highestBid + (auction.highestBid * 5n) / 100n
  if (min === auction.highestBid) min = auction.highestBid + 1n
  return min
}

export function minBidEth(auction: ChainAuction): string {
  return weiToEth(minBidWei(auction))
}

export function useMarketplaceTx() {
  const { address, isConnected } = useAccount()
  const ensureChain = useEnsureMarketChain()
  const publicClient = usePublicClient({ chainId: MARKETPLACE_CHAIN_ID })
  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const run = useCallback(
    async (fn: () => Promise<Hex>) => {
      await ensureChain()
      return fn()
    },
    [ensureChain]
  )

  // JSON ABIs are loosely typed — cast write params for wagmi
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const write = writeContractAsync as (args: any) => Promise<Hex>

  const waitReceipt = useCallback(
    async (txHash: Hex) => {
      if (!publicClient) throw new Error('RPC client unavailable')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status === 'reverted') throw new Error('Transaction reverted')
      return receipt
    },
    [publicClient]
  )

  /** Approve marketplace for token if needed; wait for confirmation before listing. */
  const ensureApproved = useCallback(
    async (tokenId: bigint) => {
      if (!address) {
        openConnectWallet()
        throw new Error('Connect wallet')
      }
      if (!publicClient) throw new Error('RPC client unavailable')
      await ensureChain()

      const approved = (await publicClient.readContract({
        address: DEMO_NFT_ADDRESS,
        abi: mockErc721Abi,
        functionName: 'getApproved',
        args: [tokenId],
      })) as Address

      const operatorOk = (await publicClient.readContract({
        address: DEMO_NFT_ADDRESS,
        abi: mockErc721Abi,
        functionName: 'isApprovedForAll',
        args: [address, MARKETPLACE_ADDRESS],
      })) as boolean

      if (
        operatorOk ||
        approved.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase()
      ) {
        return null
      }

      const approveHash = await write({
        address: DEMO_NFT_ADDRESS,
        abi: mockErc721Abi,
        functionName: 'approve',
        args: [MARKETPLACE_ADDRESS, tokenId],
        chainId: MARKETPLACE_CHAIN_ID,
      })
      await waitReceipt(approveHash)
      return approveHash
    },
    [address, ensureChain, publicClient, waitReceipt, write]
  )

  const listOnChain = useCallback(
    async (tokenId: number, priceEth: string) => {
      const tid = BigInt(tokenId)
      const price = ethToWei(priceEth)
      if (price <= 0n) throw new Error('Price must be greater than 0')
      await ensureApproved(tid)
      return run(() =>
        write({
          address: MARKETPLACE_ADDRESS,
          abi: marketplaceAbi,
          functionName: 'list',
          args: [DEMO_NFT_ADDRESS, tid, price],
          chainId: MARKETPLACE_CHAIN_ID,
        })
      )
    },
    [ensureApproved, run, write]
  )

  const buyOnChain = useCallback(
    async (listingId: bigint, priceWei: bigint) => {
      if (priceWei <= 0n) throw new Error('Invalid listing price')
      return run(() =>
        write({
          address: MARKETPLACE_ADDRESS,
          abi: marketplaceAbi,
          functionName: 'buy',
          args: [listingId],
          value: priceWei,
          chainId: MARKETPLACE_CHAIN_ID,
        })
      )
    },
    [run, write]
  )

  const cancelOnChain = useCallback(
    async (listingId: bigint) =>
      run(() =>
        write({
          address: MARKETPLACE_ADDRESS,
          abi: marketplaceAbi,
          functionName: 'cancelListing',
          args: [listingId],
          chainId: MARKETPLACE_CHAIN_ID,
        })
      ),
    [run, write]
  )

  const createAuctionOnChain = useCallback(
    async (tokenId: number, reserveEth: string, durationSec: number) => {
      const tid = BigInt(tokenId)
      const reserve = ethToWei(reserveEth)
      if (reserve <= 0n) throw new Error('Reserve must be greater than 0')
      if (durationSec < 60) throw new Error('Auction must last at least 60 seconds')
      await ensureApproved(tid)
      return run(() =>
        write({
          address: MARKETPLACE_ADDRESS,
          abi: marketplaceAbi,
          functionName: 'createAuction',
          args: [DEMO_NFT_ADDRESS, tid, reserve, BigInt(durationSec)],
          chainId: MARKETPLACE_CHAIN_ID,
        })
      )
    },
    [ensureApproved, run, write]
  )

  const bidOnChain = useCallback(
    async (auctionId: bigint, amountEth: string) => {
      const value = ethToWei(amountEth)
      if (value <= 0n) throw new Error('Bid must be greater than 0')
      return run(() =>
        write({
          address: MARKETPLACE_ADDRESS,
          abi: marketplaceAbi,
          functionName: 'bid',
          args: [auctionId],
          value,
          chainId: MARKETPLACE_CHAIN_ID,
        })
      )
    },
    [run, write]
  )

  const settleOnChain = useCallback(
    async (auctionId: bigint) =>
      run(() =>
        write({
          address: MARKETPLACE_ADDRESS,
          abi: marketplaceAbi,
          functionName: 'settleAuction',
          args: [auctionId],
          chainId: MARKETPLACE_CHAIN_ID,
        })
      ),
    [run, write]
  )

  const cancelAuctionOnChain = useCallback(
    async (auctionId: bigint) =>
      run(() =>
        write({
          address: MARKETPLACE_ADDRESS,
          abi: marketplaceAbi,
          functionName: 'cancelAuction',
          args: [auctionId],
          chainId: MARKETPLACE_CHAIN_ID,
        })
      ),
    [run, write]
  )

  const mintDemo = useCallback(
    async (quantity = 1) => {
      if (!address) {
        openConnectWallet()
        throw new Error('Connect wallet')
      }
      const qty = Math.max(1, Math.min(20, Math.floor(quantity)))
      if (qty === 1) {
        return run(() =>
          write({
            address: DEMO_NFT_ADDRESS,
            abi: mockErc721Abi,
            functionName: 'mint',
            args: [address],
            chainId: MARKETPLACE_CHAIN_ID,
          })
        )
      }
      return run(() =>
        write({
          address: DEMO_NFT_ADDRESS,
          abi: mockErc721Abi,
          functionName: 'mintBatch',
          args: [address, BigInt(qty)],
          chainId: MARKETPLACE_CHAIN_ID,
        })
      )
    },
    [address, run, write]
  )

  return {
    address,
    isConnected,
    listOnChain,
    buyOnChain,
    cancelOnChain,
    createAuctionOnChain,
    bidOnChain,
    settleOnChain,
    cancelAuctionOnChain,
    mintDemo,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
    waitReceipt,
  }
}
