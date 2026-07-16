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
import { toast } from 'sonner'
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
import { useOnChainActivity } from '../hooks/useOnChainActivity'
import {
  useOpenSeaLive,
  type OpenSeaLiveStatus,
} from '../hooks/useOpenSeaLive'
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
  /** Force OpenSea live stats pull */
  refreshOpenSea: () => Promise<void>
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
  /** OpenSea live poll status */
  openSeaStatus: OpenSeaLiveStatus
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
  const {
    activities: chainActivities,
    stats: chainVolume,
    refetch: refetchActivity,
  } = useOnChainActivity()
  const {
    openSeaCollections,
    openSeaActivities,
    openSeaStatus,
    refreshOpenSea,
  } = useOpenSeaLive()

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const refreshChain = useCallback(async () => {
    await Promise.all([refetchAll(), refetchActivity(), refreshOpenSea()])
    refresh()
  }, [refetchAll, refetchActivity, refreshOpenSea, refresh])

  const connected = Boolean(isConnected && address)
  const actor = connected && address ? actorId(address) : ''
  const user = actor && address ? formatAddress(address) : ''

  const collections = useMemo(() => {
    void tick
    // Live OpenSea Robinhood collections (polled every second)
    const liveOs = openSeaCollections
    // Local demo collections only (not OpenSea snapshot)
    const demoLocal = seedCollections.filter((c) => c.source !== 'opensea')

    let list: Collection[] = [...liveOs, ...demoLocal]

    if (chainEnabled && isMarketplaceDeployed()) {
      const liveChain: Collection = {
        ...onChainMeta,
        ...collectionPatch,
        volume24h: chainVolume.volume24h,
        volumeTotal: chainVolume.volumeTotal,
        salesTotal: chainVolume.salesTotal,
        intervals: chainVolume.intervals,
      }
      list = [liveChain, ...list.filter((c) => c.id !== ONCHAIN_COLLECTION_ID)]
    }

    // Stable sort: on-chain first, then by 24h volume
    return list.sort((a, b) => {
      if (a.id === ONCHAIN_COLLECTION_ID) return -1
      if (b.id === ONCHAIN_COLLECTION_ID) return 1
      return b.volume24h - a.volume24h
    })
  }, [
    tick,
    openSeaCollections,
    chainEnabled,
    onChainMeta,
    collectionPatch,
    chainVolume,
  ])

  const nfts = useMemo(() => {
    void tick
    const mock = seedNfts.filter((n) => n.collectionId !== ONCHAIN_COLLECTION_ID)
    // Re-price mock OpenSea catalog nfts from live floors when available
    const floorByCol = new Map(
      collections.filter((c) => c.source === 'opensea').map((c) => [c.id, c.floorPrice])
    )
    const priced = mock.map((n) => {
      const floor = floorByCol.get(n.collectionId)
      if (floor == null || floor <= 0 || !n.listed) return n
      // Anchor listed mock items to live OpenSea floor with light variance
      return {
        ...n,
        price: +Number(floor * (0.95 + (n.tokenId % 10) * 0.012)).toPrecision(6),
      }
    })
    if (!chainEnabled) return priced
    return [...chainNfts, ...priced]
  }, [tick, chainEnabled, chainNfts, collections])

  const offers = useMemo(() => {
    void tick
    return [...seedOffers]
  }, [tick])

  const activities = useMemo(() => {
    void tick
    const mock = seedActivities.filter(
      (a) =>
        a.collectionId !== ONCHAIN_COLLECTION_ID &&
        !a.id.startsWith('os-')
    )
    return [...chainActivities, ...openSeaActivities, ...mock].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [tick, chainActivities, openSeaActivities])

  const mintDrops = useMemo(() => {
    void tick
    const mock = [...seedMints]
    if (!chainEnabled || !isMarketplaceDeployed()) return mock
    const onChainDrop: MintDrop = {
      id: 'mint-onchain-openhood',
      slug: 'openhood-testnet-mint',
      name: 'OpenHood Testnet Mint',
      description:
        'Free on-chain mint on Robinhood testnet (MockERC721). Mint 1–20 per tx, then list or auction on OpenHood.',
      image: onChainMeta.image,
      banner: onChainMeta.banner,
      collectionId: ONCHAIN_COLLECTION_ID,
      price: 0,
      supply: 10_000,
      minted: collectionPatch.items || chainNfts.length,
      maxPerWallet: 20,
      status: 'live',
      startsAt: new Date(0).toISOString(),
      chain: 'Robinhood Testnet',
      founder: onChainMeta.founder,
      onChain: true,
    }
    return [onChainDrop, ...mock]
  }, [tick, chainEnabled, onChainMeta, collectionPatch.items, chainNfts.length])

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
    if (nftId.startsWith(ONCHAIN_COLLECTION_ID)) {
      toast.message('Use Buy on-chain for testnet NFTs')
      return false
    }
    if (!actor) {
      openConnectWallet()
      return false
    }
    const ok = doBuy(nftId, actor)
    if (ok) {
      refresh()
      toast.success('Purchase complete', { description: 'NFT transferred to your wallet (demo)' })
    } else {
      toast.error('Purchase failed', { description: 'Item may be unlisted or unavailable' })
    }
    return ok
  }

  const bulkBuy = (nftIds: string[]) => {
    const mockIds = nftIds.filter((id) => !id.startsWith(ONCHAIN_COLLECTION_ID))
    if (!actor) {
      openConnectWallet()
      return 0
    }
    if (mockIds.length === 0) {
      toast.message('Select catalog items for demo bulk buy')
      return 0
    }
    const n = doBulkBuy(mockIds, actor)
    if (n > 0) {
      refresh()
      toast.success(`Bought ${n} NFT${n === 1 ? '' : 's'}`, {
        description: 'Demo catalog sweep complete',
      })
    } else {
      toast.error('Bulk buy failed')
    }
    return n
  }

  const list = (nftId: string, price: number) => {
    if (nftId.startsWith(ONCHAIN_COLLECTION_ID)) {
      toast.message('Use on-chain list for testnet NFTs')
      return false
    }
    if (!actor) {
      openConnectWallet()
      return false
    }
    if (!price || price <= 0 || Number.isNaN(price)) {
      toast.error('Enter a valid price')
      return false
    }
    const nft = seedNfts.find((n) => n.id === nftId)
    if (nft && !sameAddress(nft.owner, actor)) {
      toast.error('You do not own this NFT')
      return false
    }
    const ok = doList(nftId, price)
    if (ok) {
      refresh()
      toast.success('Listed for sale', { description: `${price} ETH (demo catalog)` })
    } else {
      toast.error('Could not list NFT')
    }
    return ok
  }

  const mint = (slug: string, quantity: number) => {
    if (!actor) {
      openConnectWallet()
      return 0
    }
    const qty = Math.floor(quantity)
    if (qty < 1) {
      toast.error('Quantity must be at least 1')
      return 0
    }
    const n = doMint(slug, actor, qty)
    if (n > 0) {
      refresh()
      toast.success(`Minted ${n} NFT${n === 1 ? '' : 's'}`, {
        description: 'Added to your demo holdings',
      })
    } else {
      toast.error('Mint failed', { description: 'Drop may be sold out or not live' })
    }
    return n
  }

  const makeOffer = (offer: Omit<Offer, 'id' | 'createdAt'>) => {
    if (!actor) {
      openConnectWallet()
      throw new Error('Connect wallet to make an offer')
    }
    if (!offer.price || offer.price <= 0 || Number.isNaN(offer.price)) {
      toast.error('Enter a valid offer price')
      throw new Error('Invalid offer price')
    }
    const o = doAddOffer({ ...offer, offerer: actor })
    refresh()
    toast.success('Offer placed', {
      description: `${offer.price} ETH · ${offer.type === 'collection' ? 'collection' : 'item'} offer`,
    })
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
    if (ok) {
      refresh()
      toast.success('Collection updated')
    } else {
      toast.error('Could not update collection')
    }
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
        refreshOpenSea,
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
        openSeaStatus,
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
