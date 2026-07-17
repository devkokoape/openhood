/**
 * OpenHood Admin — market intelligence, server status, visits/locations, users, data collection.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Database,
  FlaskConical,
  Globe2,
  Info,
  MapPin,
  RefreshCw,
  Server,
  ShieldAlert,
  Skull,
  Users,
  Eye,
  Wallet,
} from 'lucide-react'
import { useMarketplace } from '../context/MarketplaceContext'
import { formatPrice, timeAgo } from '../data/mockData'
import {
  fetchAnalyticsDashboard,
  fetchIndexerStatus,
  hasIndexerUrl,
  indexerUrl,
  type AnalyticsDashboard,
} from '../lib/indexerApi'
import { RiskBadge } from '../components/nft/RiskBadge'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import type { CollectionRisk, IndexerProblemSeverity } from '../types'
import clsx from 'clsx'

type RiskFilter = 'all' | CollectionRisk
type AdminTab =
  | 'overview'
  | 'visits'
  | 'users'
  | 'data'
  | 'risk'

const severityTone: Record<
  IndexerProblemSeverity,
  'orange' | 'muted' | 'blue' | 'green'
> = {
  critical: 'orange',
  warning: 'orange',
  info: 'blue',
}

function formatUptime(sec?: number) {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function shortWallet(a?: string | null) {
  if (!a || a.length < 12) return a || '—'
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function BarRow({
  label,
  count,
  max,
  accent,
}: {
  label: string
  count: number
  max: number
  accent?: boolean
}) {
  const pct = max > 0 ? Math.max(2, (count / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-[7.5rem] sm:w-40 truncate text-ink-2 font-medium" title={label}>
        {label}
      </div>
      <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden min-w-0">
        <div
          className={clsx('h-full rounded-full', accent ? 'bg-hood' : 'bg-hood/60')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-10 text-right tabular-nums font-bold text-ink shrink-0">{count}</div>
    </div>
  )
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
    openSeaStatus,
  } = useMarketplace()

  const [tab, setTab] = useState<AdminTab>('overview')
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<
    'all' | IndexerProblemSeverity
  >('all')
  const [q, setQ] = useState('')
  const [dash, setDash] = useState<AnalyticsDashboard | null>(null)
  const [dashError, setDashError] = useState<string | null>(null)
  const [dashLoading, setDashLoading] = useState(false)
  const [flyStatus, setFlyStatus] = useState<{
    ok: boolean
    collectionCount?: number
    listedTotal?: number
    lastFullSyncAt?: string | null
    busy?: boolean
    error?: string
    uptimeSec?: number
    memoryMb?: number
  } | null>(null)

  const loadDashboard = useCallback(async () => {
    if (!hasIndexerUrl()) {
      setDash(null)
      setDashError(null)
      return
    }
    setDashLoading(true)
    setDashError(null)
    try {
      const [d, s] = await Promise.all([
        fetchAnalyticsDashboard(),
        fetchIndexerStatus(),
      ])
      if (d) setDash(d)
      else setDashError('Dashboard unreachable — is the Fly indexer running?')
      if (s) setFlyStatus({ ...s, ok: true })
      else setFlyStatus({ ok: false, error: 'Unreachable' })
    } catch {
      setDashError('Failed to load analytics')
      setFlyStatus({ ok: false, error: 'Error' })
    } finally {
      setDashLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
    if (!hasIndexerUrl()) return
    const id = window.setInterval(() => void loadDashboard(), 30_000)
    return () => window.clearInterval(id)
  }, [loadDashboard])

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

  const tabs: { id: AdminTab; label: string; icon: typeof Database }[] = [
    { id: 'overview', label: 'Overview', icon: Server },
    { id: 'visits', label: 'Visits & location', icon: MapPin },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'data', label: 'Data collection', icon: Database },
    { id: 'risk', label: 'Risk & problems', icon: ShieldAlert },
  ]

  const maxCountry = dash?.visits.topCountries[0]?.count || 1
  const maxCity = dash?.visits.topCities[0]?.count || 1
  const maxPath = dash?.visits.topPaths[0]?.count || 1
  const maxDay = Math.max(1, ...(dash?.visits.byDay.map((d) => d.count) || [1]))

  return (
    <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-5 sm:py-6 animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-hood text-xs font-bold uppercase tracking-wide mb-1">
            <Database className="w-3.5 h-3.5" />
            Admin · Marketplace intelligence
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
            Control center
          </h1>
          <p className="text-sm text-ink-2 mt-1 max-w-2xl leading-relaxed">
            Server status, visit locations, user stats, and OpenSea data collection for OpenHood.
            Verified = OpenSea + ≥{verifiedMinVolumeEth} ETH total volume.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="text-xs text-ink-3 tabular-nums">
            {indexerLastScanAt
              ? `Chain scan ${timeAgo(indexerLastScanAt)}`
              : 'Chain not scanned'}
            {mainnetTokenCount > 0 && (
              <span className="ml-2">· {mainnetTokenCount} ERC-721</span>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={dashLoading}
            onClick={() => void loadDashboard()}
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', dashLoading && 'animate-spin')} />
            Refresh stats
          </Button>
          <Button
            size="sm"
            variant="outline"
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

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto hide-scrollbar border-b border-edge pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-hood text-ink'
                : 'border-transparent text-ink-3 hover:text-ink'
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {!hasIndexerUrl() && (
        <div className="rounded-xl border border-edge bg-surface-2/60 px-4 py-3 text-sm text-ink-2">
          <strong className="text-ink">Indexer not configured.</strong> Visits, locations, and
          server stats need Fly. Set <code className="text-hood">VITE_INDEXER_URL</code> after{' '}
          <code className="text-ink">fly deploy</code> (see <code className="text-ink">server/README.md</code>
          ). Risk tables below still work from the browser.
        </div>
      )}

      {dashError && hasIndexerUrl() && (
        <div className="rounded-xl border border-[rgba(255,80,0,0.35)] bg-[rgba(255,80,0,0.08)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {dashError}
        </div>
      )}

      {indexerError && (
        <div className="rounded-xl border border-[rgba(255,80,0,0.35)] bg-[rgba(255,80,0,0.08)] px-4 py-3 text-sm text-[var(--color-danger)]">
          Chain indexer: {indexerError}
        </div>
      )}

      {/* —— OVERVIEW —— */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-edge bg-surface-2/70 p-4">
              <div className="flex items-center gap-2 text-ink-3 text-xs font-bold uppercase">
                <Server className="w-3.5 h-3.5 text-hood" /> Server
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge tone={hasIndexerUrl() && flyStatus?.ok ? 'green' : 'muted'}>
                  {hasIndexerUrl()
                    ? flyStatus?.ok
                      ? 'online'
                      : 'offline'
                    : 'not set'}
                </Badge>
                {flyStatus?.busy && <Badge tone="orange">syncing</Badge>}
              </div>
              <div className="mt-2 text-xs text-ink-2 space-y-1">
                <div className="truncate font-mono text-[11px]">
                  {hasIndexerUrl() ? indexerUrl() : '—'}
                </div>
                <div>
                  Uptime{' '}
                  <span className="font-semibold text-ink">
                    {formatUptime(dash?.server.uptimeSec ?? flyStatus?.uptimeSec)}
                  </span>
                  {(dash?.server.memoryMb ?? flyStatus?.memoryMb) != null && (
                    <>
                      {' '}
                      · RAM{' '}
                      <span className="font-semibold text-ink">
                        {dash?.server.memoryMb ?? flyStatus?.memoryMb} MB
                      </span>
                    </>
                  )}
                </div>
                <div>
                  OpenSea key:{' '}
                  <span className="font-semibold text-ink">
                    {dash?.server.hasOpenSeaKey ? 'yes' : 'unknown / no'}
                  </span>
                </div>
                <div>
                  Last market sync:{' '}
                  <span className="font-semibold text-ink">
                    {dash?.server.lastFullSyncAt
                      ? timeAgo(dash.server.lastFullSyncAt)
                      : flyStatus?.lastFullSyncAt
                        ? timeAgo(flyStatus.lastFullSyncAt)
                        : '—'}
                  </span>
                </div>
                {dash?.server.lastError && (
                  <div className="text-[var(--color-danger)] text-[11px] line-clamp-2">
                    {dash.server.lastError}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-edge bg-surface-2/70 p-4">
              <div className="flex items-center gap-2 text-ink-3 text-xs font-bold uppercase">
                <Eye className="w-3.5 h-3.5 text-hood" /> Visits
              </div>
              <div className="mt-2 text-2xl font-extrabold text-ink tabular-nums">
                {dash ? dash.visits.last24h.toLocaleString() : '—'}
              </div>
              <div className="text-xs text-ink-3">last 24 hours</div>
              <div className="mt-2 text-xs text-ink-2 space-y-0.5">
                <div>
                  7d:{' '}
                  <span className="font-semibold text-ink">
                    {dash?.visits.last7d.toLocaleString() ?? '—'}
                  </span>
                </div>
                <div>
                  All-time:{' '}
                  <span className="font-semibold text-ink">
                    {dash?.visits.total.toLocaleString() ?? '—'}
                  </span>
                </div>
                <div>
                  Sessions 7d:{' '}
                  <span className="font-semibold text-ink">
                    {dash?.visits.uniqueSessions7d.toLocaleString() ?? '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-edge bg-surface-2/70 p-4">
              <div className="flex items-center gap-2 text-ink-3 text-xs font-bold uppercase">
                <Users className="w-3.5 h-3.5 text-hood" /> Users
              </div>
              <div className="mt-2 text-2xl font-extrabold text-ink tabular-nums">
                {dash ? dash.users.activeToday.toLocaleString() : '—'}
              </div>
              <div className="text-xs text-ink-3">active today</div>
              <div className="mt-2 text-xs text-ink-2 space-y-0.5">
                <div>
                  Profiles:{' '}
                  <span className="font-semibold text-ink">
                    {dash?.users.total.toLocaleString() ?? '—'}
                  </span>
                </div>
                <div>
                  Wallets:{' '}
                  <span className="font-semibold text-ink">
                    {dash?.users.wallets.toLocaleString() ?? '—'}
                  </span>
                </div>
                <div>
                  Visits w/ wallet 7d:{' '}
                  <span className="font-semibold text-ink">
                    {dash?.visits.withWallet7d.toLocaleString() ?? '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-edge bg-surface-2/70 p-4">
              <div className="flex items-center gap-2 text-ink-3 text-xs font-bold uppercase">
                <Database className="w-3.5 h-3.5 text-hood" /> Market data
              </div>
              <div className="mt-2 text-2xl font-extrabold text-ink tabular-nums">
                {dash?.dataCollection.listedTotal.toLocaleString() ??
                  flyStatus?.listedTotal?.toLocaleString() ??
                  '—'}
              </div>
              <div className="text-xs text-ink-3">listed NFTs indexed</div>
              <div className="mt-2 text-xs text-ink-2 space-y-0.5">
                <div>
                  Collections:{' '}
                  <span className="font-semibold text-ink">
                    {dash?.dataCollection.collectionsIndexed ??
                      flyStatus?.collectionCount ??
                      '—'}
                  </span>
                </div>
                <div>
                  Events cached:{' '}
                  <span className="font-semibold text-ink">
                    {dash?.dataCollection.activityTotal.toLocaleString() ?? '—'}
                  </span>
                </div>
                <div>
                  Offers cached:{' '}
                  <span className="font-semibold text-ink">
                    {dash?.dataCollection.offersTotal.toLocaleString() ?? '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Client OpenSea poll */}
          <div className="rounded-2xl border border-edge bg-surface px-4 py-3 flex flex-wrap items-center gap-3 text-xs text-ink-2">
            <Activity className="w-4 h-4 text-hood" />
            <span>
              Browser OpenSea live:{' '}
              <Badge tone={openSeaStatus.live ? 'green' : 'muted'}>
                {openSeaStatus.live ? 'live' : 'idle'}
              </Badge>
            </span>
            {openSeaStatus.lastOkAt && (
              <span>last tick {timeAgo(new Date(openSeaStatus.lastOkAt).toISOString())}</span>
            )}
            <span>
              API key: {openSeaStatus.hasApiKey ? 'yes' : 'no'} · proxy:{' '}
              {openSeaStatus.usingProxy ? 'dev' : 'direct'}
            </span>
          </div>

          {/* 7d visits bars */}
          {dash && (
            <div className="rounded-2xl border border-edge bg-surface p-4">
              <h3 className="text-sm font-extrabold text-ink mb-3">Visits · last 7 days</h3>
              <div className="flex items-end gap-1.5 h-28">
                {dash.visits.byDay.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-md bg-hood/80 min-h-[2px]"
                        style={{ height: `${(d.count / maxDay) * 100}%` }}
                        title={`${d.date}: ${d.count}`}
                      />
                    </div>
                    <div className="text-[9px] text-ink-3 tabular-nums">
                      {d.date.slice(5)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top locations preview */}
          {dash && dash.visits.topCountries.length > 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-edge bg-surface p-4 space-y-2">
                <h3 className="text-sm font-extrabold text-ink flex items-center gap-1.5">
                  <Globe2 className="w-4 h-4 text-hood" /> Top countries (7d)
                </h3>
                {dash.visits.topCountries.slice(0, 8).map((c) => (
                  <BarRow
                    key={c.name}
                    label={c.name}
                    count={c.count}
                    max={maxCountry}
                    accent
                  />
                ))}
              </div>
              <div className="rounded-2xl border border-edge bg-surface p-4 space-y-2">
                <h3 className="text-sm font-extrabold text-ink flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-hood" /> Top cities (7d)
                </h3>
                {dash.visits.topCities.slice(0, 8).map((c) => (
                  <BarRow key={c.name} label={c.name} count={c.count} max={maxCity} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* —— VISITS —— */}
      {tab === 'visits' && (
        <div className="space-y-4">
          {!dash ? (
            <EmptyIndexer hint="Visit tracking requires the Fly indexer. Users' page views, country/city (IP + locale), and devices appear here." />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                {[
                  { label: '24h visits', value: dash.visits.last24h },
                  { label: '7d visits', value: dash.visits.last7d },
                  { label: 'Sessions 7d', value: dash.visits.uniqueSessions7d },
                  { label: 'With wallet', value: dash.visits.withWallet7d },
                  { label: 'All-time', value: dash.visits.total },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="rounded-xl border border-edge bg-surface-2/60 px-3 py-3"
                  >
                    <div className="text-[10px] uppercase text-ink-3 font-bold">{k.label}</div>
                    <div className="text-lg font-extrabold tabular-nums text-ink">
                      {k.value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-edge bg-surface p-4 space-y-2">
                  <h3 className="text-sm font-extrabold text-ink">Countries</h3>
                  {dash.visits.topCountries.map((c) => (
                    <BarRow
                      key={c.name}
                      label={c.name}
                      count={c.count}
                      max={maxCountry}
                      accent
                    />
                  ))}
                  {dash.visits.topCountries.length === 0 && (
                    <p className="text-xs text-ink-3">No location data yet — browse the site.</p>
                  )}
                </div>
                <div className="rounded-2xl border border-edge bg-surface p-4 space-y-2">
                  <h3 className="text-sm font-extrabold text-ink">Cities / regions</h3>
                  {dash.visits.topCities.map((c) => (
                    <BarRow key={c.name} label={c.name} count={c.count} max={maxCity} />
                  ))}
                </div>
                <div className="rounded-2xl border border-edge bg-surface p-4 space-y-2">
                  <h3 className="text-sm font-extrabold text-ink">Top pages</h3>
                  {dash.visits.topPaths.map((p) => (
                    <BarRow key={p.path} label={p.path} count={p.count} max={maxPath} />
                  ))}
                  <h3 className="text-sm font-extrabold text-ink pt-3">Devices</h3>
                  {dash.visits.byDevice.map((d) => (
                    <div
                      key={d.name}
                      className="flex justify-between text-xs text-ink-2"
                    >
                      <span>{d.name}</span>
                      <span className="font-bold tabular-nums text-ink">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-edge bg-surface overflow-hidden">
                <div className="px-4 py-3 border-b border-edge bg-surface-2/50">
                  <h3 className="text-sm font-extrabold text-ink">Recent visits</h3>
                  <p className="text-[11px] text-ink-3">
                    IP hashed on server · city/country from IP lookup + browser locale
                  </p>
                </div>
                <div className="overflow-x-auto table-scroll max-h-[28rem] overflow-y-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead className="sticky top-0 bg-surface-2 z-10">
                      <tr className="text-left text-[10px] uppercase text-ink-3 border-b border-edge">
                        <th className="px-3 py-2">When</th>
                        <th className="px-3 py-2">Location</th>
                        <th className="px-3 py-2">Path</th>
                        <th className="px-3 py-2">Device</th>
                        <th className="px-3 py-2">Wallet</th>
                        <th className="px-3 py-2">Locale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.visits.recent.map((v) => (
                        <tr
                          key={v.id}
                          className="border-b border-edge last:border-0 hover:bg-surface-2/50"
                        >
                          <td className="px-3 py-2 text-xs text-ink-2 whitespace-nowrap">
                            {timeAgo(v.at)}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <div className="font-semibold text-ink">
                              {[v.geo?.city, v.geo?.region, v.geo?.country]
                                .filter(Boolean)
                                .join(', ') || 'Unknown'}
                            </div>
                            <div className="text-[10px] text-ink-3">
                              {v.geo?.countryCode || '—'} · {v.timezone || v.geo?.timezone || '—'}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-ink-2 max-w-[12rem] truncate">
                            {v.path}
                          </td>
                          <td className="px-3 py-2 text-xs text-ink-2">{v.device || '—'}</td>
                          <td className="px-3 py-2 text-xs font-mono">
                            {v.wallet ? (
                              <Link
                                to={`/profile/${v.wallet}`}
                                className="text-hood hover:underline"
                              >
                                {shortWallet(v.wallet)}
                              </Link>
                            ) : (
                              <span className="text-ink-3">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-ink-3">{v.locale || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* —— USERS —— */}
      {tab === 'users' && (
        <div className="space-y-4">
          {!dash ? (
            <EmptyIndexer hint="User profiles (sessions + wallets) are built from visit events on the Fly indexer." />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {[
                  { label: 'Users / sessions', value: dash.users.total, icon: Users },
                  { label: 'Wallets seen', value: dash.users.wallets, icon: Wallet },
                  { label: 'Active today', value: dash.users.activeToday, icon: Activity },
                  {
                    label: 'Sessions tracked',
                    value: dash.users.sessions,
                    icon: Eye,
                  },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="rounded-xl border border-edge bg-surface-2/60 px-3 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase text-ink-3 font-bold">
                        {k.label}
                      </span>
                      <k.icon className="w-3.5 h-3.5 text-hood" />
                    </div>
                    <div className="text-lg font-extrabold tabular-nums text-ink mt-1">
                      {k.value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-edge bg-surface overflow-hidden">
                <div className="px-4 py-3 border-b border-edge bg-surface-2/50">
                  <h3 className="text-sm font-extrabold text-ink">Recent users</h3>
                  <p className="text-[11px] text-ink-3">
                    Anonymous session until wallet connects · location from last visit
                  </p>
                </div>
                <div className="overflow-x-auto table-scroll max-h-[32rem] overflow-y-auto">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead className="sticky top-0 bg-surface-2 z-10">
                      <tr className="text-left text-[10px] uppercase text-ink-3 border-b border-edge">
                        <th className="px-3 py-2">User</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2 text-right">Visits</th>
                        <th className="px-3 py-2">Location</th>
                        <th className="px-3 py-2">Last path</th>
                        <th className="px-3 py-2">Device</th>
                        <th className="px-3 py-2">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.users.recent.map((u) => (
                        <tr
                          key={u.id}
                          className="border-b border-edge last:border-0 hover:bg-surface-2/50"
                        >
                          <td className="px-3 py-2.5">
                            {u.wallet ? (
                              <Link
                                to={`/profile/${u.wallet}`}
                                className="font-mono text-xs text-hood hover:underline"
                              >
                                {shortWallet(u.wallet)}
                              </Link>
                            ) : (
                              <span className="font-mono text-[11px] text-ink-3">
                                {u.id.slice(0, 12)}…
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge tone={u.kind === 'wallet' ? 'green' : 'muted'}>
                              {u.kind}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                            {u.visits}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-ink-2">
                            {[u.lastGeo?.city, u.lastGeo?.country].filter(Boolean).join(', ') ||
                              u.topCountry ||
                              '—'}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-ink-3 max-w-[10rem] truncate">
                            {u.lastPath || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-ink-2">
                            {u.topDevice || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-ink-3 whitespace-nowrap">
                            {timeAgo(u.lastSeen)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* —— DATA COLLECTION —— */}
      {tab === 'data' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              {
                label: 'Server collections',
                value: dash?.dataCollection.collectionsIndexed ?? '—',
              },
              {
                label: 'Listed items',
                value: dash?.dataCollection.listedTotal?.toLocaleString() ?? '—',
              },
              {
                label: 'Activity events',
                value: dash?.dataCollection.activityTotal?.toLocaleString() ?? '—',
              },
              {
                label: 'Offers',
                value: dash?.dataCollection.offersTotal?.toLocaleString() ?? '—',
              },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-xl border border-edge bg-surface-2/60 px-3 py-3"
              >
                <div className="text-[10px] uppercase text-ink-3 font-bold">{k.label}</div>
                <div className="text-lg font-extrabold tabular-nums text-ink">{k.value}</div>
              </div>
            ))}
          </div>

          {dash?.dataCollection && (
            <div className="rounded-xl border border-edge bg-surface-2/40 px-4 py-3 text-xs text-ink-2">
              Indexed 24h volume:{' '}
              <span className="font-bold text-hood tabular-nums">
                {formatPrice(dash.dataCollection.volume24h)} ETH
              </span>
              {' · '}
              Total volume:{' '}
              <span className="font-bold text-ink tabular-nums">
                {formatPrice(dash.dataCollection.volumeTotal)} ETH
              </span>
              {' · '}
              Queue:{' '}
              <span className="font-mono text-ink">
                {(dash.server.slugs || []).slice(0, 6).join(', ')}
                {(dash.server.slugs?.length || 0) > 6 ? '…' : ''}
              </span>
            </div>
          )}

          <div className="rounded-2xl border border-edge bg-surface overflow-hidden">
            <div className="px-4 py-3 border-b border-edge bg-surface-2/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-ink">Collection sync log</h3>
                <p className="text-[11px] text-ink-3">
                  What the Fly crawler last stored (listings / activity / offers)
                </p>
              </div>
            </div>
            {!dash?.dataCollection.lastSyncs?.length ? (
              <div className="px-4 py-10 text-center text-sm text-ink-3">
                No server sync data yet. Deploy indexer with OPENSEA_API_KEY or open collections
                after VITE_INDEXER_URL is set.
              </div>
            ) : (
              <div className="overflow-x-auto table-scroll">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-ink-3 border-b border-edge bg-surface-2">
                      <th className="px-3 py-2">Collection</th>
                      <th className="px-3 py-2 text-right">Listed</th>
                      <th className="px-3 py-2 text-right">Events</th>
                      <th className="px-3 py-2 text-right">Offers</th>
                      <th className="px-3 py-2 text-right">Floor</th>
                      <th className="px-3 py-2 text-right">24h vol</th>
                      <th className="px-3 py-2">Synced</th>
                      <th className="px-3 py-2 text-right">ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dash.dataCollection.lastSyncs.map((c) => (
                      <tr
                        key={c.slug}
                        className="border-b border-edge last:border-0 hover:bg-surface-2/50"
                      >
                        <td className="px-3 py-2.5">
                          <Link
                            to={`/collection/${c.slug}`}
                            className="font-semibold text-ink hover:text-hood"
                          >
                            {c.name || c.slug}
                          </Link>
                          <div className="text-[10px] font-mono text-ink-3">{c.slug}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-hood">
                          {c.listedCount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {c.activityCount}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {c.offerCount}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatPrice(c.floorPrice || 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatPrice(c.volume24h || 0)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-3 whitespace-nowrap">
                          {c.syncedAt ? timeAgo(c.syncedAt) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-3 text-xs">
                          {c.syncMs ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* —— RISK (existing) —— */}
      {tab === 'risk' && (
        <div className="space-y-5">
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
                className="rounded-xl border border-edge bg-surface-2/70 px-3 py-3"
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
            <section className="rounded-2xl border border-edge bg-surface overflow-hidden min-w-0">
              <div className="px-3 sm:px-4 py-3 border-b border-edge bg-surface-2/50 flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
                <h2 className="text-sm font-extrabold text-ink">Indexed collections</h2>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {(
                    ['all', 'verified', 'high_risk', 'trash', 'demo'] as RiskFilter[]
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
                    placeholder="Search…"
                    className="h-8 px-2.5 rounded-lg bg-surface border border-edge text-xs text-ink w-full sm:w-40"
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
                  </tbody>
                </table>
              </div>
            </section>

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
                  </div>
                ) : (
                  problems.map((p) => (
                    <div key={p.id} className="px-3 sm:px-4 py-3 hover:bg-surface-2/40">
                      <div className="flex items-start gap-2">
                        <Badge tone={severityTone[p.severity]} className="shrink-0 mt-0.5">
                          {p.severity}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-ink leading-snug">
                            {p.title}
                          </div>
                          <p className="text-xs text-ink-2 mt-1 leading-relaxed">{p.detail}</p>
                          {p.collectionName && (
                            <div className="mt-1 text-[10px] text-hood font-semibold">
                              {p.collectionName}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-3 py-2.5 border-t border-edge bg-surface-2/40 text-[11px] text-ink-3">
                Verified volume:{' '}
                <span className="text-hood font-bold tabular-nums">
                  {formatPrice(t.volumeVerifiedEth)} ETH
                </span>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyIndexer({ hint }: { hint: string }) {
  return (
    <div className="rounded-2xl border border-edge bg-surface px-6 py-16 text-center">
      <Server className="w-8 h-8 text-ink-3 mx-auto mb-3" />
      <p className="text-ink font-semibold">Fly indexer required</p>
      <p className="text-sm text-ink-3 mt-2 max-w-md mx-auto leading-relaxed">{hint}</p>
      <p className="text-xs text-ink-3 mt-3 font-mono">
        VITE_INDEXER_URL=https://your-app.fly.dev
      </p>
    </div>
  )
}
