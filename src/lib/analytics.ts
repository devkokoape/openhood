/**
 * Client analytics → local storage always + Fly indexer when configured.
 * Tracks page views, coarse location (timezone/locale), wallet when connected.
 */
import { hasIndexerUrl, indexerUrl } from './indexerApi'
import { recordLocalVisit } from './localAnalytics'

const SESSION_KEY = 'openhood-sid-v1'
const LAST_PATH_KEY = 'openhood-analytics-last'

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

function screenInfo(): string {
  try {
    return `${window.screen.width}x${window.screen.height}`
  } catch {
    return ''
  }
}

function localeRegion(): { locale: string; language: string; timezone: string } {
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
  return { locale, language, timezone }
}

export type VisitPayload = {
  path: string
  page?: string
  wallet?: string | null
  theme?: string
}

/**
 * Always records locally (admin works offline). Also posts to Fly when URL set.
 */
export function trackPageView(payload: VisitPayload): void {
  if (typeof window === 'undefined') return

  const path = payload.path || window.location.pathname
  try {
    const last = sessionStorage.getItem(LAST_PATH_KEY)
    const now = Date.now()
    if (last) {
      const [p, t] = last.split('|')
      if (p === path && now - Number(t) < 8_000) return
    }
    sessionStorage.setItem(LAST_PATH_KEY, `${path}|${now}`)
  } catch {
    /* ignore */
  }

  // 1) Local admin data (works without Fly)
  recordLocalVisit({
    path,
    page: payload.page || path,
    wallet: payload.wallet || null,
    theme: payload.theme,
  })

  // 2) Server when configured
  if (!hasIndexerUrl()) return

  const { locale, language, timezone } = localeRegion()
  const parts = locale.split('-')
  const countryCode =
    parts.length > 1 ? parts[parts.length - 1].toUpperCase() : null

  const body = {
    sessionId: sessionId(),
    path,
    page: payload.page || path,
    wallet: payload.wallet || null,
    referrer: document.referrer || null,
    locale,
    language,
    timezone,
    countryCode: countryCode && countryCode.length === 2 ? countryCode : null,
    screen: screenInfo(),
    userAgent: navigator.userAgent,
    theme: payload.theme || null,
    device: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
  }

  const url = `${indexerUrl()}/v1/analytics/visit`
  try {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' })
    if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) return
  } catch {
    /* fall through */
  }

  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
    mode: 'cors',
  }).catch(() => {
    /* offline */
  })
}
