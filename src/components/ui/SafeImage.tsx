import { useState } from 'react'
import clsx from 'clsx'

/** Neutral gray SVG — never green OpenHood/dicebear (looked like testnet badge). */
function grayStub(label: string): string {
  const text = (label || '#').slice(0, 12).replace(/[<>&"']/g, '')
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#1a1d21" width="400" height="400"/><text x="200" y="205" text-anchor="middle" fill="#6b7280" font-family="system-ui,sans-serif" font-size="28">${text}</text></svg>`
  )}`
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
  const [failed, setFailed] = useState(false)
  // Reject green dicebear / openhood seeds even if passed as src
  const bad =
    !src ||
    src.includes('dicebear') ||
    src.includes('seed=openhood') ||
    failed
  const fallback = grayStub(fallbackSeed || alt || 'NFT')
  const resolved = bad ? fallback : src

  return (
    <img
      key={resolved}
      src={resolved}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={clsx('bg-surface-2', className)}
      onError={() => setFailed(true)}
    />
  )
}
