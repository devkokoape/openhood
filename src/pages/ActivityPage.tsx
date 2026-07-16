import { useMemo, useState } from 'react'
import { useMarketplace } from '../context/MarketplaceContext'
import { ActivityRow } from '../components/nft/ActivityRow'
import { Tabs } from '../components/ui/Tabs'
import type { ActivityType } from '../types'

const filters: { id: string; label: string; types?: ActivityType[] }[] = [
  { id: 'all', label: 'All' },
  { id: 'sale', label: 'Sales', types: ['sale'] },
  { id: 'mint', label: 'Mints', types: ['mint'] },
  { id: 'listing', label: 'Listings', types: ['listing'] },
  { id: 'bidding', label: 'Bidding', types: ['bid', 'offer', 'collection_offer'] },
  { id: 'transfer', label: 'Transfers', types: ['transfer'] },
]

export function ActivityPage() {
  const { activities } = useMarketplace()
  const [tab, setTab] = useState('all')

  const filtered = useMemo(() => {
    const f = filters.find((x) => x.id === tab)
    if (!f || !f.types) return activities
    return activities.filter((a) => f.types!.includes(a.type))
  }, [activities, tab])

  return (
    <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 py-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-ink">Activity</h1>
        <p className="text-ink-2 text-sm mt-1">
          Global sales, listings, and bidding across OpenHood — live marketplace feed.
        </p>
      </div>

      <Tabs
        tabs={filters.map((f) => ({
          id: f.id,
          label: f.label,
          count:
            f.id === 'all'
              ? activities.length
              : activities.filter((a) => f.types?.includes(a.type)).length,
        }))}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-4 rounded-2xl border border-edge overflow-hidden bg-surface">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-ink-3 text-sm">No activity in this filter.</p>
        ) : (
          filtered.map((a) => <ActivityRow key={a.id} activity={a} />)
        )}
      </div>
    </div>
  )
}
