import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import type { Activity, Collection, MintDrop, Nft, Offer } from '../types'
import {
  activities as seedActivities,
  bulkBuy as doBulkBuy,
  buyNft as doBuy,
  collections as seedCollections,
  listNft as doList,
  mintDrops as seedMints,
  mintFromDrop as doMint,
  nfts as seedNfts,
  offers as seedOffers,
  addOffer as doAddOffer,
  updateCollectionLinks as doUpdateLinks,
} from '../data/mockData'
import { actorId, formatAddress, sameAddress } from '../lib/address'
import { openConnectWallet } from '../lib/walletUi'
import {
  ONCHAIN_COLLECTION_ID,
  isMarketplaceDeployed,
} from '../lib/marketplace'
import {
  useOnChainCollectionMeta,
  useOnChainInventory,
} from '../hooks/useOnChainMarket'
import type { ChainAuction, ChainListing } from '../lib/marketplace'

interface MarketplaceCtx {
  user: string
  address: string | undefined
  actor: string
  connected: boolean
  connect: () => void
  disconnect: () => void
  collections: Collection[]
  nfts: Nft[]
  offers: Offer[]
  activities: Activity[]
  mintDrops: MintDrop[]
  refresh: () => void
  /** Refetch on-chain listings / ownership */
  refreshChain: () => Promise<void>
  buy: (nftId: string) => boolean
  bulkBuy: (nftIds: string[]) => number
  list: (nftId: string, price: number) => boolean
  mint: (slug: string, quantity: number) => number
  makeOffer: (offer: Omit<Offer, 'id' | 'createdAt'>) => Offer
  updateCollection: (
    id: string,
    links: { website?: string; twitter?: string; discord?: string; description?: string }
  ) => boolean
  isOwnerOf: (ownerField: string) => boolean
  isFounderOf: (founderField: string) => boolean
  /** On-chain marketplace live */
  chainEnabled: boolean
  listingByToken: Map<string, ChainListing>
  auctionByToken: Map<string, ChainAuction>
  chainListings: ChainListing[]
  chainAuctions: ChainAuction[]
}

const MarketplaceContext = createContext<MarketplaceCtx | null>(null)

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount()
  const { disconnect: wagmiDisconnect } = useDisconnect()
  const [tick, setTick] = useState(0)

  const onChainMeta = useOnChainCollectionMeta()
  const {
    enabled: chainEnabled,
    nfts: chainNfts,
    listings: chainListings,
    auctions: chainAuctions,
    listingByToken,
    auctionByToken,
    collectionPatch,
    refetchAll,
  } = useOnChainInventory()

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const refreshChain = useCallback(async () => {
    await refetchAll()
    refresh()
  }, [refetchAll, refresh])

  const connected = Boolean(isConnected && address)
  const actor = connected && address ? actorId(address) : ''
  const user = actor && address ? formatAddress(address) : ''

  const collections = useMemo(() => {
    void tick
    const mock = [...seedCollections]
    if (!chainEnabled || !isMarketplaceDeployed()) return mock
    const live: Collection = {
      ...onChainMeta,
      ...collectionPatch,
    }
    // Put live testnet collection first
    return [live, ...mock.filter((c) => c.id !== ONCHAIN_COLLECTION_ID)]
  }, [tick, chainEnabled, onChainMeta, collectionPatch])

  const nfts = useMemo(() => {
    void tick
    const mock = seedNfts.filter((n) => n.collectionId !== ONCHAIN_COLLECTION_ID)
    if (!chainEnabled) return [...mock]
    return [...chainNfts, ...mock]
  }, [tick, chainEnabled, chainNfts])

  const offers = useMemo(() => {
    void tick
    return [...seedOffers]
  }, [tick])

  const activities = useMemo(() => {
    void tick
    return [...seedActivities]
  }, [tick])

  const mintDrops = useMemo(() => {
    void tick
    return [...seedMints]
  }, [tick])

  const connect = useCallback(() => openConnectWallet(), [])
  const disconnect = useCallback(() => wagmiDisconnect(), [wagmiDisconnect])

  const isOwnerOf = useCallback(
    (ownerField: string) => sameAddress(ownerField, actor) || sameAddress(ownerField, address),
    [actor, address]
  )

  const isFounderOf = useCallback(
    (founderField: string) =>
      sameAddress(founderField, actor) || sameAddress(founderField, address),
    [actor, address]
  )

  // Mock-path actions (OpenSea catalog demo only — not on-chain)
  const buy = (nftId: string) => {
    if (nftId.startsWith(ONCHAIN_COLLECTION_ID)) return false
    if (!actor) {
      openConnectWallet()
      return false
    }
    const ok = doBuy(nftId, actor)
    if (ok) refresh()
    return ok
  }

  const bulkBuy = (nftIds: string[]) => {
    const mockIds = nftIds.filter((id) => !id.startsWith(ONCHAIN_COLLECTION_ID))
    if (!actor) {
      openConnectWallet()
      return 0
    }
    const n = doBulkBuy(mockIds, actor)
    if (n > 0) refresh()
    return n
  }

  const list = (nftId: string, price: number) => {
    if (nftId.startsWith(ONCHAIN_COLLECTION_ID)) return false
    if (!actor) {
      openConnectWallet()
      return false
    }
    const nft = seedNfts.find((n) => n.id === nftId)
    if (nft && !sameAddress(nft.owner, actor)) return false
    const ok = doList(nftId, price)
    if (ok) refresh()
    return ok
  }

  const mint = (slug: string, quantity: number) => {
    if (!actor) {
      openConnectWallet()
      return 0
    }
    const n = doMint(slug, actor, quantity)
    if (n > 0) refresh()
    return n
  }

  const makeOffer = (offer: Omit<Offer, 'id' | 'createdAt'>) => {
    if (!actor) {
      openConnectWallet()
      throw new Error('Connect wallet to make an offer')
    }
    const o = doAddOffer({ ...offer, offerer: actor })
    refresh()
    return o
  }

  const updateCollection = (
    id: string,
    links: { website?: string; twitter?: string; discord?: string; description?: string }
  ) => {
    if (!connected) {
      openConnectWallet()
      return false
    }
    const col = seedCollections.find((c) => c.id === id)
    if (!col) return false
    const allowed =
      isFounderOf(col.founder) || (col.slug === 'open-pixels' && connected)
    if (!allowed) return false
    const ok = doUpdateLinks(id, links)
    if (ok) refresh()
    return ok
  }

  return (
    <MarketplaceContext.Provider
      value={{
        user,
        address,
        actor,
        connected,
        connect,
        disconnect,
        collections,
        nfts,
        offers,
        activities,
        mintDrops,
        refresh,
        refreshChain,
        buy,
        bulkBuy,
        list,
        mint,
        makeOffer,
        updateCollection,
        isOwnerOf,
        isFounderOf,
        chainEnabled: chainEnabled && isMarketplaceDeployed(),
        listingByToken,
        auctionByToken,
        chainListings,
        chainAuctions,
      }}
    >
      {children}
    </MarketplaceContext.Provider>
  )
}

export function useMarketplace() {
  const ctx = useContext(MarketplaceContext)
  if (!ctx) throw new Error('useMarketplace must be used within MarketplaceProvider')
  return ctx
}
