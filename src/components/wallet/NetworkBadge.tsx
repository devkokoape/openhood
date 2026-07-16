import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { MARKETPLACE_CHAIN_ID } from '../../lib/marketplace'
import { robinhood, robinhoodTestnet } from '../../lib/chains'
import { toast } from 'sonner'

const target =
  MARKETPLACE_CHAIN_ID === robinhood.id ? robinhood : robinhoodTestnet

export function NetworkBadge({ compact }: { compact?: boolean }) {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync, isPending } = useSwitchChain()

  if (!isConnected) return null

  const ok = chainId === target.id
  const label = ok
    ? compact
      ? target.name.replace('Robinhood Chain ', 'RH ')
      : target.name
    : compact
      ? 'Wrong net'
      : `Switch to ${target.name}`

  const onClick = async () => {
    if (ok || isPending) return
    try {
      await switchChainAsync({ chainId: target.id })
      toast.success(`Switched to ${target.name}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Switch failed'
      if (!/reject|denied|cancel/i.test(msg)) toast.error(msg.slice(0, 120))
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={ok || isPending}
      className={clsx(
        'inline-flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded-lg text-[10px] sm:text-[11px] font-bold border transition-colors shrink-0',
        ok
          ? 'border-hood/30 bg-hood-muted text-hood cursor-default'
          : 'border-[rgba(255,80,0,0.35)] bg-[rgba(255,80,0,0.1)] text-[var(--color-danger)] cursor-pointer hover:opacity-90',
        isPending && 'opacity-70'
      )}
      title={ok ? `Connected to ${target.name}` : `Click to switch to ${target.name}`}
    >
      {isPending ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : ok ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <AlertTriangle className="w-3 h-3" />
      )}
      <span className="hidden sm:inline whitespace-nowrap max-w-[7rem] truncate">
        {label}
      </span>
      <span className="sm:hidden">{ok ? 'RH' : '!'}</span>
    </button>
  )
}
