/**
 * Marketplace analytics on SQLite (visits, locations, users).
 */
import crypto from 'node:crypto'
import {
  dbGetUser,
  dbInsertVisit,
  dbListUsers,
  dbListVisits,
  dbStats,
  dbTrimVisits,
  dbUpsertUser,
  listCollectionSummariesSafe,
  metaGet,
  metaSet,
} from './db-analytics-bridge.js'

const MAX_VISITS = Number(process.env.MAX_VISITS || 8000)
const DEDUPE_MS = 25_000

/** @type {Map<string, any>} */
const geoCache = new Map()
/** rate limit: session+path → lastAt */
const dedupe = new Map()

export function loadAnalytics() {
  // SQLite already loaded via store/db; trim oversized history
  dbTrimVisits(MAX_VISITS)
  const s = dbStats()
  console.log(`[analytics] sqlite visits=${s.visits} users=${s.users}`)
}

export function saveAnalytics() {
  // write-through SQLite — checkpoint handled by store.saveToDisk
}

function hashIp(ip) {
  if (!ip) return null
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 16)
}

function clientIp(req) {
  const fly = req.headers['fly-client-ip']
  if (fly) return String(fly).trim()
  const xf = req.headers['x-forwarded-for']
  if (xf) return String(xf).split(',')[0].trim()
  const real = req.headers['x-real-ip']
  if (real) return String(real).trim()
  return req.socket?.remoteAddress || null
}

async function resolveGeo(ip, clientHints = {}) {
  if (clientHints.country || clientHints.city || clientHints.region) {
    return {
      country: clientHints.country || null,
      countryCode: clientHints.countryCode || null,
      region: clientHints.region || null,
      city: clientHints.city || null,
      timezone: clientHints.timezone || null,
      source: 'client',
    }
  }

  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.')) {
    return {
      country: 'Local',
      countryCode: 'LO',
      region: null,
      city: 'localhost',
      timezone: clientHints.timezone || null,
      source: 'local',
    }
  }

  if (geoCache.has(ip)) return geoCache.get(ip)

  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { accept: 'application/json', 'user-agent': 'openhood-indexer/1.0' },
      signal: AbortSignal.timeout(2500),
    })
    if (res.ok) {
      const j = await res.json()
      if (!j.error) {
        const geo = {
          country: j.country_name || null,
          countryCode: j.country_code || null,
          region: j.region || null,
          city: j.city || null,
          timezone: j.timezone || clientHints.timezone || null,
          source: 'ipapi',
        }
        geoCache.set(ip, geo)
        return geo
      }
    }
  } catch {
    /* ignore */
  }

  const fallback = {
    country: null,
    countryCode: null,
    region: null,
    city: null,
    timezone: clientHints.timezone || null,
    source: 'unknown',
  }
  geoCache.set(ip, fallback)
  return fallback
}

function uaBrief(ua) {
  if (!ua) return 'unknown'
  const s = String(ua)
  if (/Mobile|Android|iPhone/i.test(s)) {
    if (/iPhone|iPad/i.test(s)) return 'iOS'
    if (/Android/i.test(s)) return 'Android'
    return 'Mobile'
  }
  if (/Edg\//i.test(s)) return 'Edge'
  if (/Chrome\//i.test(s)) return 'Chrome'
  if (/Firefox\//i.test(s)) return 'Firefox'
  if (/Safari\//i.test(s)) return 'Safari'
  return 'Desktop'
}

export async function recordVisit(req, body = {}) {
  const ip = clientIp(req)
  const ipHash = hashIp(ip)
  const now = Date.now()
  const sessionId = String(body.sessionId || ipHash || 'anon').slice(0, 64)
  const path = String(body.path || '/').slice(0, 200)
  const dedupeKey = `${sessionId}|${path}`
  const last = dedupe.get(dedupeKey)
  if (last && now - last < DEDUPE_MS) {
    return { ok: true, deduped: true }
  }
  dedupe.set(dedupeKey, now)

  const geo = await resolveGeo(ip, {
    country: body.country,
    countryCode: body.countryCode,
    region: body.region,
    city: body.city,
    timezone: body.timezone,
  })

  const wallet = body.wallet
    ? String(body.wallet).toLowerCase().slice(0, 42)
    : null

  const visit = {
    id: `v_${now}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date(now).toISOString(),
    ts: now,
    path,
    page: body.page || path,
    referrer: body.referrer ? String(body.referrer).slice(0, 300) : null,
    sessionId,
    wallet,
    ipHash,
    geo: {
      country: geo.country,
      countryCode: geo.countryCode,
      region: geo.region,
      city: geo.city,
      timezone: geo.timezone || body.timezone || null,
    },
    locale: body.locale || null,
    language: body.language || null,
    timezone: body.timezone || geo.timezone || null,
    screen: body.screen || null,
    device: body.device || uaBrief(body.userAgent || req.headers['user-agent']),
    userAgent: uaBrief(body.userAgent || req.headers['user-agent']),
    theme: body.theme || null,
    connected: Boolean(wallet),
  }

  dbInsertVisit(visit)
  dbTrimVisits(MAX_VISITS)

  const totalVisits = (metaGet('analytics_totalVisits', 0) || 0) + 1
  metaSet('analytics_totalVisits', totalVisits)

  const uid = wallet || sessionId
  const prev = dbGetUser(uid) || {
    id: uid,
    kind: wallet ? 'wallet' : 'session',
    wallet: wallet || null,
    sessionId,
    firstSeen: visit.at,
    visits: 0,
    paths: {},
    countries: {},
    devices: {},
  }
  prev.lastSeen = visit.at
  prev.visits = (prev.visits || 0) + 1
  prev.sessionId = sessionId
  if (wallet) {
    prev.wallet = wallet
    prev.kind = 'wallet'
  }
  prev.lastPath = path
  prev.locale = body.locale || prev.locale
  prev.timezone = visit.timezone || prev.timezone
  prev.lastGeo = visit.geo
  prev.countries = prev.countries || {}
  prev.devices = prev.devices || {}
  const ckey = geo.country || geo.countryCode || 'Unknown'
  prev.countries[ckey] = (prev.countries[ckey] || 0) + 1
  prev.devices[visit.device] = (prev.devices[visit.device] || 0) + 1
  prev.topCountry = Object.entries(prev.countries).sort((a, b) => b[1] - a[1])[0]?.[0]
  prev.topDevice = Object.entries(prev.devices).sort((a, b) => b[1] - a[1])[0]?.[0]
  dbUpsertUser(prev)

  if (wallet && sessionId !== wallet) {
    const sess = dbGetUser(sessionId)
    if (sess) {
      sess.wallet = wallet
      sess.kind = 'wallet'
      dbUpsertUser(sess)
    }
  }

  return { ok: true, visitId: visit.id, geo: visit.geo }
}

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10)
}

function hourKey(ts) {
  return new Date(ts).toISOString().slice(0, 13) + ':00'
}

export function buildDashboard({ collections = [], serverMeta = {} } = {}) {
  const visits = dbListVisits(MAX_VISITS)
  const userRows = dbListUsers(4000)
  const now = Date.now()
  const dayMs = 86_400_000
  const last24 = visits.filter((v) => now - v.ts < dayMs)
  const last7 = visits.filter((v) => now - v.ts < dayMs * 7)

  const byCountry = {}
  const byCity = {}
  for (const v of last7) {
    const c = v.geo?.country || 'Unknown'
    const city =
      [v.geo?.city, v.geo?.region, v.geo?.countryCode].filter(Boolean).join(', ') ||
      'Unknown'
    byCountry[c] = (byCountry[c] || 0) + 1
    byCity[city] = (byCity[city] || 0) + 1
  }
  const topCountries = Object.entries(byCountry)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
  const topCities = Object.entries(byCity)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25)

  const byPath = {}
  for (const v of last7) byPath[v.path] = (byPath[v.path] || 0) + 1
  const topPaths = Object.entries(byPath)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  const byDevice = {}
  for (const v of last7) {
    byDevice[v.device || 'unknown'] = (byDevice[v.device || 'unknown'] || 0) + 1
  }

  const daily = {}
  for (let i = 6; i >= 0; i--) daily[dayKey(now - i * dayMs)] = 0
  for (const v of last7) {
    const k = dayKey(v.ts)
    if (daily[k] != null) daily[k]++
  }
  const visitsByDay = Object.entries(daily).map(([date, count]) => ({ date, count }))

  const hourly = {}
  for (let i = 23; i >= 0; i--) hourly[hourKey(now - i * 3_600_000)] = 0
  for (const v of last24) {
    const k = hourKey(v.ts)
    if (hourly[k] != null) hourly[k]++
  }
  const visitsByHour = Object.entries(hourly).map(([hour, count]) => ({ hour, count }))

  const userList = userRows.slice(0, 100).map((u) => ({
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
  }))

  const walletsConnected = userRows.filter((u) => u.wallet).length
  const activeToday = userRows.filter(
    (u) => now - new Date(u.lastSeen || 0).getTime() < dayMs
  ).length

  const cols = collections.length ? collections : listCollectionSummariesSafe()
  const dataCollection = {
    collectionsIndexed: cols.length,
    listedTotal: cols.reduce((s, c) => s + (c.listedCount || 0), 0),
    activityTotal: cols.reduce(
      (s, c) => s + (c.activities?.length || c.activityCount || 0),
      0
    ),
    offersTotal: cols.reduce(
      (s, c) => s + (c.offers?.length || c.offerCount || 0),
      0
    ),
    volume24h: cols.reduce((s, c) => s + (c.volume24h || 0), 0),
    volumeTotal: cols.reduce((s, c) => s + (c.volumeTotal || 0), 0),
    lastSyncs: cols
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        listedCount: c.listedCount || 0,
        activityCount: c.activities?.length || c.activityCount || 0,
        offerCount: c.offers?.length || c.offerCount || 0,
        floorPrice: c.floorPrice,
        volume24h: c.volume24h,
        syncedAt: c.syncedAt,
        syncMs: c.syncMs,
      }))
      .sort(
        (a, b) =>
          new Date(b.syncedAt || 0).getTime() - new Date(a.syncedAt || 0).getTime()
      )
      .slice(0, 30),
  }

  const recentVisits = [...visits]
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
    }))

  const s = dbStats()

  return {
    generatedAt: new Date().toISOString(),
    server: {
      ...serverMeta,
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      node: process.version,
      pid: process.pid,
      storage: 'sqlite',
      nftsIndexed: s.nfts,
      nftsEnriched: s.enriched,
    },
    visits: {
      total: metaGet('analytics_totalVisits', visits.length) || visits.length,
      last24h: last24.length,
      last7d: last7.length,
      uniqueSessions7d: new Set(last7.map((v) => v.sessionId)).size,
      withWallet7d: last7.filter((v) => v.wallet).length,
      byDay: visitsByDay,
      byHour: visitsByHour,
      topPaths,
      topCountries,
      topCities,
      byDevice: Object.entries(byDevice)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      recent: recentVisits,
    },
    users: {
      total: userRows.length,
      wallets: walletsConnected,
      sessions: userRows.length,
      activeToday,
      recent: userList,
    },
    dataCollection,
  }
}

export function analyticsCounts() {
  const s = dbStats()
  return {
    visitsStored: s.visits,
    usersStored: s.users,
    totalVisits: metaGet('analytics_totalVisits', s.visits) || s.visits,
    nftsIndexed: s.nfts,
    nftsEnriched: s.enriched,
  }
}
