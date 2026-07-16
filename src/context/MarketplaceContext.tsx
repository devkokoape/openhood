import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAccount } from 'wagmi'
import type { Activity, Collection, MintDrop, Nft, Offer } from '../types'
import {
  activities as seedActivities,
  bulkBuy as doBulkBuy,
  buyNft as doBuy,
  collections as seedCollections,
  formatAddress,
  listNft as doList,
  mintDrops as seedMints,
  mintFromDrop as doMint,
  nfts as seedNfts,
  offers as seedOffers,
  addOffer as doAddOffer,
  updateCollectionLinks as doUpdateLinks,
} from '../data/mockData'

interface MarketplaceCtx {
  /** Short display address, or empty when disconnected */
  user: string
  /** Full wallet address when connected */
  address: string | undefined
  connected: boolean
  /** @deprecated Use ConnectWallet / wagmi connect — kept for compatibility */
  connect: () => void
  /** @deprecated Use ConnectWallet disconnect */
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
  const { address, isConnected } = useAccount()
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const user = isConnected && address ? formatAddress(address) : ''
  const connected = Boolean(isConnected && address)
  // Full address used for ownership / trades when connected
  const actor = address || ''

  const collections = useMemo(() => [...seedCollections], [tick])
  const nfts = useMemo(() => [...seedNfts], [tick])
  const offers = useMemo(() => [...seedOffers], [tick])
  const activities = useMemo(() => [...seedActivities], [tick])
  const mintDrops = useMemo(() => [...seedMints], [tick])

  // Compatibility stubs — real connect UI is ConnectWallet
  const connect = () => {
    /* no-op: open ConnectWallet modal via UI */
  }
  const disconnect = () => {
    /* no-op */
  }

  const buy = (nftId: string) => {
    if (!actor) return false
    const ok = doBuy(nftId, formatAddress(actor))
    if (ok) refresh()
    return ok
  }

  const bulkBuy = (nftIds: string[]) => {
    if (!actor) return 0
    const n = doBulkBuy(nftIds, formatAddress(actor))
    if (n > 0) refresh()
    return n
  }

  const list = (nftId: string, price: number) => {
    const ok = doList(nftId, price)
    if (ok) refresh()
    return ok
  }

  const mint = (slug: string, quantity: number) => {
    if (!actor) return 0
    const n = doMint(slug, formatAddress(actor), quantity)
    if (n > 0) refresh()
    return n
  }

  const makeOffer = (offer: Omit<Offer, 'id' | 'createdAt'>) => {
    const o = doAddOffer({
      ...offer,
      offerer: actor ? formatAddress(actor) : offer.offerer,
    })
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
        address,
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
