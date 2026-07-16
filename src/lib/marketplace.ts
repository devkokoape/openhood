/**
 * OpenHood marketplace contract helpers (viem/wagmi).
 * Addresses come from env after deploy (see deployments/*.env).
 */
import marketplaceArtifact from '../contracts/OpenHoodMarketplace.json'
import nftArtifact from '../contracts/MockERC721.json'

export const marketplaceAbi = marketplaceArtifact.abi
export const mockErc721Abi = nftArtifact.abi

export const MARKETPLACE_ADDRESS = (import.meta.env.VITE_MARKETPLACE_ADDRESS ||
  '') as `0x${string}` | ''

export const DEMO_NFT_ADDRESS = (import.meta.env.VITE_DEMO_NFT_ADDRESS ||
  '') as `0x${string}` | ''

export const MARKETPLACE_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 46630)

export function isMarketplaceDeployed(): boolean {
  return Boolean(MARKETPLACE_ADDRESS && MARKETPLACE_ADDRESS.startsWith('0x'))
}

/** Default protocol fee display (bps → percent string) */
export function feeBpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`
}
