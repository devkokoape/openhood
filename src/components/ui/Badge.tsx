import clsx from 'clsx'
import type { ReactNode } from 'react'

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode
  tone?: 'default' | 'green' | 'blue' | 'orange' | 'muted'
  className?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        tone === 'default' && 'bg-surface-3 text-ink-2',
        tone === 'green' && 'bg-hood-muted text-hood',
        tone === 'blue' && 'bg-[rgba(81,133,255,0.15)] text-[var(--color-bid)]',
        tone === 'orange' && 'bg-[rgba(255,80,0,0.12)] text-[var(--color-danger)]',
        tone === 'muted' && 'bg-surface-2 text-ink-3',
        className
      )}
    >
      {children}
    </span>
  )
}
