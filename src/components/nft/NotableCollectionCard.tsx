/**
 * Notable collection card — 150+ ETH volume leaders.
 * Unified volume ledger (total + floor / 7d / listed).
 */
import { Link } from 'react-router-dom'
import { BadgeCheck, Sparkles } from 'lucide-react'
import type { Collection } from '../../types'
import { formatPrice } from '../../data/mockData'
import { prefetchCollectionCatalog } from '../../lib/prefetchCatalog'
import { collectionMediaUrl } from '../../lib/mediaUrl'
import clsx from 'clsx'

interface Props {
  collection: Collection
  rank: number
  volumeTotal: number
  volume7d: number
  className?: string
  /** Smaller card for the notable panel stage */
  compact?: boolean
}

export function NotableCollectionCard({
  collection,
  rank,
  volumeTotal,
  volume7d,
  className,
  compact = false,
}: Props) {
  const logo =
    collectionMediaUrl(collection.slug, collection.image) || collection.image
  const banner =
    collection.banner && !/\.(mp4|webm|mov)(\?|$)/i.test(collection.banner)
      ? collection.banner
      : logo

  const listedPct =
    collection.listedPct != null && collection.listedPct > 0
      ? collection.listedPct
      : null
  const weekShare =
    volumeTotal > 0 ? Math.min(100, Math.max(6, (volume7d / volumeTotal) * 100)) : 12

  return (
    <Link
      to={`/collection/${collection.slug}`}
      onMouseEnter={() => prefetchCollectionCatalog(collection)}
      onFocus={() => prefetchCollectionCatalog(collection)}
      className={clsx(
        'notable-card group relative flex flex-col shrink-0',
        compact
          ? 'w-full min-w-0'
          : 'w-[min(85vw,260px)] sm:w-[280px] shrink-0',
        'rounded-2xl border border-edge overflow-hidden bg-surface',
        className
      )}
    >
      <div
        className={clsx(
          'relative overflow-hidden bg-surface-2',
          compact ? 'h-[96px]' : 'h-[112px] sm:h-[120px]'
        )}
      >
        <img
          src={banner}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 notable-card-overlay" />

        <div className="absolute top-0 right-0 z-[1]">
          <div className={clsx('notable-card-ribbon', compact && 'notable-card-ribbon-sm')}>
            <Sparkles className="w-3 h-3" />
            <span className="tabular-nums">{formatPrice(volumeTotal)} ETH</span>
          </div>
        </div>

        <div
          className={clsx(
            'absolute z-[1] flex items-end justify-between gap-2',
            compact ? 'bottom-2.5 left-2.5 right-2.5' : 'bottom-3 left-3 right-3'
          )}
        >
          <div className="relative">
            <img
              src={logo}
              alt=""
              referrerPolicy="no-referrer"
              className={clsx(
                'rounded-xl object-cover ring-[3px] ring-surface shadow-lg bg-surface-2',
                compact ? 'w-11 h-11' : 'w-12 h-12 sm:w-14 sm:h-14 rounded-2xl'
              )}
            />
            <span
              className={clsx(
                'absolute -bottom-1 -right-1 min-w-[1.25rem] h-[1.15rem] px-1 rounded-md',
                'flex items-center justify-center text-[9px] font-black tabular-nums border',
                rank === 1 &&
                  'bg-hood text-[#0b0e11] border-hood/40 shadow-md shadow-hood/30',
                rank === 2 &&
                  'bg-zinc-200 text-zinc-900 border-zinc-300 dark:bg-zinc-500 dark:text-white',
                rank === 3 && 'bg-amber-600 text-white border-amber-500/40',
                rank > 3 && 'bg-surface text-ink-2 border-edge'
              )}
            >
              {rank}
            </span>
          </div>
          <div className="rounded-full bg-black/50 backdrop-blur-md border border-white/10 px-2 py-0.5 text-[9px] font-bold text-white/90 uppercase tracking-wide">
            150+ ETH
          </div>
        </div>
      </div>

      <div
        className={clsx(
          'relative flex flex-col',
          compact ? 'px-2.5 pt-2.5 pb-2.5 gap-2' : 'px-3 pt-2.5 pb-3 gap-2.5'
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <h3
              className={clsx(
                'font-bold text-ink truncate tracking-tight',
                compact ? 'text-[13px]' : 'text-sm'
              )}
            >
              {collection.name}
            </h3>
            {collection.verified && (
              <BadgeCheck className="w-3.5 h-3.5 text-hood shrink-0" />
            )}
          </div>
          <p className="text-[10px] text-ink-3 mt-0.5 truncate">
            {collection.owners > 0
              ? `${collection.owners.toLocaleString()} owners`
              : 'Robinhood Chain'}
            {collection.items > 0 &&
              ` · ${collection.items.toLocaleString()} items`}
          </p>
        </div>

        <div className={clsx('notable-ledger', compact && 'notable-ledger-sm')}>
          <div className="notable-ledger-glow" aria-hidden />
          <div className="notable-ledger-head">
            <span className="notable-ledger-eyebrow">Total volume</span>
            <div className="notable-ledger-total">
              <span className="tabular-nums">{formatPrice(volumeTotal)}</span>
              <span className="notable-ledger-eth">ETH</span>
            </div>
          </div>
          <div className="notable-ledger-spectrum" aria-hidden>
            <div
              className="notable-ledger-spectrum-fill"
              style={{ width: `${weekShare}%` }}
            />
          </div>
          <div className="notable-ledger-feet">
            <div className="notable-ledger-foot">
              <span className="notable-ledger-num tabular-nums">
                {formatPrice(floorSafe(collection.floorPrice))}
              </span>
              <span className="notable-ledger-cap">
                Floor <em>ETH</em>
              </span>
            </div>
            <div className="notable-ledger-foot notable-ledger-foot-mid">
              <span className="notable-ledger-num tabular-nums">
                {formatPrice(volume7d)}
              </span>
              <span className="notable-ledger-cap">
                7d <em>ETH</em>
              </span>
            </div>
            <div className="notable-ledger-foot">
              <span className="notable-ledger-num tabular-nums">
                {listedPct != null
                  ? `${listedPct < 10 ? listedPct.toFixed(1) : Math.round(listedPct)}%`
                  : '—'}
              </span>
              <span className="notable-ledger-cap">Listed</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

function floorSafe(n: number) {
  return Number.isFinite(n) ? n : 0
}
