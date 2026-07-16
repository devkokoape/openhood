import { useState } from 'react'
import clsx from 'clsx'

/** Image with lazy load + fallback placeholder */
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
}) {
  const [failed, setFailed] = useState(false)
  const seed = encodeURIComponent(fallbackSeed || alt || 'nft')
  const fallback = `https://api.dicebear.com/7.x/shapes/svg?seed=${seed}&backgroundColor=0b0e11,00c805`

  return (
    <img
      src={!src || failed ? fallback : src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={clsx('bg-surface-2', className)}
      onError={() => setFailed(true)}
    />
  )
}
