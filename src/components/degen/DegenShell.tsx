import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Rocket, ShoppingCart } from 'lucide-react'
import clsx from 'clsx'
import {
  AnimatedFlame,
  AnimatedZap,
} from '../ui/AnimatedIcons'

export function DegenShell() {
  const { pathname } = useLocation()

  const tabs = [
    {
      to: '/degen',
      label: 'Overview',
      active: pathname === '/degen',
      icon: 'flame' as const,
    },
    {
      to: '/degen/mints',
      label: 'Mint pages',
      active: pathname.startsWith('/degen/mint'),
      icon: 'rocket' as const,
    },
    {
      to: '/degen/bulk',
      label: 'Bulk buy',
      active: pathname.startsWith('/degen/bulk'),
      icon: 'cart' as const,
    },
  ]

  return (
    <div className="animate-fade-in">
      <div className="border-b border-edge bg-surface-2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-hood/15 via-transparent to-[rgba(255,80,0,0.08)] pointer-events-none" />
        <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-5 relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-hood flex items-center justify-center shrink-0 shadow-lg shadow-hood/25">
                <AnimatedZap className="text-[#0b0e11]" size="lg" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
                    Degen Mode
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-[rgba(255,80,0,0.12)] text-[var(--color-danger)] text-[10px] font-bold uppercase tracking-wide">
                    High risk
                  </span>
                </div>
                <p className="text-sm text-ink-2 mt-0.5">
                  Mint live drops, bulk mint, and sweep floors — faster tools for degens.
                </p>
              </div>
            </div>
          </div>

          <nav className="mt-4 flex gap-1 overflow-x-auto hide-scrollbar">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors',
                  t.active
                    ? 'bg-hood text-[#0b0e11]'
                    : 'text-ink-2 hover:text-ink hover:bg-surface'
                )}
              >
                {t.icon === 'flame' && (
                  <AnimatedFlame size="sm" className={t.active ? 'text-[#0b0e11]' : 'text-hood'} />
                )}
                {t.icon === 'rocket' && <Rocket className="w-3.5 h-3.5" />}
                {t.icon === 'cart' && <ShoppingCart className="w-3.5 h-3.5" />}
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <Outlet />
    </div>
  )
}
