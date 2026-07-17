/**
 * Lightweight device heuristics for memory/CPU-sensitive paths.
 * Mobile browsers crash when we hold 1000+ collections + multi-page NFT books.
 */

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** Prefer reduced background work (phones + save-data). */
export function preferLiteMode(): boolean {
  if (typeof navigator === 'undefined') return false
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  if (conn?.saveData) return true
  if (conn?.effectiveType && /2g|slow-2g/.test(conn.effectiveType)) return true
  // Device memory is Chrome-only (GB)
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (typeof mem === 'number' && mem <= 4) return true
  return isMobileDevice()
}

export function maxDiscoverCollections(): number {
  return preferLiteMode() ? 48 : 100
}

export function maxStatsBatch(): number {
  return preferLiteMode() ? 12 : 24
}

export function statsPollMs(): number {
  return preferLiteMode() ? 15_000 : 8_000
}

export function eventsPollMs(): number {
  return preferLiteMode() ? 30_000 : 12_000
}

export function collectionNftsFirstPage(): number {
  return preferLiteMode() ? 48 : 100
}

export function collectionNftsHardCap(): number {
  return preferLiteMode() ? 120 : 280
}

export function enrichWaveSize(): number {
  return preferLiteMode() ? 24 : 60
}

export function enrichConcurrency(): number {
  return preferLiteMode() ? 3 : 6
}

export function catalogWarmCount(): number {
  return preferLiteMode() ? 0 : 4 // skip background warm on phones
}

export function memCollectionCap(): number {
  return preferLiteMode() ? 6 : 12
}
