import { AlertTriangle, BadgeCheck, FlaskConical, Skull } from 'lucide-react'
import type { CollectionRisk } from '../../types'
import { RISK_LABELS } from '../../lib/indexer'
import { Badge } from '../ui/Badge'
import clsx from 'clsx'

const icons = {
  verified: BadgeCheck,
  high_risk: AlertTriangle,
  trash: Skull,
  demo: FlaskConical,
}

export function RiskBadge({
  risk,
  compact,
  className,
}: {
  risk?: CollectionRisk
  compact?: boolean
  className?: string
}) {
  if (!risk) return null
  const meta = RISK_LABELS[risk]
  const Icon = icons[risk]

  return (
    <Badge
      tone={meta.tone}
      className={clsx(
        'normal-case tracking-normal gap-1',
        risk === 'trash' && 'opacity-90',
        className
      )}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {compact ? meta.short : meta.label}
    </Badge>
  )
}
