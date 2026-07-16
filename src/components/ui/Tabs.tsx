import clsx from 'clsx'

interface Tab {
  id: string
  label: string
  count?: number
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-edge pb-px">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer',
            active === t.id ? 'text-hood' : 'text-ink-3 hover:text-ink'
          )}
        >
          {t.label}
          {t.count != null && (
            <span className="ml-1.5 text-xs text-ink-3 tabular-nums">{t.count}</span>
          )}
          {active === t.id && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-hood" />
          )}
        </button>
      ))}
    </div>
  )
}
