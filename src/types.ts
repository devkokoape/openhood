export type OfferType = 'item' | 'collection'

export interface OpenSeaIntervals {
  volume1h?: number
  sales1h?: number
  volume1d: number
  sales1d: number
  volume7d: number
  sales7d: number
  volume30d: number
  sales30d: number
  volumeTotal: number
  salesTotal: number
}

export interface Collection {
  id: string
  name: string
  slug: string
  description: string
  image: string
  banner: string
  floorPrice: number
  volume24h: number
  volumeTotal: number
  items: number
  owners: number
  founder: string
  website?: string
  twitter?: string
  discord?: string
  verified: boolean
  /** OpenSea analytics (from API / snapshot) */
  openseaUrl?: string
  chain?: string
  contractAddress?: string
  salesTotal?: number
  listedPct?: number
  category?: string
  intervals?: OpenSeaIntervals
  source?: 'opensea' | 'demo'
}

export interface Nft {
  id: string
  tokenId: number
  name: string
  collectionId: string
  image: string
  owner: string
  listed: boolean
  price?: number
  lastSale?: number
  rarityRank?: number
  traits: { trait_type: string; value: string }[]
}

export interface Offer {
  id: string
  type: OfferType
  collectionId: string
  nftId?: string
  offerer: string
  price: number
  quantity?: number
  expiresAt: string
  createdAt: string
}

export type ActivityType =
  | 'sale'
  | 'listing'
  | 'bid'
  | 'transfer'
  | 'offer'
  | 'collection_offer'
  | 'mint'

export interface Activity {
  id: string
  type: ActivityType
  collectionId: string
  nftId?: string
  from: string
  to?: string
  price?: number
  timestamp: string
}

export type MintStatus = 'live' | 'upcoming' | 'ended'

export interface MintDrop {
  id: string
  slug: string
  name: string
  description: string
  image: string
  banner: string
  collectionId?: string
  price: number
  supply: number
  minted: number
  maxPerWallet: number
  status: MintStatus
  startsAt: string
  endsAt?: string
  chain: string
  founder: string
}

export interface UserProfile {
  address: string
  displayName: string
  avatar: string
  bio: string
  joinedAt: string
  twitter?: string
  website?: string
}
