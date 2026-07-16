import { http, createConfig, createStorage, injected } from 'wagmi'
import { robinhood, robinhoodTestnet } from './chains'
import { MARKETPLACE_CHAIN_ID } from './marketplace'

/** Prefer testnet when marketplace is deployed there (default 46630). */
const primary =
  MARKETPLACE_CHAIN_ID === robinhood.id ? robinhood : robinhoodTestnet
const secondary = primary.id === robinhood.id ? robinhoodTestnet : robinhood

export const wagmiConfig = createConfig({
  chains: [primary, secondary],
  connectors: [
    injected({
      shimDisconnect: true,
      unstable_shimAsyncInject: 2_000,
    }),
  ],
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
