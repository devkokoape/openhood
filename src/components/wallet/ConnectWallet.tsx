import { useEffect, useState } from 'react'
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useChainId,
  type Connector,
} from 'wagmi'
import { Check, ChevronDown, ExternalLink, Loader2, Wallet, X } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../ui/Button'
import { robinhood } from '../../lib/chains'
import { formatAddress } from '../../data/mockData'

function connectorLabel(c: Connector): string {
  const name = c.name || c.id
  if (/meta\s*mask/i.test(name)) return 'MetaMask'
  if (/coinbase/i.test(name)) return 'Coinbase Wallet'
  if (/walletconnect/i.test(name)) return 'WalletConnect'
  if (/injected/i.test(name) || /browser/i.test(name)) return 'Browser wallet'
  return name
}

export function ConnectWallet({
  compact,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount()
  const chainId = useChainId()
  const { connectors, connect, isPending, error, reset } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const wrongNetwork = isConnected && chainId !== robinhood.id
  const busy = isConnecting || isReconnecting || isPending

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  useEffect(() => {
    if (!open && !menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, menuOpen])

  // Deduplicate connectors by name (injected often overlaps MetaMask)
  const uniqueConnectors = connectors.filter((c, i, arr) => {
    const label = connectorLabel(c).toLowerCase()
    return arr.findIndex((x) => connectorLabel(x).toLowerCase() === label) === i
  })

  if (isConnected && address) {
    return (
      <div className={clsx('relative', className)}>
        {wrongNetwork ? (
          <Button
            size={compact ? 'sm' : 'md'}
            variant="outline"
            className="!border-[var(--color-danger)] !text-[var(--color-danger)]"
            disabled={isSwitching}
            onClick={() => switchChain({ chainId: robinhood.id })}
          >
            {isSwitching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wallet className="w-3.5 h-3.5" />
            )}
            Switch to Robinhood
          </Button>
        ) : (
          <Button
            size={compact ? 'sm' : 'md'}
            variant="outline"
            onClick={() => setMenuOpen((v) => !v)}
            className="font-mono"
          >
            <span className="w-2 h-2 rounded-full bg-hood shrink-0" />
            {formatAddress(address)}
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </Button>
        )}

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-edge bg-surface shadow-xl py-1 animate-fade-in">
              <div className="px-3 py-2 border-b border-edge">
                <div className="text-[10px] uppercase tracking-wide text-ink-3">Connected</div>
                <div className="text-xs font-mono text-ink break-all mt-0.5">{address}</div>
                <div className="text-[11px] text-hood mt-1 font-semibold">
                  {chainId === robinhood.id ? 'Robinhood Chain' : `Chain ${chainId}`}
                </div>
              </div>
              <a
                href={`${robinhood.blockExplorers.default.url}/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
                onClick={() => setMenuOpen(false)}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on explorer
              </a>
              {!wrongNetwork && (
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer text-left"
                  onClick={() => {
                    switchChain({ chainId: robinhood.id })
                    setMenuOpen(false)
                  }}
                >
                  <Check className="w-3.5 h-3.5 text-hood" />
                  Robinhood Chain
                </button>
              )}
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--color-danger)] hover:bg-surface-2 cursor-pointer text-left border-t border-edge"
                onClick={() => {
                  disconnect()
                  setMenuOpen(false)
                }}
              >
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <Button
        size={compact ? 'sm' : 'md'}
        onClick={() => setOpen(true)}
        disabled={busy}
        className={className}
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Wallet className="w-3.5 h-3.5" />
        )}
        Connect
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-edge bg-surface shadow-2xl animate-fade-in overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-edge">
              <div>
                <h2 className="text-lg font-bold text-ink">Connect wallet</h2>
                <p className="text-xs text-ink-3 mt-0.5">Robinhood Chain · OpenHood</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-1.5">
              {uniqueConnectors.map((connector) => (
                <button
                  key={connector.uid}
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    connect(
                      { connector, chainId: robinhood.id },
                      {
                        onSuccess: () => setOpen(false),
                      }
                    )
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border border-edge bg-surface-2 hover:border-hood/50 hover:bg-hood-muted transition-colors cursor-pointer text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-surface border border-edge flex items-center justify-center shrink-0 overflow-hidden">
                    {connector.icon ? (
                      <img src={connector.icon} alt="" className="w-6 h-6" />
                    ) : (
                      <Wallet className="w-5 h-5 text-hood" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink">{connectorLabel(connector)}</div>
                    <div className="text-[11px] text-ink-3 truncate">
                      {connector.type === 'injected'
                        ? 'Browser extension'
                        : connector.type === 'walletConnect'
                          ? 'Scan QR with mobile wallet'
                          : 'Connect securely'}
                    </div>
                  </div>
                  {isPending && (
                    <Loader2 className="w-4 h-4 animate-spin text-hood shrink-0" />
                  )}
                </button>
              ))}
            </div>

            {error && (
              <div className="mx-3 mb-3 px-3 py-2 rounded-lg bg-[rgba(255,80,0,0.1)] text-[var(--color-danger)] text-xs">
                {error.message?.includes('User rejected') || error.message?.includes('rejected')
                  ? 'Connection rejected in wallet.'
                  : error.message || 'Failed to connect'}
              </div>
            )}

            <div className="px-5 py-3 border-t border-edge bg-surface-2/50">
              <p className="text-[11px] text-ink-3 leading-relaxed">
                Connects to <span className="text-ink font-semibold">Robinhood Chain</span> (ID{' '}
                {robinhood.id}). Use MetaMask, Coinbase, or any injected wallet.
                {!import.meta.env.VITE_WALLETCONNECT_PROJECT_ID && (
                  <>
                    {' '}
                    Add <code className="text-hood">VITE_WALLETCONNECT_PROJECT_ID</code> for
                    WalletConnect.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
