/**
 * Market stats — minimal marketplace strip (OpenSea / ord-style).
 * Clean type, soft separators, no heavy chrome.
 */
import clsx from 'clsx'
import { formatPrice } from '../../data/mockData'

export interface MarketPulseStats {
  vol24h: number
  vol7d: number
  collections: number
  listed: number
  auctions: number
}

export function MarketPulse({ stats }: { stats: MarketPulseStats }) {
  const items: {
    label: string
    value: string
    unit?: string
    accent?: 'hood' | 'amber'
  }[] = [
    {
      label: '24h vol',
      value: formatPrice(stats.vol24h),
      unit: 'ETH',
      accent: 'hood',
    },
    {
      label: '7d vol',
      value: formatPrice(stats.vol7d),
      unit: 'ETH',
    },
    {
      label: 'Collections',
      value: stats.collections.toLocaleString(),
    },
    {
      label: 'Listed',
      value: stats.listed.toLocaleString(),
    },
    {
      label: 'Auctions',
      value: stats.auctions.toLocaleString(),
      accent: stats.auctions > 0 ? 'amber' : undefined,
    },
    {
      label: 'Network',
      value: 'Robinhood',
    },
  ]

  return (
    <section
      aria-label="Market stats"
      className="rounded-xl border border-edge bg-surface-2/60 px-1 py-1"
    >
      <ul className="flex items-stretch overflow-x-auto hide-scrollbar">
        {items.map((item, i) => (
          <li
            key={item.label}
            className={clsx(
              'flex flex-col justify-center min-w-[7.5rem] sm:min-w-0 sm:flex-1 px-3.5 py-2.5',
              i > 0 && 'border-l border-edge/70'
            )}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-ink-3">
              {item.label}
            </span>
            <span className="mt-0.5 flex items-baseline gap-1 min-w-0">
              <span
                className={clsx(
                  'text-sm sm:text-[15px] font-bold tabular-nums tracking-tight truncate',
                  item.accent === 'hood' && 'text-hood',
                  item.accent === 'amber' && 'text-amber-600 dark:text-amber-400',
                  !item.accent && 'text-ink'
                )}
              >
                {item.value}
              </span>
              {item.unit && (
                <span
                  className={clsx(
                    'text-[10px] font-semibold shrink-0',
                    item.accent === 'hood' ? 'text-hood/75' : 'text-ink-3'
                  )}
                >
                  {item.unit}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
