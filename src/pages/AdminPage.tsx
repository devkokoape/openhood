/**
 * OpenHood Admin — indexer analytics + problem detector.
 * Classifies Robinhood mainnet collections (verified ≥3 ETH OS volume vs high-risk / trash).
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BadgeCheck,
  Database,
  FlaskConical,
  Info,
  RefreshCw,
  ShieldAlert,
  Skull,
} from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { formatPrice, timeAgo } from '../data/mockData'
import { VERIFIED_MIN_VOLUME_ETH } from '../lib/indexer'
import { RiskBadge } from '../components/nft/RiskBadge'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import type { CollectionRisk, IndexerProblemSeverity } from '../types'
import clsx from 'clsx'

type RiskFilter = 'all' | CollectionRisk

const severityTone: Record<
  IndexerProblemSeverity,
  'orange' | 'muted' | 'blue' | 'green'
> = {
  critical: 'orange',
  warning: 'orange',
  info: 'blue',
}

export function AdminPage() {
  const {
    indexerReport,
    indexerLoading,
    indexerError,
    indexerLastScanAt,
    rescanIndexer,
    mainnetTokenCount,
    verifiedMinVolumeEth,
    collections,
  } = useMarketplace()

  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<
    'all' | IndexerProblemSeverity
  >('all')
  const [q, setQ] = useState('')

  const t = indexerReport.totals

  const filteredCols = useMemo(() => {
    let list = [...collections]
    if (riskFilter !== 'all') list = list.filter((c) => c.risk === riskFilter)
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(s) ||
          c.slug.includes(s) ||
          (c.contractAddress || '').toLowerCase().includes(s)
      )
    }
    return list.sort((a, b) => (b.volumeTotal || 0) - (a.volumeTotal || 0))
  }, [collections, riskFilter, q])

  const problems = useMemo(() => {
    let list = indexerReport.problems
    if (severityFilter !== 'all') {
      list = list.filter((p) => p.severity === severityFilter)
    }
    return list
  }, [indexerReport.problems, severityFilter])

  return (
    <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-5 sm:py-6 animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-hood text-xs font-bold uppercase tracking-wide mb-1">
            <Database className="w-3.5 h-3.5" />
            Indexer · Admin
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
            Market intelligence
          </h1>
          <p className="text-sm text-ink-2 mt-1 max-w-2xl leading-relaxed">
            Robinhood mainnet ERC-721 discovery (Blockscout) + OpenSea volume. Collections are{' '}
            <strong className="text-ink">verified</strong> only when OpenSea total volume ≥{' '}
            <strong className="text-hood">{verifiedMinVolumeEth} ETH</strong>. Everything else is{' '}
            <strong className="text-[var(--color-danger)]">high risk</strong> or{' '}
            <strong className="text-ink-3">trash</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="text-xs text-ink-3 tabular-nums">
            {indexerLastScanAt
              ? `Last scan ${timeAgo(indexerLastScanAt)}`
              : 'Not scanned yet'}
            {mainnetTokenCount > 0 && (
              <span className="ml-2">· {mainnetTokenCount} ERC-721 tokens</span>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={indexerLoading}
            onClick={() => void rescanIndexer()}
          >
            <RefreshCw
              className={clsx('w-3.5 h-3.5', indexerLoading && 'animate-spin')}
            />
            Rescan mainnet
          </Button>
        </div>
      </div>

      {indexerError && (
        <div className="rounded-xl border border-[rgba(255,80,0,0.35)] bg-[rgba(255,80,0,0.08)] px-4 py-3 text-sm text-[var(--color-danger)]">
          Indexer error: {indexerError}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          {
            label: 'Indexed',
            value: String(t.collections),
            icon: Database,
            tone: 'text-ink',
          },
          {
            label: 'Verified',
            value: String(t.verified),
            icon: BadgeCheck,
            tone: 'text-hood',
          },
          {
            label: 'High risk',
            value: String(t.highRisk),
            icon: ShieldAlert,
            tone: 'text-[var(--color-danger)]',
          },
          {
            label: 'Trash',
            value: String(t.trash),
            icon: Skull,
            tone: 'text-ink-3',
          },
          {
            label: 'Mainnet only',
            value: String(t.mainnetDiscovered),
            icon: FlaskConical,
            tone: 'text-[var(--color-bid)]',
          },
          {
            label: 'Problems',
            value: String(t.problems),
            icon: AlertTriangle,
            tone: t.problems > 0 ? 'text-[var(--color-danger)]' : 'text-ink',
          },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-edge bg-surface-2/70 px-3 py-3 relative overflow-hidden"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] uppercase tracking-wide text-ink-3 font-semibold">
                {k.label}
              </span>
              <k.icon className={clsx('w-3.5 h-3.5', k.tone)} />
            </div>
            <div className={clsx('text-xl font-extrabold tabular-nums mt-1', k.tone)}>
              {indexerLoading && !t.collections ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                k.value
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 sm:gap-5">
        {/* Collections table */}
        <section className="rounded-2xl border border-edge bg-surface overflow-hidden min-w-0">
          <div className="px-3 sm:px-4 py-3 border-b border-edge bg-surface-2/50 flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
            <h2 className="text-sm font-extrabold text-ink">Indexed collections</h2>
            <div className="flex flex-wrap gap-1.5 items-center">
              {(
                [
                  'all',
                  'verified',
                  'high_risk',
                  'trash',
                  'demo',
                ] as RiskFilter[]
              ).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRiskFilter(r)}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors',
                    riskFilter === r
                      ? 'bg-hood text-[#0b0e11]'
                      : 'bg-surface border border-edge text-ink-3 hover:text-ink'
                  )}
                >
                  {r === 'all' ? 'All' : r.replace('_', ' ')}
                </button>
              ))}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name / contract…"
                className="h-8 px-2.5 rounded-lg bg-surface border border-edge text-xs text-ink w-full sm:w-44"
              />
            </div>
          </div>

          <div className="overflow-x-auto table-scroll max-h-[min(32rem,60vh)] overflow-y-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="sticky top-0 bg-surface-2 z-10">
                <tr className="text-left text-[10px] uppercase tracking-wide text-ink-3 border-b border-edge">
                  <th className="px-3 py-2 font-semibold">Collection</th>
                  <th className="px-3 py-2 font-semibold">Risk</th>
                  <th className="px-3 py-2 font-semibold text-right">Total vol</th>
                  <th className="px-3 py-2 font-semibold text-right">Floor</th>
                  <th className="px-3 py-2 font-semibold text-right">Owners</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredCols.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-edge last:border-0 hover:bg-surface-2/60"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/collection/${c.slug}`}
                        className="flex items-center gap-2 min-w-0 group"
                      >
                        <img
                          src={c.image}
                          alt=""
                          className="w-8 h-8 rounded-lg object-cover shrink-0 ring-1 ring-edge"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-ink group-hover:text-hood truncate text-sm">
                            {c.name}
                          </div>
                          <div className="text-[10px] font-mono text-ink-3 truncate">
                            {c.contractAddress || c.slug}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <RiskBadge risk={c.risk} compact />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                      {formatPrice(c.volumeTotal)}{' '}
                      <span className="text-hood text-[10px]">ETH</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatPrice(c.floorPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">
                      {c.owners.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone="muted">{c.source || '—'}</Badge>
                    </td>
                  </tr>
                ))}
                {filteredCols.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-ink-3 text-sm">
                      No collections match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Problem detector */}
        <section className="rounded-2xl border border-edge bg-surface overflow-hidden min-w-0 flex flex-col max-h-[min(40rem,70vh)]">
          <div className="px-3 sm:px-4 py-3 border-b border-edge bg-surface-2/50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-[var(--color-danger)] shrink-0" />
              <h2 className="text-sm font-extrabold text-ink truncate">Problem detector</h2>
            </div>
            <div className="flex gap-0.5 shrink-0">
              {(['all', 'critical', 'warning', 'info'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverityFilter(s)}
                  className={clsx(
                    'px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer',
                    severityFilter === s
                      ? 'bg-hood text-[#0b0e11]'
                      : 'text-ink-3 hover:bg-surface-2'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[var(--color-border)]">
            {problems.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Info className="w-6 h-6 text-hood mx-auto mb-2" />
                <p className="text-sm font-semibold text-ink">No problems in this filter</p>
                <p className="text-xs text-ink-3 mt-1">
                  Indexer is healthy for selected severity.
                </p>
              </div>
            ) : (
              problems.map((p) => (
                <div key={p.id} className="px-3 sm:px-4 py-3 hover:bg-surface-2/40">
                  <div className="flex items-start gap-2">
                    <Badge tone={severityTone[p.severity]} className="shrink-0 mt-0.5">
                      {p.severity}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-ink leading-snug">{p.title}</div>
                      <p className="text-xs text-ink-2 mt-1 leading-relaxed">{p.detail}</p>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-ink-3 font-mono">
                        <span>{p.code}</span>
                        {p.collectionName && (
                          <Link
                            to={
                              collections.find((c) => c.id === p.collectionId)?.slug
                                ? `/collection/${collections.find((c) => c.id === p.collectionId)!.slug}`
                                : '/collections'
                            }
                            className="text-hood hover:underline font-sans font-semibold"
                          >
                            {p.collectionName}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-3 py-2.5 border-t border-edge bg-surface-2/40 text-[11px] text-ink-3 leading-relaxed">
            Policy: verified ⇔ OpenSea + ≥{VERIFIED_MIN_VOLUME_ETH} ETH lifetime volume. Mainnet
            ERC-721 without that bar → high risk / trash. Verified volume:{' '}
            <span className="text-hood font-bold tabular-nums">
              {formatPrice(t.volumeVerifiedEth)} ETH
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
