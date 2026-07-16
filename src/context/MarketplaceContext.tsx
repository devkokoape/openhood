import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Activity, Collection, MintDrop, Nft, Offer } from '../types'
import {
  activities as seedActivities,
  bulkBuy as doBulkBuy,
  buyNft as doBuy,
  collections as seedCollections,
  CURRENT_USER,
  listNft as doList,
  mintDrops as seedMints,
  mintFromDrop as doMint,
  nfts as seedNfts,
  offers as seedOffers,
  addOffer as doAddOffer,
  updateCollectionLinks as doUpdateLinks,
} from '../data/mockData'

interface MarketplaceCtx {
  user: string
  connected: boolean
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
}

const MarketplaceContext = createContext<MarketplaceCtx | null>(null)

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(CURRENT_USER)
  const [connected, setConnected] = useState(true)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const collections = useMemo(() => [...seedCollections], [tick])
  const nfts = useMemo(() => [...seedNfts], [tick])
  const offers = useMemo(() => [...seedOffers], [tick])
  const activities = useMemo(() => [...seedActivities], [tick])
  const mintDrops = useMemo(() => [...seedMints], [tick])

  const connect = () => {
    setUser(CURRENT_USER)
    setConnected(true)
  }
  const disconnect = () => setConnected(false)

  const buy = (nftId: string) => {
    const ok = doBuy(nftId, user)
    if (ok) refresh()
    return ok
  }

  const bulkBuy = (nftIds: string[]) => {
    const n = doBulkBuy(nftIds, user)
    if (n > 0) refresh()
    return n
  }

  const list = (nftId: string, price: number) => {
    const ok = doList(nftId, price)
    if (ok) refresh()
    return ok
  }

  const mint = (slug: string, quantity: number) => {
    const n = doMint(slug, user, quantity)
    if (n > 0) refresh()
    return n
  }

  const makeOffer = (offer: Omit<Offer, 'id' | 'createdAt'>) => {
    const o = doAddOffer(offer)
    refresh()
    return o
  }

  const updateCollection = (
    id: string,
    links: { website?: string; twitter?: string; discord?: string; description?: string }
  ) => {
    const ok = doUpdateLinks(id, links)
    if (ok) refresh()
    return ok
  }

  return (
    <MarketplaceContext.Provider
      value={{
        user,
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
