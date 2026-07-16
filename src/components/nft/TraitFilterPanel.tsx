import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import type { TraitFilterMap, TraitTypeStat } from '../../lib/traits'
import { formatPrice } from '../../data/mockData'
import { Button } from '../ui/Button'

interface Props {
  stats: TraitTypeStat[]
  filters: TraitFilterMap
  onChange: (next: TraitFilterMap) => void
  className?: string
}

export function TraitFilterPanel({ stats, filters, onChange, className }: Props) {
  const [openTypes, setOpenTypes] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(stats.slice(0, 3).map((s) => [s.trait_type, true]))
  )

  const toggleOpen = (type: string) =>
    setOpenTypes((o) => ({ ...o, [type]: !o[type] }))

  const toggleValue = (type: string, value: string) => {
    const current = filters[type] || []
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    const copy = { ...filters }
    if (next.length === 0) delete copy[type]
    else copy[type] = next
    onChange(copy)
  }

  const clear = () => onChange({})

  const active = Object.values(filters).flat()

  return (
    <aside
      className={clsx(
        'rounded-2xl border border-edge bg-surface overflow-hidden shadow-sm',
        className
      )}
    >
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-edge">
        <h3 className="text-sm font-bold text-ink">Status & traits</h3>
        {active.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clear} className="!h-7 !px-2 text-xs text-hood">
            Clear all
          </Button>
        )}
      </div>

      {active.length > 0 && (
        <div className="px-3 py-2 flex flex-wrap gap-1.5 border-b border-edge">
          {Object.entries(filters).flatMap(([type, values]) =>
            values.map((v) => (
              <button
                key={`${type}-${v}`}
                type="button"
                onClick={() => toggleValue(type, v)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-hood-muted text-hood text-[11px] font-semibold cursor-pointer hover:opacity-80"
              >
                {v}
                <X className="w-3 h-3" />
              </button>
            ))
          )}
        </div>
      )}

      <div className="max-h-[70vh] overflow-y-auto">
        {stats.map((stat) => {
          const open = openTypes[stat.trait_type] ?? false
          const selected = filters[stat.trait_type] || []
          return (
            <div key={stat.trait_type} className="border-b border-edge last:border-0">
              <button
                type="button"
                onClick={() => toggleOpen(stat.trait_type)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-surface-2 cursor-pointer"
              >
                <span className="text-sm font-semibold text-ink">
                  {stat.trait_type}
                  {selected.length > 0 && (
                    <span className="ml-1.5 text-hood text-xs">({selected.length})</span>
                  )}
                </span>
                {open ? (
                  <ChevronDown className="w-4 h-4 text-ink-3" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-ink-3" />
                )}
              </button>
              {open && (
                <div className="px-2 pb-2 space-y-0.5">
                  {stat.values.map((v) => {
                    const on = selected.includes(v.value)
                    return (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => toggleValue(stat.trait_type, v.value)}
                        className={clsx(
                          'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition-colors cursor-pointer',
                          on ? 'bg-hood-muted' : 'hover:bg-surface-2'
                        )}
                      >
                        <span
                          className={clsx(
                            'w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[10px]',
                            on
                              ? 'bg-hood border-hood text-[#0b0e11]'
                              : 'border-edge bg-surface'
                          )}
                        >
                          {on ? '✓' : ''}
                        </span>
                        <span className={clsx('flex-1 truncate', on ? 'text-hood font-medium' : 'text-ink')}>
                          {v.value}
                        </span>
                        <span className="text-[11px] text-ink-3 tabular-nums shrink-0">
                          {v.count}
                        </span>
                        <span className="text-[10px] text-ink-3 tabular-nums w-10 text-right shrink-0">
                          {v.rarity < 10 ? v.rarity.toFixed(1) : Math.round(v.rarity)}%
                        </span>
                        {v.floor != null && (
                          <span className="text-[10px] text-hood tabular-nums w-12 text-right shrink-0 hidden sm:inline">
                            {formatPrice(v.floor)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {stats.length === 0 && (
          <p className="p-4 text-sm text-ink-3 text-center">No traits in this collection.</p>
        )}
      </div>
    </aside>
  )
}
