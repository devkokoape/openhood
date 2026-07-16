import { http, createConfig, createStorage, injected } from 'wagmi'
import { robinhood, robinhoodTestnet } from './chains'

/**
 * Injected wallets only (MetaMask, Rabby, Coinbase extension, Phantom, etc.)
 * via EIP-6963 multiInjectedProviderDiscovery.
 *
 * WalletConnect / MetaMask SDK need extra peer packages + project IDs —
 * enable later with VITE_WALLETCONNECT_PROJECT_ID if needed.
 */
export const wagmiConfig = createConfig({
  chains: [robinhood, robinhoodTestnet],
  connectors: [
    injected({
      shimDisconnect: true,
      unstable_shimAsyncInject: 2_000,
    }),
  ],
  // Discover all EIP-6963 browser wallets as separate connectors
  multiInjectedProviderDiscovery: true,
  transports: {
    [robinhood.id]: http('https://rpc.mainnet.chain.robinhood.com', {
      batch: true,
      retryCount: 2,
    }),
    [robinhoodTestnet.id]: http('https://rpc.testnet.chain.robinhood.com', {
      batch: true,
      retryCount: 2,
    }),
  },
  storage: createStorage({
    storage: typeof window !== 'undefined' ? localStorage : undefined,
  }),
  ssr: false,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
