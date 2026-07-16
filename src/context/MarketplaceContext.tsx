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

interface MarketplaceCtx {
  /** Short display address, or empty when disconnected */
  user: string
  /** Full wallet address when connected */
  address: string | undefined
  /** Canonical id used for ownership / offers (lowercase full address) */
  actor: string
  connected: boolean
  /** Opens the Connect Wallet modal */
  connect: () => void
  disconnect: () => void
  collections: Collection[]
  nfts: Nft[]
  offers: Offer[]
  activities: Activity[]
  mintDrops: MintDrop[]
  refresh: () => void
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
}

const MarketplaceContext = createContext<MarketplaceCtx | null>(null)

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount()
  const { disconnect: wagmiDisconnect } = useDisconnect()
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const connected = Boolean(isConnected && address)
  const actor = connected && address ? actorId(address) : ''
  const user = actor ? formatAddress(address!) : ''

  // tick forces re-read of mutated module-level mock stores after actions
  const collections = useMemo(() => {
    void tick
    return [...seedCollections]
  }, [tick])
  const nfts = useMemo(() => {
    void tick
    return [...seedNfts]
  }, [tick])
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

  const connect = useCallback(() => {
    openConnectWallet()
  }, [])

  const disconnect = useCallback(() => {
    wagmiDisconnect()
  }, [wagmiDisconnect])

  const isOwnerOf = useCallback(
    (ownerField: string) => sameAddress(ownerField, actor) || sameAddress(ownerField, address),
    [actor, address]
  )

  const isFounderOf = useCallback(
    (founderField: string) => sameAddress(founderField, actor) || sameAddress(founderField, address),
    [actor, address]
  )

  const buy = (nftId: string) => {
    if (!actor) {
      openConnectWallet()
      return false
    }
    const ok = doBuy(nftId, actor)
    if (ok) refresh()
    return ok
  }

  const bulkBuy = (nftIds: string[]) => {
    if (!actor) {
      openConnectWallet()
      return 0
    }
    const n = doBulkBuy(nftIds, actor)
    if (n > 0) refresh()
    return n
  }

  const list = (nftId: string, price: number) => {
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
    const o = doAddOffer({
      ...offer,
      offerer: actor,
    })
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
        buy,
        bulkBuy,
        list,
        mint,
        makeOffer,
        updateCollection,
        isOwnerOf,
        isFounderOf,
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
