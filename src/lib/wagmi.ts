import { http, createConfig, createStorage } from 'wagmi'
import { injected, metaMask, coinbaseWallet, walletConnect } from 'wagmi/connectors'
import { robinhood, robinhoodTestnet } from './chains'

const walletConnectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

const connectors = [
  injected({ shimDisconnect: true }),
  metaMask({ dappMetadata: { name: 'OpenHood' } }),
  coinbaseWallet({ appName: 'OpenHood', preference: 'all' }),
  ...(walletConnectId
    ? [
        walletConnect({
          projectId: walletConnectId,
          metadata: {
            name: 'OpenHood',
            description: 'NFT marketplace on Robinhood Chain',
            url: typeof window !== 'undefined' ? window.location.origin : 'https://openhood.app',
            icons: ['https://openhood.app/favicon.svg'],
          },
          showQrModal: true,
        }),
      ]
    : []),
]

export const wagmiConfig = createConfig({
  chains: [robinhood, robinhoodTestnet],
  connectors,
  transports: {
    [robinhood.id]: http('https://rpc.mainnet.chain.robinhood.com'),
    [robinhoodTestnet.id]: http('https://rpc.testnet.chain.robinhood.com'),
  },
  storage: createStorage({ storage: localStorage }),
  ssr: false,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
