import { ExternalLink, Loader2, X } from 'lucide-react'
import { explorerTx } from '../../lib/marketplace'
import type { Hex } from 'viem'

export function TxToast({
  message,
  hash,
  pending,
  onClose,
}: {
  message: string
  hash?: Hex | string | null
  pending?: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed top-20 right-4 z-[150] max-w-sm w-[min(100%-2rem,24rem)] px-4 py-3 rounded-xl bg-surface border border-edge shadow-2xl animate-fade-in">
      <div className="flex items-start gap-2">
        {pending && <Loader2 className="w-4 h-4 animate-spin text-hood shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">{message}</p>
          {hash && (
            <a
              href={explorerTx(hash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-hood mt-1 hover:underline break-all"
            >
              View tx <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-3 hover:text-ink cursor-pointer p-0.5"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
