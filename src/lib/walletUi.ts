/** Lightweight bus so any screen can open the Connect Wallet modal */

const OPEN_EVENT = 'openhood:open-connect-wallet'

export function openConnectWallet() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_EVENT))
}

export function onOpenConnectWallet(handler: () => void) {
  if (typeof window === 'undefined') return () => {}
  const fn = () => handler()
  window.addEventListener(OPEN_EVENT, fn)
  return () => window.removeEventListener(OPEN_EVENT, fn)
}
