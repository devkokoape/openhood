import { useCallback, useMemo } from 'react'
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
  useSwitchChain,
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
} from '../lib/marketplace'
import { openConnectWallet } from '../lib/walletUi'
import { formatAddress } from '../lib/address'
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
        'Live demo NFTs on Robinhood testnet. List, buy, and auction on-chain with a 2.5% protocol fee.',
      image: `https://api.dicebear.com/7.x/shapes/svg?seed=openhood&backgroundColor=00c805`,
      banner: `https://api.dicebear.com/7.x/shapes/svg?seed=openhood-banner&backgroundColor=0b0e11`,
      floorPrice: 0,
      volume24h: 0,
      volumeTotal: 0,
      items: 0,
      owners: 0,
      founder: formatAddress(MARKETPLACE_ADDRESS),
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
    query: { enabled, refetchInterval: 15_000 },
  })

  const { data: nextListingId, refetch: refetchListings } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: marketplaceAbi,
    functionName: 'nextListingId',
    query: { enabled, refetchInterval: 15_000 },
  })

  const { data: nextAuctionId, refetch: refetchAuctions } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: marketplaceAbi,
    functionName: 'nextAuctionId',
    query: { enabled, refetchInterval: 15_000 },
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
    query: { enabled: ownerCalls.length > 0, refetchInterval: 15_000 },
  })

  const { data: listingRaws, refetch: refetchListingRaws } = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: listingCalls as any,
    query: { enabled: listingCalls.length > 0, refetchInterval: 15_000 },
  })

  const { data: auctionRaws, refetch: refetchAuctionRaws } = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: auctionCalls as any,
    query: { enabled: auctionCalls.length > 0, refetchInterval: 15_000 },
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
      if (!decoded?.active || decoded.settled) return
      if (decoded.nft.toLowerCase() !== DEMO_NFT_ADDRESS.toLowerCase()) return
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
    for (let i = 1; i <= tokenCount; i++) {
      const ownerResult = owners?.[i - 1]
      const owner =
        ownerResult?.status === 'success'
          ? (ownerResult.result as Address)
          : zeroAddress
      if (!owner || owner === zeroAddress) continue

      const L = listingByToken.get(String(i))
      const A = auctionByToken.get(String(i))
      list.push({
        id: onChainNftId(i),
        tokenId: i,
        name: `OpenHood Demo #${i}`,
        collectionId: ONCHAIN_COLLECTION_ID,
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=oh-${i}&backgroundColor=00c805,0b0e11`,
        owner: owner.toLowerCase(),
        listed: Boolean(L?.active),
        price: L ? formatWeiPrice(L.price) : undefined,
        traits: [
          { trait_type: 'Network', value: 'Robinhood Testnet' },
          { trait_type: 'Standard', value: 'ERC-721' },
          { trait_type: 'Token ID', value: String(i) },
          {
            trait_type: 'Status',
            value: A ? 'In auction' : L?.active ? 'Listed' : 'Unlisted',
          },
        ],
      })
    }
    return list
  }, [tokenCount, owners, listingByToken, auctionByToken])

  const collectionPatch = useMemo(() => {
    const floors = listings.map((l) => formatWeiPrice(l.price)).filter((p) => p > 0)
    const floor = floors.length ? Math.min(...floors) : 0
    const ownersSet = new Set(nfts.map((n) => n.owner.toLowerCase()))
    return {
      floorPrice: floor,
      items: nfts.length,
      owners: ownersSet.size,
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

export function useMarketplaceTx() {
  const { address, isConnected } = useAccount()
  const ensureChain = useEnsureMarketChain()
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

  const approveNft = useCallback(
    async (tokenId: bigint) =>
      run(() =>
        write({
          address: DEMO_NFT_ADDRESS,
          abi: mockErc721Abi,
          functionName: 'approve',
          args: [MARKETPLACE_ADDRESS, tokenId],
          chainId: MARKETPLACE_CHAIN_ID,
        })
      ),
    [run, write]
  )

  const listOnChain = useCallback(
    async (tokenId: number, priceEth: string) => {
      const tid = BigInt(tokenId)
      await approveNft(tid)
      return run(() =>
        write({
          address: MARKETPLACE_ADDRESS,
          abi: marketplaceAbi,
          functionName: 'list',
          args: [DEMO_NFT_ADDRESS, tid, ethToWei(priceEth)],
          chainId: MARKETPLACE_CHAIN_ID,
        })
      )
    },
    [approveNft, run, write]
  )

  const buyOnChain = useCallback(
    async (listingId: bigint, priceWei: bigint) =>
      run(() =>
        write({
          address: MARKETPLACE_ADDRESS,
          abi: marketplaceAbi,
          functionName: 'buy',
          args: [listingId],
          value: priceWei,
          chainId: MARKETPLACE_CHAIN_ID,
        })
      ),
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
      await approveNft(tid)
      return run(() =>
        write({
          address: MARKETPLACE_ADDRESS,
          abi: marketplaceAbi,
          functionName: 'createAuction',
          args: [DEMO_NFT_ADDRESS, tid, ethToWei(reserveEth), BigInt(durationSec)],
          chainId: MARKETPLACE_CHAIN_ID,
        })
      )
    },
    [approveNft, run, write]
  )

  const bidOnChain = useCallback(
    async (auctionId: bigint, amountEth: string) =>
      run(() =>
        write({
          address: MARKETPLACE_ADDRESS,
          abi: marketplaceAbi,
          functionName: 'bid',
          args: [auctionId],
          value: ethToWei(amountEth),
          chainId: MARKETPLACE_CHAIN_ID,
        })
      ),
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

  const mintDemo = useCallback(async () => {
    if (!address) {
      openConnectWallet()
      throw new Error('Connect wallet')
    }
    return run(() =>
      write({
        address: DEMO_NFT_ADDRESS,
        abi: mockErc721Abi,
        functionName: 'mint',
        args: [address],
        chainId: MARKETPLACE_CHAIN_ID,
      })
    )
  }, [address, run, write])

  return {
    address,
    isConnected,
    listOnChain,
    buyOnChain,
    cancelOnChain,
    createAuctionOnChain,
    bidOnChain,
    settleOnChain,
    mintDemo,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  }
}
