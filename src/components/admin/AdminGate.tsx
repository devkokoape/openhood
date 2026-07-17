import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Lock, Shield } from 'lucide-react'
import {
  clearAdminSession,
  isAdminAuthenticated,
  onAdminAuthChange,
  setAdminAuthenticated,
  verifyAdminCredentials,
} from '../../lib/adminAuth'
import { Button } from '../ui/Button'
import { toast } from 'sonner'

export function AdminGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => isAdminAuthenticated())
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setAuthed(isAdminAuthenticated())
    return onAdminAuthChange(() => setAuthed(isAdminAuthenticated()))
  }, [])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    // tiny delay so it doesn't feel instant-bruteforceable UX-wise
    window.setTimeout(() => {
      if (verifyAdminCredentials(username, password)) {
        setAdminAuthenticated(username.trim())
        setAuthed(true)
        setPassword('')
        toast.success('Admin access granted')
      } else {
        setError('Invalid username or password')
        toast.error('Access denied')
      }
      setBusy(false)
    }, 280)
  }

  if (authed) {
    return (
      <div className="relative">
        <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 pt-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              clearAdminSession()
              setAuthed(false)
              toast.message('Logged out of admin')
            }}
            className="text-xs font-semibold text-ink-3 hover:text-hood cursor-pointer"
          >
            Log out admin
          </button>
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-3 py-12 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-surface shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-edge bg-surface-2/60 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-hood/15 border border-hood/25 flex items-center justify-center">
            <Shield className="w-5 h-5 text-hood" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-ink">Admin access</h1>
            <p className="text-xs text-ink-3">Restricted · developers only</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <p className="text-sm text-ink-2 leading-relaxed">
            Sign in to open the indexer and problem detector. This panel is not linked
            for public visitors.
          </p>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-3">
              Username
            </span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink text-sm focus:outline-none focus:border-hood"
              placeholder="Username"
              required
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-3">
              Password
            </span>
            <div className="mt-1 relative">
              <input
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-3 pr-11 rounded-xl bg-surface-2 border border-edge text-ink text-sm focus:outline-none focus:border-hood"
                placeholder="Password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-3 hover:text-ink cursor-pointer"
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          {error && (
            <div className="rounded-lg border border-[rgba(255,80,0,0.35)] bg-[rgba(255,80,0,0.08)] px-3 py-2 text-xs text-[var(--color-danger)] font-semibold">
              {error}
            </div>
          )}

          <Button type="submit" fullWidth disabled={busy} className="h-11">
            <Lock className="w-4 h-4" />
            {busy ? 'Checking…' : 'Sign in'}
          </Button>

          <p className="text-[11px] text-ink-3 text-center">
            <Link to="/" className="text-hood hover:underline">
              ← Back to market
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
