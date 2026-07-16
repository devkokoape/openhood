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
import { useMarketplace } from '../../context/MarketplaceContext'
import { ConnectWallet } from '../wallet/ConnectWallet'

const links = [
  { to: '/', label: 'Discover', end: true },
  { to: '/collections', label: 'Collections', end: false },
  { to: '/rankings', label: 'Rankings', end: false },
  { to: '/degen', label: 'Degen Mode', end: false },
  { to: '/activity', label: 'Activity', end: false },
]

export function Navbar() {
  const { theme, toggle } = useTheme()
  const { openSeaStatus } = useMarketplace()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const navigate = useNavigate()

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (q.trim()) navigate(`/collections?q=${encodeURIComponent(q.trim())}`)
  }

  const liveAge =
    openSeaStatus.lastOkAt != null
      ? Math.max(0, Math.round((now - openSeaStatus.lastOkAt) / 1000))
      : null

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 h-14 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0 group">
          <div className="w-7 h-7 rounded-lg bg-hood flex items-center justify-center shadow-sm shadow-hood/30">
            <Layers className="w-3.5 h-3.5 text-[#0b0e11]" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-base tracking-tight text-ink group-hover:text-hood transition-colors">
            Open<span className="text-hood">Hood</span>
          </span>
        </Link>

        {/* Live OpenSea pulse */}
        <div
          className={clsx(
            'hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border',
            openSeaStatus.live
              ? 'border-hood/40 bg-hood-muted text-hood'
              : 'border-edge bg-surface-2 text-ink-3'
          )}
          title={
            openSeaStatus.lastError ||
            (openSeaStatus.live
              ? 'OpenSea Robinhood stats refreshing every 1s'
              : 'Waiting for OpenSea — set VITE_OPENSEA_API_KEY for production live data')
          }
        >
          <span
            className={clsx(
              'w-1.5 h-1.5 rounded-full',
              openSeaStatus.live
                ? 'bg-hood animate-pulse'
                : openSeaStatus.refreshing
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-ink-3'
            )}
          />
          {openSeaStatus.live
            ? liveAge != null && liveAge < 3
              ? 'Live OpenSea'
              : `OpenSea ${liveAge ?? '—'}s`
            : openSeaStatus.refreshing
              ? 'Syncing…'
              : 'OpenSea offline'}
        </div>

        <nav className="hidden md:flex items-center gap-0.5 ml-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  l.to === '/degen' && 'text-hood/90',
                  isActive
                    ? 'text-hood bg-hood-muted'
                    : 'text-ink-2 hover:text-ink hover:bg-surface-2'
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <form onSubmit={onSearch} className="hidden lg:flex flex-1 max-w-sm ml-2">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search collections…"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface-2 border border-edge text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-hood focus:ring-1 focus:ring-hood/40"
            />
          </div>
        </form>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={toggle}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors cursor-pointer"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="hidden sm:block">
            <ConnectWallet compact />
          </div>

          <Link
            to="/profile"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 hover:text-hood transition-colors"
          >
            <User className="w-4 h-4" />
          </Link>

          <button
            className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 cursor-pointer"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-edge bg-surface px-3 py-3 space-y-1 animate-fade-in">
          <form onSubmit={onSearch} className="mb-2 lg:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-surface-2 border border-edge text-sm"
              />
            </div>
          </form>
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              {l.to === '/activity' && <Activity className="w-4 h-4" />}
              {l.to === '/degen' && <Zap className="w-4 h-4" />}
              {l.to === '/collections' && <Layers className="w-4 h-4" />}
              {l.to === '/' && <Layers className="w-4 h-4" />}
              {l.label}
            </Link>
          ))}
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            <User className="w-4 h-4" />
            Profile
          </Link>
          <div className="pt-2" onClick={() => setOpen(false)}>
            <ConnectWallet className="w-full" />
          </div>
        </div>
      )}
    </header>
  )
}
