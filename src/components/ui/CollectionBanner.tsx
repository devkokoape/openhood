/**
 * Collection hero media — supports OpenSea video banners (mp4) and high-res stills.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { isVideoMediaUrl, upgradeOpenSeaImageUrl } from '../../lib/opensea'

export function CollectionBanner({
  src,
  fallbackSrc,
  className,
  alt = '',
}: {
  src?: string
  /** Still image used if video fails or as poster */
  fallbackSrc?: string
  className?: string
  alt?: string
}) {
  const [videoFailed, setVideoFailed] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  const video = src && isVideoMediaUrl(src) && !videoFailed
  const stillRaw = videoFailed || !isVideoMediaUrl(src) ? src : fallbackSrc || src
  const still =
    upgradeOpenSeaImageUrl(stillRaw, 1920) ||
    upgradeOpenSeaImageUrl(fallbackSrc, 1920) ||
    fallbackSrc ||
    stillRaw ||
    ''

  if (video && src) {
    return (
      <div className={clsx('absolute inset-0 bg-surface-3', className)}>
        <video
          key={src}
          className="absolute inset-0 w-full h-full object-cover"
          src={src}
          poster={upgradeOpenSeaImageUrl(fallbackSrc, 1600) || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setVideoFailed(true)}
        />
      </div>
    )
  }

  return (
    <div className={clsx('absolute inset-0 bg-surface-3', className)}>
      {!imgFailed && still ? (
        <img
          src={still}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          decoding="async"
          fetchPriority="high"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-surface-3 via-surface-2 to-hood/20" />
      )}
    </div>
  )
}
