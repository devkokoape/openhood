import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { Button } from './Button'
import { Link } from 'react-router-dom'

export function EmptyState({
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
  icon,
}: {
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-14 sm:py-16">
      <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-edge flex items-center justify-center mb-3 text-ink-3">
        {icon || <Inbox className="w-5 h-5" />}
      </div>
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {description && (
        <p className="text-sm text-ink-3 mt-1.5 max-w-sm leading-relaxed">{description}</p>
      )}
      {actionLabel && actionTo && (
        <Link to={actionTo} className="mt-4">
          <Button size="sm">{actionLabel}</Button>
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <Button size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
