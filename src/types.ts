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

/**
 * Indexer risk tier for Robinhood Chain collections.
 * - verified: OpenSea-listed + ≥3 ETH lifetime volume
 * - high_risk: OpenSea low-volume or thin mainnet activity
 * - trash: unindexed / spam-like / no meaningful volume
 * - demo: OpenHood local/testnet demo surface
 */
export type CollectionRisk = 'verified' | 'high_risk' | 'trash' | 'demo'

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
  /** True only when risk === 'verified' (OpenSea + ≥3 ETH total volume) */
  verified: boolean
  /** Indexer risk classification */
  risk?: CollectionRisk
  /** Human-readable reasons from the problem detector */
  riskReasons?: string[]
  /** OpenSea analytics (from API / snapshot) */
  openseaUrl?: string
  chain?: string
  contractAddress?: string
  salesTotal?: number
  listedPct?: number
  category?: string
  intervals?: OpenSeaIntervals
  source?: 'opensea' | 'demo' | 'mainnet'
}

/** Admin indexer problem report */
export type IndexerProblemSeverity = 'critical' | 'warning' | 'info'

export interface IndexerProblem {
  id: string
  severity: IndexerProblemSeverity
  code: string
  title: string
  detail: string
  collectionId?: string
  collectionName?: string
  contractAddress?: string
}

export interface IndexerReport {
  updatedAt: string
  chainId: number
  chainName: string
  totals: {
    collections: number
    verified: number
    highRisk: number
    trash: number
    demo: number
    mainnetDiscovered: number
    openseaIndexed: number
    volumeVerifiedEth: number
    problems: number
  }
  problems: IndexerProblem[]
  collections: Collection[]
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
  /** English auction (on-chain) */
  inAuction?: boolean
  /** Reserve or current high bid for display */
  auctionPrice?: number
  auctionHighBid?: number
  auctionReserve?: number
  auctionEndsAt?: string
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
  /** Free mint on Robinhood testnet MockERC721 */
  onChain?: boolean
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
