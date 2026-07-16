/**
 * OpenHood marketplace — ABIs, addresses, helpers for Robinhood testnet contracts.
 */
import { formatEther, parseEther, type Address } from 'viem'
import marketplaceArtifact from '../contracts/OpenHoodMarketplace.json'
import nftArtifact from '../contracts/MockERC721.json'

export const marketplaceAbi = marketplaceArtifact.abi as readonly unknown[]
export const mockErc721Abi = nftArtifact.abi as readonly unknown[]

/** Live Robinhood testnet deployment (2026-07-16) */
const DEPLOYED = {
  chainId: 46630,
  marketplace: '0xEc164cCA500E761eaE1e886ee7D347212409f619' as Address,
  nft: '0x88e3Dd568bF102499B332124B4D78472861641ed' as Address,
}

const envMarket = import.meta.env.VITE_MARKETPLACE_ADDRESS as string | undefined
const envNft = import.meta.env.VITE_DEMO_NFT_ADDRESS as string | undefined
const envChain = import.meta.env.VITE_CHAIN_ID as string | undefined

export const MARKETPLACE_ADDRESS = (envMarket || DEPLOYED.marketplace) as Address
export const DEMO_NFT_ADDRESS = (envNft || DEPLOYED.nft) as Address
/** Narrowed for wagmi chainId typing (Robinhood mainnet 4663 | testnet 46630) */
export const MARKETPLACE_CHAIN_ID = (
  Number(envChain || DEPLOYED.chainId) === 4663 ? 4663 : 46630
) as 4663 | 46630

export const MARKETPLACE_EXPLORER =
  MARKETPLACE_CHAIN_ID === 46630
    ? 'https://explorer.testnet.chain.robinhood.com'
    : 'https://robinhoodchain.blockscout.com'

export const ONCHAIN_COLLECTION_ID = 'onchain-openhood-demo'
export const ONCHAIN_COLLECTION_SLUG = 'openhood-testnet'

export function isMarketplaceDeployed(): boolean {
  return Boolean(MARKETPLACE_ADDRESS && MARKETPLACE_ADDRESS.startsWith('0x'))
}

export function feeBpsToPercent(bps: number | bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}%`
}

export function explorerTx(hash: string): string {
  return `${MARKETPLACE_EXPLORER}/tx/${hash}`
}

export function explorerAddress(addr: string): string {
  return `${MARKETPLACE_EXPLORER}/address/${addr}`
}

export function ethToWei(eth: string | number): bigint {
  return parseEther(String(eth))
}

export function weiToEth(wei: bigint): string {
  return formatEther(wei)
}

export function formatWeiPrice(wei: bigint): number {
  return Number(formatEther(wei))
}

export function onChainNftId(tokenId: number | bigint): string {
  return `${ONCHAIN_COLLECTION_ID}-${tokenId}`
}

export function parseOnChainTokenId(nftId: string): number | null {
  if (!nftId.startsWith(`${ONCHAIN_COLLECTION_ID}-`)) return null
  const n = Number(nftId.slice(ONCHAIN_COLLECTION_ID.length + 1))
  return Number.isFinite(n) ? n : null
}

export type ChainListing = {
  listingId: bigint
  seller: Address
  nft: Address
  tokenId: bigint
  price: bigint
  active: boolean
}

export type ChainAuction = {
  auctionId: bigint
  seller: Address
  nft: Address
  tokenId: bigint
  reservePrice: bigint
  highestBid: bigint
  highestBidder: Address
  endTime: bigint
  settled: boolean
  active: boolean
}
