import { useEffect, useMemo, useState } from 'react'
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useChainId,
  type Connector,
} from 'wagmi'
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  Unplug,
  Wallet,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../ui/Button'
import { robinhood } from '../../lib/chains'
import { formatAddress } from '../../data/mockData'

function labelFor(c: Connector): string {
  const n = (c.name || c.id || 'Wallet').trim()
  if (/meta\s*mask/i.test(n)) return 'MetaMask'
  if (/coinbase/i.test(n)) return 'Coinbase Wallet'
  if (/rabby/i.test(n)) return 'Rabby'
  if (/rainbow/i.test(n)) return 'Rainbow'
  if (/brave/i.test(n)) return 'Brave Wallet'
  if (/okx/i.test(n)) return 'OKX Wallet'
  if (/phantom/i.test(n)) return 'Phantom'
  if (/injected/i.test(n)) return 'Browser wallet'
  return n
}

function readyConnectors(list: readonly Connector[]): Connector[] {
  // Prefer named EIP-6963 wallets; keep generic injected as fallback last
  const sorted = [...list].sort((a, b) => {
    const aInj = /injected/i.test(a.name) || a.id === 'injected'
    const bInj = /injected/i.test(b.name) || b.id === 'injected'
    if (aInj && !bInj) return 1
    if (!aInj && bInj) return -1
    return labelFor(a).localeCompare(labelFor(b))
  })
  // Dedupe by label
  const seen = new Set<string>()
  return sorted.filter((c) => {
    const key = labelFor(c).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
  const { connectors, connectAsync, isPending, error, reset } = useConnect()
  const { disconnectAsync, isPending: isDisconnecting } = useDisconnect()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const wrongNetwork = isConnected && chainId !== robinhood.id
  const busy = isConnecting || isReconnecting || isPending
  const list = useMemo(() => readyConnectors(connectors), [connectors])

  useEffect(() => {
    if (!open) {
      reset()
      setLocalError(null)
      setPendingId(null)
    }
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
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, menuOpen])

  const onConnect = async (connector: Connector) => {
    setLocalError(null)
    setPendingId(connector.uid)
    try {
      await connectAsync({ connector, chainId: robinhood.id })
      setOpen(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to connect'
      if (/reject|denied|cancel/i.test(msg)) {
        setLocalError('Connection rejected in your wallet.')
      } else if (/provider|not found|no ethereum/i.test(msg)) {
        setLocalError('No wallet detected. Install MetaMask or another browser wallet.')
      } else {
        setLocalError(msg.slice(0, 160))
      }
    } finally {
      setPendingId(null)
    }
  }

  const onSwitch = async () => {
    setLocalError(null)
    try {
      await switchChainAsync({ chainId: robinhood.id })
    } catch (e) {
      // Wallet may not know Robinhood Chain — try wallet_addEthereumChain via provider
      try {
        const eth = (window as unknown as { ethereum?: { request: (a: unknown) => Promise<unknown> } })
          .ethereum
        if (!eth) throw e
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: `0x${robinhood.id.toString(16)}`,
              chainName: robinhood.name,
              nativeCurrency: robinhood.nativeCurrency,
              rpcUrls: [robinhood.rpcUrls.default.http[0]],
              blockExplorerUrls: [robinhood.blockExplorers.default.url],
            },
          ],
        })
        await switchChainAsync({ chainId: robinhood.id })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not switch network'
        setLocalError(msg.slice(0, 160))
      }
    }
  }

  /* ── Connected state ── */
  if (isConnected && address) {
    return (
      <div className={clsx('relative', className)}>
        {wrongNetwork ? (
          <Button
            size={compact ? 'sm' : 'md'}
            variant="outline"
            className="!border-[var(--color-danger)] !text-[var(--color-danger)]"
            disabled={isSwitching}
            onClick={() => void onSwitch()}
          >
            {isSwitching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wallet className="w-3.5 h-3.5" />
            )}
            Switch network
          </Button>
        ) : (
          <Button
            size={compact ? 'sm' : 'md'}
            variant="outline"
            onClick={() => setMenuOpen((v) => !v)}
            type="button"
          >
            <span className="w-2 h-2 rounded-full bg-hood shrink-0" />
            <span className="font-mono text-xs">{formatAddress(address)}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </Button>
        )}

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-2 z-[70] w-64 rounded-xl border border-edge bg-surface shadow-2xl py-1 animate-fade-in">
              <div className="px-3 py-2.5 border-b border-edge">
                <div className="text-[10px] uppercase tracking-wide text-ink-3 font-semibold">
                  Connected
                </div>
                <div className="text-[11px] font-mono text-ink break-all mt-1 leading-snug">
                  {address}
                </div>
                <div
                  className={clsx(
                    'text-[11px] mt-1.5 font-semibold',
                    wrongNetwork ? 'text-[var(--color-danger)]' : 'text-hood'
                  )}
                >
                  {chainId === robinhood.id
                    ? 'Robinhood Chain'
                    : `Wrong network (${chainId})`}
                </div>
              </div>

              {wrongNetwork && (
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-hood hover:bg-hood-muted cursor-pointer text-left"
                  onClick={() => {
                    void onSwitch()
                    setMenuOpen(false)
                  }}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Switch to Robinhood Chain
                </button>
              )}

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

              <button
                type="button"
                disabled={isDisconnecting}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--color-danger)] hover:bg-surface-2 cursor-pointer text-left border-t border-edge disabled:opacity-50"
                onClick={() => {
                  void disconnectAsync().finally(() => setMenuOpen(false))
                }}
              >
                <Unplug className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          </>
        )}

        {localError && (
          <div className="absolute right-0 top-full mt-2 z-[70] w-64 px-3 py-2 rounded-lg bg-[rgba(255,80,0,0.12)] text-[var(--color-danger)] text-xs shadow-lg">
            {localError}
          </div>
        )}
      </div>
    )
  }

  /* ── Disconnected ── */
  return (
    <>
      <Button
        type="button"
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
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-edge bg-surface shadow-2xl animate-fade-in overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-edge shrink-0">
              <div>
                <h2 className="text-lg font-bold text-ink">Connect wallet</h2>
                <p className="text-xs text-ink-3 mt-0.5">
                  Robinhood Chain · chain ID {robinhood.id}
                </p>
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

            <div className="p-3 space-y-2 overflow-y-auto flex-1">
              {list.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <Wallet className="w-8 h-8 text-ink-3 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-ink">No wallet detected</p>
                  <p className="text-xs text-ink-3 mt-1.5 max-w-xs mx-auto">
                    Install MetaMask or another browser extension, then refresh this page.
                  </p>
                  <a
                    href="https://metamask.io/download/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex mt-4 text-sm font-semibold text-hood hover:underline"
                  >
                    Get MetaMask →
                  </a>
                </div>
              )}

              {list.map((connector) => {
                const pending = pendingId === connector.uid
                return (
                  <button
                    key={connector.uid}
                    type="button"
                    disabled={isPending}
                    onClick={() => void onConnect(connector)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3.5 py-3.5 rounded-xl border transition-colors cursor-pointer text-left disabled:opacity-60',
                      pending
                        ? 'border-hood bg-hood-muted'
                        : 'border-edge bg-surface-2 hover:border-hood/50 hover:bg-hood-muted'
                    )}
                  >
                    <div className="w-11 h-11 rounded-xl bg-surface border border-edge flex items-center justify-center shrink-0 overflow-hidden">
                      {connector.icon ? (
                        <img
                          src={connector.icon}
                          alt=""
                          className="w-7 h-7 object-contain"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <Wallet className="w-5 h-5 text-hood" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink">{labelFor(connector)}</div>
                      <div className="text-[11px] text-ink-3">
                        {pending ? 'Confirm in wallet…' : 'Browser extension'}
                      </div>
                    </div>
                    {pending ? (
                      <Loader2 className="w-4 h-4 animate-spin text-hood shrink-0" />
                    ) : (
                      <span className="text-xs font-semibold text-hood shrink-0">Connect</span>
                    )}
                  </button>
                )
              })}

              {/* Always offer generic injected as last resort if not already listed */}
              {list.length > 0 && !list.some((c) => c.id === 'injected') && (
                <p className="text-[11px] text-ink-3 px-1 pt-1">
                  Don’t see your wallet? Unlock the extension and refresh.
                </p>
              )}
            </div>

            {(localError || error) && (
              <div className="mx-3 mb-2 px-3 py-2.5 rounded-xl bg-[rgba(255,80,0,0.1)] border border-[rgba(255,80,0,0.25)] text-[var(--color-danger)] text-xs leading-relaxed">
                {localError ||
                  (error?.message?.match(/reject|denied|cancel/i)
                    ? 'Connection rejected in your wallet.'
                    : error?.message) ||
                  'Failed to connect'}
              </div>
            )}

            <div className="px-5 py-3 border-t border-edge bg-surface-2/60 shrink-0">
              <p className="text-[11px] text-ink-3 leading-relaxed">
                OpenHood uses <span className="text-ink font-semibold">Robinhood Chain</span>{' '}
                (ID {robinhood.id}). Your wallet will prompt to add/switch if needed.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
