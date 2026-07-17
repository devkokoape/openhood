/**
 * Prefer Fly-hosted media when indexer URL is set (cached on volume).
 * Falls back to original OpenSea / Seadn URL.
 */
import { hasIndexerUrl, indexerUrl } from './indexerApi'

/** Per-token art from our Fly cache (or proxy-fetch on miss). */
export function nftMediaUrl(
  slug: string | undefined | null,
  tokenId: string | number | undefined | null,
  remoteFallback?: string | null
): string {
  const fb = remoteFallback || ''
  if (!hasIndexerUrl() || !slug || tokenId == null || tokenId === '') return fb
  const base = `${indexerUrl()}/v1/media/nft/${encodeURIComponent(slug)}/${encodeURIComponent(String(tokenId))}`
  if (fb && /^https?:\/\//i.test(fb) && !fb.includes('dicebear')) {
    return `${base}?fallback=${encodeURIComponent(fb)}`
  }
  return base
}

/** Collection logo from Fly cache. */
export function collectionMediaUrl(
  slug: string | undefined | null,
  remoteFallback?: string | null
): string {
  const fb = remoteFallback || ''
  if (!hasIndexerUrl() || !slug) return fb
  const base = `${indexerUrl()}/v1/media/collection/${encodeURIComponent(slug)}`
  if (fb && /^https?:\/\//i.test(fb)) {
    return `${base}?fallback=${encodeURIComponent(fb)}`
  }
  return base
}

/** Generic proxy for any https image through Fly (optional). */
export function proxiedMediaUrl(remote?: string | null): string {
  if (!remote) return ''
  if (!hasIndexerUrl()) return remote
  if (remote.includes('dicebear')) return remote
  if (!/^https?:\/\//i.test(remote)) return remote
  return `${indexerUrl()}/v1/media/proxy?url=${encodeURIComponent(remote)}`
}
