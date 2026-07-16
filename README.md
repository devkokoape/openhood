# OpenHood

NFT marketplace on **Robinhood Chain** — trade, offer, bulk buy, and track collections.

Inspired by [ord.net](https://ord.net)-style marketplace UX, with Robinhood green theming and dark / light mode.

## Features

- **Trade NFTs** — browse collections, buy listed items, list your own
- **On-chain testnet market** — mint, list, buy, English auction (2.5% fee)
- **Offers** — single-item + collection-wide (demo catalog)
- **Bulk buy / sweep** — multi-select floor listings (on-chain sequential buys)
- **Profiles** — holdings, listings, offers, activity, portfolio estimate
- **Activity** — filterable feed (sales / listings / mints / bids)
- **Trending** — 24h · 1d · 7d · 30d · All volume leaderboard
- **Notable collections** — top 7-day sales (single horizontal row)
- **OpenSea live stats** — floors, volumes, NFT pagination (API key)
- **Insights** — time ranges, sales depth, floor charts
- **Toasts** — sonner feedback for buy / list / offer / mint
- **Network badge** — switch to Robinhood mainnet/testnet from the nav
- **Founder tools** — edit collection links (demo ownership)

### OpenSea data

- Snapshot fallback: `src/data/opensea-robinhood-snapshot.json`
- Live refresh every ~1s when `VITE_OPENSEA_API_KEY` is set
- Local dev can use Vite proxy `/opensea-api` (see `vite.config.ts`)

```bash
# .env (never commit real keys)
VITE_OPENSEA_API_KEY=your_key
# GitHub Pages: set secret OPENSEA_API_KEY (wired in deploy.yml)
```

Docs: https://docs.opensea.io/docs/query-analytics-and-events  
Chain browse: https://opensea.io/collections/chain/robinhood

## Stack

- React 19 + TypeScript + Vite 8
- Tailwind CSS v4
- React Router v7
- **wagmi v3 + viem** (Robinhood mainnet `4663` + testnet `46630`)
- **sonner** toasts
- OpenSea API + on-chain Hardhat marketplace

## Marketplace smart contracts

**Yes — fee-taking marketplace is implemented** under `contracts/`:

- **List / buy / cancel** fixed-price sales (NFT escrowed)
- **English auctions** (bid, outbid refund, settle)
- **Protocol fee** on every trade (default **2.5%**, max 10%)

```bash
npm run contracts:test              # 6 unit tests
npm run contracts:deploy:local      # hardhat
# Fund deployer → Robinhood testnet:
# https://faucet.testnet.chain.robinhood.com/
npm run contracts:deploy:testnet
npm run contracts:smoke:testnet
```

See [`contracts/README.md`](./contracts/README.md).

## Wallet connect

Navbar **Connect** opens a modal:

- MetaMask / browser injected wallets  
- Coinbase Wallet  
- WalletConnect (if `VITE_WALLETCONNECT_PROJECT_ID` is set)  

Network: **Robinhood Chain** (chain ID `4663`, RPC `https://rpc.mainnet.chain.robinhood.com`).  
If the wallet is on another chain, the UI prompts **Switch to Robinhood**.

## Run

```bash
cd openhood
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## GitHub Pages

Live site (after Actions deploy): **https://devkokoape.github.io/openhood/**

Deploys automatically on every push to `main` via `.github/workflows/deploy.yml`.

## Demo notes

- Wallet is mocked as connected (`0xOpenHood…7a3f`)
- You own the **Open Pixels** collection as founder — open it and use **Edit links**
- Buy, list, offer, and bulk-buy actions update local mock state and the activity feed

## Project layout

```
src/
  components/   UI, layout, NFT cards
  context/      Theme + marketplace state
  data/         Mock collections, NFTs, offers, activity
  pages/        Routes (home, collection, NFT, bulk, profile, activity, edit)
```
