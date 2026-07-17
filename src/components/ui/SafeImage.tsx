import { useEffect, useState } from 'react'
import clsx from 'clsx'

/** Neutral gray SVG — never green OpenHood/dicebear (looked like testnet badge). */
function grayStub(label: string): string {
  const text = (label || '#').slice(0, 12).replace(/[<>&"']/g, '')
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#1a1d21" width="400" height="400"/><text x="200" y="205" text-anchor="middle" fill="#6b7280" font-family="system-ui,sans-serif" font-size="28">${text}</text></svg>`
  )}`
}

function isBadSrc(src?: string): boolean {
  if (!src) return true
  if (src.includes('dicebear')) return true
  if (src.includes('seed=openhood')) return true
  return false
}

/** Image with lazy load + solid placeholder (no Seadn URL mangling). */
export function SafeImage({
  src,
  alt,
  className,
  fallbackSeed,
}: {
  src?: string
  alt: string
  className?: string
  fallbackSeed?: string
  highRes?: boolean
}) {
  // Track which src failed so a later enrich URL can recover
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  useEffect(() => {
    setFailedSrc(null)
  }, [src])

  const bad = isBadSrc(src) || (src != null && failedSrc === src)
  const fallback = grayStub(fallbackSeed || alt || 'NFT')
  const resolved = bad ? fallback : (src as string)

  return (
    <img
      key={resolved}
      src={resolved}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={clsx('bg-surface-2', className)}
      onError={() => {
        if (src) setFailedSrc(src)
      }}
    />
  )
}
