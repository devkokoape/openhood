/**
 * Soft admin gate for static GitHub Pages.
 * Note: any client-side password can be reverse-engineered from the JS bundle.
 * Good enough to hide the panel from casual visitors; not cryptographic security.
 */

const SESSION_KEY = 'openhood-admin-session-v1'

const ADMIN_USER = (
  import.meta.env.VITE_ADMIN_USER as string | undefined
)?.trim() || 'mrkoko'

const ADMIN_PASS = (
  import.meta.env.VITE_ADMIN_PASS as string | undefined
)?.trim() || 'MRkoko2025'

export function getAdminUsername(): string {
  return ADMIN_USER
}

export function verifyAdminCredentials(
  username: string,
  password: string
): boolean {
  return (
    username.trim() === ADMIN_USER && password === ADMIN_PASS
  )
}

export function isAdminAuthenticated(): boolean {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return false
    const data = JSON.parse(raw) as { user?: string; at?: number }
    if (data.user !== ADMIN_USER) return false
    // Session lasts for this browser tab session only (sessionStorage)
    return true
  } catch {
    return false
  }
}

export function setAdminAuthenticated(username: string): void {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ user: username.trim(), at: Date.now() })
  )
  window.dispatchEvent(new Event('openhood-admin-auth'))
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event('openhood-admin-auth'))
}

/** Subscribe to login/logout in the same tab */
export function onAdminAuthChange(cb: () => void): () => void {
  const handler = () => cb()
  window.addEventListener('openhood-admin-auth', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('openhood-admin-auth', handler)
    window.removeEventListener('storage', handler)
  }
}
