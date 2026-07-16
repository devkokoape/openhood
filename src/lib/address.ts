/** Short display form for wallets / mock actors */
export function formatAddress(addr: string): string {
  if (!addr) return ''
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Normalize for comparisons (lowercase; strips common zero-padding quirks) */
export function normalizeAddress(addr?: string | null): string {
  if (!addr) return ''
  return addr.trim().toLowerCase()
}

/**
 * Compare two addresses that may be full (0x + 40 hex) or already shortened.
 */
export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  const na = normalizeAddress(a)
  const nb = normalizeAddress(b)
  if (na === nb) return true

  // Full vs display form (0x1234…abcd)
  if (isFullAddress(a) && formatAddress(a).toLowerCase() === nb) return true
  if (isFullAddress(b) && formatAddress(b).toLowerCase() === na) return true
  return false
}

export function isFullAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr)
}

/** Canonical storage id for marketplace actors */
export function actorId(address?: string | null): string {
  if (!address) return ''
  if (isFullAddress(address)) return address.toLowerCase()
  return address
}
