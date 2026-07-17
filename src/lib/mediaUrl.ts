/**
 * Image URL strategy (speed-first):
 * 1) Real OpenSea/Seadn URL → browser loads CDN in parallel (fastest)
 * 2) Stub/missing → Fly media cache (or fetch-through once)
 * Never force every image through Fly (that was serializing & slowing grids).
 */
import { hasIndexerUrl, indexerUrl } from './indexerApi'

function isRealRemote(url?: string | null): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false
  if (url.includes('dicebear')) return false
  if (/image_type_(logo|hero|featured)/i.test(url)) return false
  return true
}

/** Per-token art */
export function nftMediaUrl(
  slug: string | undefined | null,
  tokenId: string | number | undefined | null,
  remoteFallback?: string | null
): string {
  const fb = (remoteFallback || '').trim()
  // Prefer direct CDN when we already have real token art
  if (isRealRemote(fb)) return fb

  if (!hasIndexerUrl() || !slug || tokenId == null || tokenId === '') {
    return fb
  }
  const base = `${indexerUrl()}/v1/media/nft/${encodeURIComponent(slug)}/${encodeURIComponent(String(tokenId))}`
  if (fb && /^https?:\/\//i.test(fb)) {
    return `${base}?fallback=${encodeURIComponent(fb)}`
  }
  return base
}

/** Collection logo — prefer real remote; Fly only as cache assist */
export function collectionMediaUrl(
  slug: string | undefined | null,
  remoteFallback?: string | null
): string {
  const fb = (remoteFallback || '').trim()
  if (isRealRemote(fb) || (fb && !fb.includes('dicebear'))) return fb
  if (!hasIndexerUrl() || !slug) return fb
  const base = `${indexerUrl()}/v1/media/collection/${encodeURIComponent(slug)}`
  if (fb && /^https?:\/\//i.test(fb)) {
    return `${base}?fallback=${encodeURIComponent(fb)}`
  }
  return base
}

/** Generic proxy — only use when needed (avoid for every card) */
export function proxiedMediaUrl(remote?: string | null): string {
  if (!remote) return ''
  if (isRealRemote(remote)) return remote
  if (!hasIndexerUrl()) return remote
  if (!/^https?:\/\//i.test(remote)) return remote
  return `${indexerUrl()}/v1/media/proxy?url=${encodeURIComponent(remote)}`
}
