import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  Activity,
  Layers,
  Menu,
  Moon,
  Search,
  Sun,
  User,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useTheme } from '../../context/ThemeContext'
import { ConnectWallet } from '../wallet/ConnectWallet'
import { NetworkBadge } from '../wallet/NetworkBadge'
import {
  isAdminAuthenticated,
  onAdminAuthChange,
} from '../../lib/adminAuth'

const publicLinks = [
  { to: '/', label: 'Discover', end: true, icon: Layers },
  { to: '/collections', label: 'Collections', end: false, icon: Layers },
  { to: '/rankings', label: 'Rankings', end: false, icon: Activity },
  { to: '/degen', label: 'Degen', end: false, icon: Zap },
  { to: '/activity', label: 'Activity', end: false, icon: Activity },
]

export function Navbar() {
  const { theme, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [isAdmin, setIsAdmin] = useState(() => isAdminAuthenticated())
  const navigate = useNavigate()

  useEffect(() => {
    setIsAdmin(isAdminAuthenticated())
    return onAdminAuthChange(() => setIsAdmin(isAdminAuthenticated()))
  }, [])

  const links = isAdmin
    ? [
        ...publicLinks,
        { to: '/admin', label: 'Admin', end: false, icon: Activity },
      ]
    : publicLinks

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (q.trim()) {
      navigate(`/collections?q=${encodeURIComponent(q.trim())}`)
      setOpen(false)
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-surface/90 backdrop-blur-xl pt-safe">
      <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 h-14 flex items-center gap-2 sm:gap-3 min-w-0">
        <Link to="/" className="flex items-center gap-1.5 sm:gap-2 shrink-0 group min-w-0">
          <div className="w-8 h-8 sm:w-7 sm:h-7 rounded-lg bg-hood flex items-center justify-center shadow-sm shadow-hood/30 shrink-0">
            <Layers className="w-3.5 h-3.5 text-[#0b0e11]" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-sm sm:text-base tracking-tight text-ink group-hover:text-hood transition-colors truncate">
            Open<span className="text-hood">Hood</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5 ml-1 min-w-0">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                clsx(
                  'px-2.5 lg:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  l.to === '/degen' && 'text-hood/90',
                  isActive
                    ? 'text-hood bg-hood-muted'
                    : 'text-ink-2 hover:text-ink hover:bg-surface-2'
                )
              }
            >
              {l.label === 'Degen' ? (
                <>
                  <span className="lg:hidden">Degen</span>
                  <span className="hidden lg:inline">Degen Mode</span>
                </>
              ) : (
                l.label
              )}
            </NavLink>
          ))}
        </nav>

        <form onSubmit={onSearch} className="hidden lg:flex flex-1 max-w-md ml-2 min-w-0">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search collections…"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface-2 border border-edge text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-hood focus:ring-1 focus:ring-hood/40"
            />
          </div>
        </form>

        <div className="flex items-center gap-1 sm:gap-1.5 ml-auto shrink-0">
          <NetworkBadge compact />

          <button
            type="button"
            onClick={toggle}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors cursor-pointer"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="max-w-[9.5rem] sm:max-w-none">
            <ConnectWallet compact />
          </div>

          <Link
            to="/profile"
            className="hidden sm:flex w-9 h-9 rounded-lg items-center justify-center text-ink-2 hover:bg-surface-2 hover:text-hood transition-colors"
            aria-label="Profile"
          >
            <User className="w-4 h-4" />
          </Link>

          <button
            type="button"
            className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 cursor-pointer"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {open && (
        <>
          <div
            className="md:hidden fixed inset-0 top-14 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="md:hidden absolute left-0 right-0 top-full z-50 border-b border-edge bg-surface shadow-xl max-h-[min(80dvh,calc(100dvh-3.5rem))] overflow-y-auto pb-safe animate-fade-in">
            <div className="px-3 py-3 space-y-1">
              <form onSubmit={onSearch} className="mb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search collections…"
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-surface-2 border border-edge text-sm text-ink"
                    autoComplete="off"
                  />
                </div>
              </form>

              {links.map((l) => {
                const Icon = l.icon
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3"
                  >
                    <Icon className="w-4 h-4 shrink-0 text-hood" />
                    {l.to === '/degen' ? 'Degen Mode' : l.label}
                  </Link>
                )
              })}
              <Link
                to="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-ink-2 hover:bg-surface-2"
              >
                <User className="w-4 h-4 shrink-0 text-hood" />
                Profile
              </Link>
            </div>
          </div>
        </>
      )}
    </header>
  )
}
