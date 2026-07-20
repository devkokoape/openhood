/**
 * Home Discover rail — sort modes + Verified / YOLO filters.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Skull,
  TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'
import type { Collection } from '../../types'
import { FeaturedCollectionCard } from './FeaturedCollectionCard'
import { EmptyState } from '../ui/EmptyState'
import {
  AnimatedCompass,
  AnimatedFlame,
  AnimatedIconBadge,
} from '../ui/AnimatedIcons'

type SortMode = 'trending' | 'volume' | 'floor' | 'listed'
/** Default = no trust filter; verified or yolo (high risk / trash) */
type TrustFilter = 'default' | 'verified' | 'yolo'

const SORTS: { id: SortMode; label: string; short: string }[] = [
  { id: 'trending', label: 'Trending', short: 'Trend' },
  { id: 'volume', label: 'Top volume', short: 'Volume' },
  { id: 'floor', label: 'Floor', short: 'Floor' },
  { id: 'listed', label: 'Most listed', short: 'Listed' },
]

function sortCollections(list: Collection[], mode: SortMode): Collection[] {
  const next = [...list]
  switch (mode) {
    case 'trending':
      return next.sort((a, b) => {
        const score = (c: Collection) => {
          const sales = c.intervals?.sales1d ?? 0
          return c.volume24h * 1 + sales * (c.floorPrice || 0.01) * 0.35
        }
        return score(b) - score(a)
      })
    case 'volume':
      return next.sort((a, b) => b.volumeTotal - a.volumeTotal)
    case 'floor':
      return next
        .filter((c) => c.floorPrice > 0)
        .sort((a, b) => a.floorPrice - b.floorPrice)
        .concat(next.filter((c) => !(c.floorPrice > 0)))
    case 'listed':
      return next.sort(
        (a, b) => (b.listedPct ?? 0) - (a.listedPct ?? 0) || b.volume24h - a.volume24h
      )
    default:
      return next.sort((a, b) => b.volume24h - a.volume24h)
  }
}

function isYolo(c: Collection): boolean {
  if (c.risk === 'high_risk' || c.risk === 'trash') return true
  if (c.verified || c.risk === 'verified') return false
  // Unverified / demo without verified flag → treat as higher risk
  if (c.risk === 'demo') return true
  return !c.verified
}

function matchesTrust(c: Collection, trust: TrustFilter): boolean {
  if (trust === 'default') return true
  if (trust === 'verified') return Boolean(c.verified || c.risk === 'verified')
  if (trust === 'yolo') return isYolo(c)
  return true
}

export function DiscoverSection({
  collections,
  searchQuery = '',
}: {
  collections: Collection[]
  searchQuery?: string
}) {
  const q = searchQuery.toLowerCase().trim()
  const [sort, setSort] = useState<SortMode>('trending')
  const [trust, setTrust] = useState<TrustFilter>('default')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ atStart: true, atEnd: false })

  const baseFiltered = useMemo(() => {
    let list = collections.filter((c) => matchesTrust(c, trust))
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.slug.includes(q) ||
          c.description.toLowerCase().includes(q) ||
          (c.category || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [collections, trust, q])

  const sorted = useMemo(() => sortCollections(baseFiltered, sort), [baseFiltered, sort])
  const rail = useMemo(() => sorted.slice(0, 18), [sorted])

  const updateScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const left = el.scrollLeft
    setScroll({
      atStart: left <= 4,
      atEnd: max <= 4 || left >= max - 4,
    })
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    updateScroll()
    el.addEventListener('scroll', updateScroll, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScroll) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScroll)
      ro?.disconnect()
    }
  }, [updateScroll, rail.length, sort, trust])

  useEffect(() => {
    scrollerRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }, [sort, trust, q])

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>(':scope > *')
    const step = card ? card.offsetWidth + 14 : 300
    el.scrollBy({ left: dir * step * 2, behavior: 'smooth' })
  }

  const viewAllTo = q
    ? `/collections?q=${encodeURIComponent(q)}`
    : '/collections'

  return (
    <section aria-labelledby="discover-heading" className="relative">
      <div className="flex flex-col gap-3 mb-3 sm:mb-4">
        {/* Title row — tight, no fluff copy */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <AnimatedIconBadge tone="default" className="w-8 h-8">
              <AnimatedCompass className="text-hood" size="md" />
            </AnimatedIconBadge>
            <h2
              id="discover-heading"
              className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight truncate"
            >
              {q ? `Results for “${q}”` : 'Discover'}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                className="market-icon-btn"
                aria-label="Scroll Discover left"
                disabled={scroll.atStart || rail.length === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                className="market-icon-btn"
                aria-label="Scroll Discover right"
                disabled={scroll.atEnd || rail.length === 0}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <Link
              to={viewAllTo}
              className={clsx(
                'inline-flex items-center gap-1 h-8 px-3 rounded-full',
                'text-xs sm:text-sm font-bold text-hood',
                'bg-hood-muted/60 hover:bg-hood-muted border border-hood/15',
                'transition-colors'
              )}
            >
              View all
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Sort + Verified / YOLO */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex p-0.5 rounded-xl border border-edge bg-surface-2/80"
            role="tablist"
            aria-label="Discover sort"
          >
            {SORTS.map((s) => {
              const active = sort === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSort(s.id)}
                  className={clsx(
                    'inline-flex items-center gap-1 h-8 px-2.5 sm:px-3 rounded-[10px] text-xs sm:text-sm font-semibold transition-all cursor-pointer',
                    active
                      ? 'bg-surface text-ink shadow-sm border border-edge'
                      : 'text-ink-3 hover:text-ink border border-transparent'
                  )}
                >
                  {s.id === 'trending' && (
                    <AnimatedFlame
                      size="sm"
                      className={active ? 'text-hood' : 'text-ink-3'}
                      paused={!active}
                    />
                  )}
                  {s.id === 'volume' && (
                    <TrendingUp
                      className={clsx('w-3.5 h-3.5', active ? 'text-hood' : 'text-ink-3')}
                    />
                  )}
                  {s.id === 'floor' && (
                    <LayoutGrid
                      className={clsx('w-3.5 h-3.5', active ? 'text-hood' : 'text-ink-3')}
                    />
                  )}
                  {s.id === 'listed' && (
                    <BadgeCheck
                      className={clsx('w-3.5 h-3.5', active ? 'text-hood' : 'text-ink-3')}
                    />
                  )}
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              )
            })}
          </div>

          <div className="h-6 w-px bg-[var(--color-border)] hidden sm:block" />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTrust((t) => (t === 'verified' ? 'default' : 'verified'))}
              className={clsx(
                'h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer border inline-flex items-center gap-1',
                trust === 'verified'
                  ? 'bg-hood text-[var(--color-on-hood,#0b0e11)] border-hood'
                  : 'bg-surface border-edge text-ink-2 hover:border-hood/40 hover:text-ink'
              )}
            >
              <BadgeCheck className="w-3.5 h-3.5" />
              Verified
            </button>
            <button
              type="button"
              onClick={() => setTrust((t) => (t === 'yolo' ? 'default' : 'yolo'))}
              className={clsx(
                'h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer border inline-flex items-center gap-1',
                trust === 'yolo'
                  ? 'bg-[var(--color-danger)] text-white border-[var(--color-danger)]'
                  : 'bg-surface border-edge text-ink-2 hover:border-[var(--color-danger)]/50 hover:text-[var(--color-danger)]'
              )}
              title="High risk & unverified collections"
            >
              <Skull className="w-3.5 h-3.5" />
              YOLO
            </button>
          </div>
        </div>
      </div>

      {rail.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-edge bg-surface-2/40">
          <EmptyState
            title={q || trust !== 'default' ? 'No collections match' : 'No collections yet'}
            description={
              trust === 'yolo'
                ? 'No high-risk collections in this view.'
                : trust === 'verified'
                  ? 'No verified collections match right now.'
                  : q
                    ? 'Try a different search.'
                    : 'Collections will appear here as the market loads.'
            }
            actionLabel="Browse collections"
            actionTo="/collections"
            icon={<AnimatedCompass size="lg" />}
          />
        </div>
      ) : (
        <div className="market-rail-fade -mx-2 px-2 sm:-mx-3 sm:px-3 lg:-mx-4 lg:px-4">
          <div
            ref={scrollerRef}
            className="market-rail hide-scrollbar items-stretch"
            role="list"
            aria-label="Discover collections"
          >
            {rail.map((c, i) => (
              <div key={c.id} role="listitem" className="snap-start">
                <FeaturedCollectionCard collection={c} rank={i + 1} />
              </div>
            ))}

            <Link
              to={viewAllTo}
              className={clsx(
                'snap-start shrink-0 flex flex-col items-center justify-center gap-2',
                'w-[140px] sm:w-[160px] min-h-[260px]',
                'rounded-2xl border border-dashed border-edge bg-surface-2/50',
                'text-ink-2 hover:text-hood hover:border-hood/40 hover:bg-hood-muted/30',
                'transition-colors duration-200'
              )}
            >
              <span className="w-10 h-10 rounded-full border border-edge bg-surface flex items-center justify-center">
                <ArrowRight className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold">See all</span>
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}
