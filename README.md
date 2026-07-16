# OpenHood

NFT marketplace on **Robinhood Chain** — trade, offer, bulk buy, and track collections.

Inspired by [ord.net](https://ord.net)-style marketplace UX, with Robinhood green theming and dark / light mode.

## Features

- **Trade NFTs** — browse collections, buy listed items, list your own
- **Offers** — single-item offers and collection-wide offers
- **Bulk buy** — multi-select floor listings and purchase in one cart
- **Profiles** — view wallet holdings grouped by collection
- **Activity** — global feed of sales, listings, and bids
- **Founder tools** — collection founders can edit website / social links
- **OpenSea analytics** — Robinhood Chain collection floors, volumes, and interval sales from OpenSea [Analytics & Events](https://docs.opensea.io/reference/analytics-and-events) (`GET /api/v2/collections/{slug}/stats`)
- **Insights** — 1H / 1D / 7D / 30D / 1Y / All ranges with sales depth + floor charts
- **Resizable banner** — small / medium / large collection banner

### OpenSea data

Snapshot of live Robinhood Chain collections is in `src/data/opensea-robinhood-snapshot.json`.

Optional live refresh (events require a key):

```bash
# .env
VITE_OPENSEA_API_KEY=your_key
```

Docs: https://docs.opensea.io/docs/query-analytics-and-events  
Chain browse: https://opensea.io/collections/chain/robinhood

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- React Router
- Mock on-chain data (ready to wire to Robinhood Chain / contracts later)

## Run

```bash
cd openhood
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

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
