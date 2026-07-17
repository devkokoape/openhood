import { useState } from 'react'
import clsx from 'clsx'

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
  const seed = encodeURIComponent(fallbackSeed || alt || 'nft')
  const fallback = `https://api.dicebear.com/7.x/shapes/svg?seed=${seed}&backgroundColor=0b0e11,00c805`
  const resolved = !src || failed ? fallback : src

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
