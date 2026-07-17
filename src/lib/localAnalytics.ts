/**
 * Browser-local analytics when Fly indexer is not configured.
 * Stores visits/sessions in localStorage so admin panel always has data.
 */
import type { AnalyticsDashboard } from './indexerApi'

const VISITS_KEY = 'openhood-local-visits-v1'
const USERS_KEY = 'openhood-local-users-v1'
const SESSION_KEY = 'openhood-sid-v1'
const MAX_VISITS = 2000

export type LocalVisit = {
  id: string
  at: string
  ts: number
  path: string
  wallet?: string | null
  device?: string
  locale?: string
  language?: string
  timezone?: string
  countryCode?: string | null
  screen?: string
  theme?: string
  referrer?: string | null
  geo?: {
    country?: string | null
    countryCode?: string | null
    region?: string | null
    city?: string | null
    timezone?: string | null
  }
  sessionId: string
  connected?: boolean
}

type LocalUser = {
  id: string
  kind: string
  wallet?: string | null
  visits: number
  firstSeen: string
  lastSeen: string
  lastPath?: string
  lastGeo?: LocalVisit['geo']
  locale?: string
  timezone?: string
  topCountry?: string
  topDevice?: string
  countries: Record<string, number>
  devices: Record<string, number>
  sessionId?: string
}

function sessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY)
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return `s_${Date.now()}`
  }
}

function readVisits(): LocalVisit[] {
  try {
    const raw = localStorage.getItem(VISITS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as LocalVisit[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeVisits(list: LocalVisit[]) {
  try {
    localStorage.setItem(VISITS_KEY, JSON.stringify(list.slice(-MAX_VISITS)))
  } catch {
    /* quota */
  }
}

function readUsers(): Map<string, LocalUser> {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (!raw) return new Map()
    const obj = JSON.parse(raw) as Record<string, LocalUser>
    return new Map(Object.entries(obj || {}))
  } catch {
    return new Map()
  }
}

function writeUsers(map: Map<string, LocalUser>) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(Object.fromEntries(map)))
  } catch {
    /* quota */
  }
}

function localeBits() {
  let locale = 'en'
  let language = 'en'
  let timezone = 'UTC'
  try {
    locale = navigator.language || 'en'
    language = locale.split('-')[0] || 'en'
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    /* ignore */
  }
  const parts = locale.split('-')
  const countryCode =
    parts.length > 1 ? parts[parts.length - 1].toUpperCase() : null
  return { locale, language, timezone, countryCode }
}

function deviceLabel() {
  try {
    const ua = navigator.userAgent
    if (/Mobi|Android|iPhone/i.test(ua)) {
      if (/iPhone|iPad/i.test(ua)) return 'iOS'
      if (/Android/i.test(ua)) return 'Android'
      return 'Mobile'
    }
    if (/Edg\//i.test(ua)) return 'Edge'
    if (/Chrome\//i.test(ua)) return 'Chrome'
    if (/Firefox\//i.test(ua)) return 'Firefox'
    if (/Safari\//i.test(ua)) return 'Safari'
    return 'Desktop'
  } catch {
    return 'unknown'
  }
}

/** Country name from ISO code (best-effort, small map) */
const CC: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  TR: 'Turkey',
  NL: 'Netherlands',
  JP: 'Japan',
  KR: 'South Korea',
  IN: 'India',
  BR: 'Brazil',
  MX: 'Mexico',
  ES: 'Spain',
  IT: 'Italy',
  SE: 'Sweden',
  NO: 'Norway',
  PL: 'Poland',
  UA: 'Ukraine',
  RU: 'Russia',
  CN: 'China',
  SG: 'Singapore',
  AE: 'UAE',
  SA: 'Saudi Arabia',
  NG: 'Nigeria',
  ZA: 'South Africa',
  AR: 'Argentina',
  ID: 'Indonesia',
  PH: 'Philippines',
  VN: 'Vietnam',
  TH: 'Thailand',
  MY: 'Malaysia',
  PT: 'Portugal',
  IE: 'Ireland',
  CH: 'Switzerland',
  AT: 'Austria',
  BE: 'Belgium',
  CZ: 'Czechia',
  RO: 'Romania',
  HU: 'Hungary',
  GR: 'Greece',
  IL: 'Israel',
  NZ: 'New Zealand',
  LO: 'Local',
}

export function recordLocalVisit(input: {
  path: string
  page?: string
  wallet?: string | null
  theme?: string
}): void {
  if (typeof window === 'undefined') return
  const now = Date.now()
  const sid = sessionId()
  const { locale, language, timezone, countryCode } = localeBits()
  const device = deviceLabel()
  const country =
    countryCode && CC[countryCode]
      ? CC[countryCode]
      : countryCode
        ? countryCode
        : timezone.includes('/')
          ? timezone.split('/')[0].replace(/_/g, ' ')
          : 'Unknown'

  const visit: LocalVisit = {
    id: `lv_${now}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date(now).toISOString(),
    ts: now,
    path: input.path || '/',
    wallet: input.wallet || null,
    device,
    locale,
    language,
    timezone,
    countryCode,
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    theme: input.theme,
    referrer: document.referrer || null,
    sessionId: sid,
    connected: Boolean(input.wallet),
    geo: {
      country,
      countryCode,
      region: timezone.includes('/') ? timezone.split('/')[1]?.replace(/_/g, ' ') : null,
      city: timezone.includes('/') ? timezone.split('/').pop()?.replace(/_/g, ' ') : null,
      timezone,
    },
  }

  // Dedupe same path within 8s
  const visits = readVisits()
  const last = visits[visits.length - 1]
  if (last && last.path === visit.path && now - last.ts < 8000) return
  visits.push(visit)
  writeVisits(visits)

  const users = readUsers()
  const uid = (input.wallet || sid).toLowerCase()
  const prev = users.get(uid) || {
    id: uid,
    kind: input.wallet ? 'wallet' : 'session',
    wallet: input.wallet || null,
    visits: 0,
    firstSeen: visit.at,
    lastSeen: visit.at,
    countries: {},
    devices: {},
    sessionId: sid,
  }
  prev.lastSeen = visit.at
  prev.visits += 1
  prev.lastPath = visit.path
  prev.lastGeo = visit.geo
  prev.locale = locale
  prev.timezone = timezone
  prev.sessionId = sid
  if (input.wallet) {
    prev.wallet = input.wallet
    prev.kind = 'wallet'
  }
  const ck = country || 'Unknown'
  prev.countries[ck] = (prev.countries[ck] || 0) + 1
  prev.devices[device] = (prev.devices[device] || 0) + 1
  prev.topCountry = Object.entries(prev.countries).sort((a, b) => b[1] - a[1])[0]?.[0]
  prev.topDevice = Object.entries(prev.devices).sort((a, b) => b[1] - a[1])[0]?.[0]
  users.set(uid, prev)
  writeUsers(users)
}

function dayKey(ts: number) {
  return new Date(ts).toISOString().slice(0, 10)
}

/**
 * Build AnalyticsDashboard shape from localStorage (+ optional market patch).
 */
export function buildLocalDashboard(market?: {
  collectionsIndexed?: number
  listedTotal?: number
  activityTotal?: number
  offersTotal?: number
  volume24h?: number
  volumeTotal?: number
  lastSyncs?: AnalyticsDashboard['dataCollection']['lastSyncs']
  openSeaLive?: boolean
  hasApiKey?: boolean
}): AnalyticsDashboard {
  const visits = readVisits()
  const users = readUsers()
  const now = Date.now()
  const dayMs = 86_400_000
  const last24 = visits.filter((v) => now - v.ts < dayMs)
  const last7 = visits.filter((v) => now - v.ts < dayMs * 7)

  const byCountry: Record<string, number> = {}
  const byCity: Record<string, number> = {}
  const byPath: Record<string, number> = {}
  const byDevice: Record<string, number> = {}
  for (const v of last7) {
    const c = v.geo?.country || 'Unknown'
    const city = [v.geo?.city, v.geo?.region].filter(Boolean).join(', ') || c
    byCountry[c] = (byCountry[c] || 0) + 1
    byCity[city] = (byCity[city] || 0) + 1
    byPath[v.path] = (byPath[v.path] || 0) + 1
    byDevice[v.device || 'unknown'] = (byDevice[v.device || 'unknown'] || 0) + 1
  }

  const daily: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    daily[dayKey(now - i * dayMs)] = 0
  }
  for (const v of last7) {
    const k = dayKey(v.ts)
    if (daily[k] != null) daily[k]++
  }

  const userList = [...users.values()]
    .sort(
      (a, b) =>
        new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    )
    .slice(0, 100)

  const activeToday = userList.filter(
    (u) => now - new Date(u.lastSeen).getTime() < dayMs
  ).length

  return {
    generatedAt: new Date().toISOString(),
    server: {
      startedAt: undefined,
      lastFullSyncAt: null,
      lastError: null,
      syncCount: 0,
      collectionCount: market?.collectionsIndexed ?? 0,
      listedTotal: market?.listedTotal ?? 0,
      busy: false,
      hasOpenSeaKey: market?.hasApiKey,
      slugs: [],
      uptimeSec: undefined,
      memoryMb: undefined,
      node: 'browser-local',
    },
    visits: {
      total: visits.length,
      last24h: last24.length,
      last7d: last7.length,
      uniqueSessions7d: new Set(last7.map((v) => v.sessionId)).size,
      withWallet7d: last7.filter((v) => v.wallet).length,
      byDay: Object.entries(daily).map(([date, count]) => ({ date, count })),
      byHour: [],
      topPaths: Object.entries(byPath)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      topCountries: Object.entries(byCountry)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      topCities: Object.entries(byCity)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 25),
      byDevice: Object.entries(byDevice)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      recent: [...visits]
        .slice(-80)
        .reverse()
        .map((v) => ({
          id: v.id,
          at: v.at,
          path: v.path,
          wallet: v.wallet,
          device: v.device,
          locale: v.locale,
          timezone: v.timezone,
          geo: v.geo,
          connected: v.connected,
          referrer: v.referrer,
        })),
    },
    users: {
      total: users.size,
      wallets: userList.filter((u) => u.wallet).length,
      sessions: users.size,
      activeToday,
      recent: userList.map((u) => ({
        id: u.id,
        kind: u.kind,
        wallet: u.wallet,
        visits: u.visits,
        firstSeen: u.firstSeen,
        lastSeen: u.lastSeen,
        lastPath: u.lastPath,
        lastGeo: u.lastGeo,
        locale: u.locale,
        timezone: u.timezone,
        topCountry: u.topCountry,
        topDevice: u.topDevice,
      })),
    },
    dataCollection: {
      collectionsIndexed: market?.collectionsIndexed ?? 0,
      listedTotal: market?.listedTotal ?? 0,
      activityTotal: market?.activityTotal ?? 0,
      offersTotal: market?.offersTotal ?? 0,
      volume24h: market?.volume24h ?? 0,
      volumeTotal: market?.volumeTotal ?? 0,
      lastSyncs: market?.lastSyncs ?? [],
    },
  }
}

export function localVisitCount(): number {
  return readVisits().length
}
