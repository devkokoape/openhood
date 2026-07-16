import clsx from 'clsx'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'animate-pulse rounded-lg bg-surface-3/80 dark:bg-surface-3',
        className
      )}
      aria-hidden
    />
  )
}

export function NftCardSkeleton() {
  return (
    <div className="rounded-xl border border-edge overflow-hidden bg-surface">
      <Skeleton className="aspect-square rounded-none" />
      <div className="p-2.5 space-y-2">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}

export function CollectionRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <Skeleton className="w-8 h-8 rounded-lg" />
      <Skeleton className="w-10 h-10 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  )
}
