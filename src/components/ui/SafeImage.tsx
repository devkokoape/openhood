import { useState } from 'react'
import clsx from 'clsx'
import { upgradeOpenSeaImageUrl } from '../../lib/opensea'

/** Image with lazy load + fallback placeholder + higher-res OpenSea CDN when possible */
export function SafeImage({
  src,
  alt,
  className,
  fallbackSeed,
  highRes = true,
}: {
  src?: string
  alt: string
  className?: string
  fallbackSeed?: string
  /** Request larger Seadn/OpenSea derivatives (default true) */
  highRes?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const seed = encodeURIComponent(fallbackSeed || alt || 'nft')
  const fallback = `https://api.dicebear.com/7.x/shapes/svg?seed=${seed}&backgroundColor=0b0e11,00c805`
  const resolved =
    !src || failed
      ? fallback
      : highRes
        ? upgradeOpenSeaImageUrl(src, 800) || src
        : src

  return (
    <img
      src={resolved}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={clsx('bg-surface-2', className)}
      onError={() => setFailed(true)}
    />
  )
}
