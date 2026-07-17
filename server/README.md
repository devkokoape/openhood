# OpenHood Indexer (Fly.io)

Server-side OpenSea indexer so collection pages load in milliseconds for every user.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| GET | `/v1/status` | Sync meta + queue + analytics counts |
| GET | `/v1/collections` | Summaries |
| GET | `/v1/collections/:slug` | Full listings + activity + offers |
| GET | `/v1/collections/:slug?lite=1` | Smaller payload (first 200 listed) |
| GET | `/v1/collections/:slug/nfts/:tokenId` | Single NFT metadata |
| GET | `/v1/nfts/:id` | Resolve NFT by route id (detail page) |
| POST | `/v1/analytics/visit` | Record marketplace page view (browser) |
| GET | `/v1/analytics/dashboard` | Admin: visits, geo, users, data collection |
| POST | `/v1/sync` | Sync next batch (`x-sync-secret`) |
| POST | `/v1/sync/:slug` | Force one collection |

### Analytics / privacy
- Visits store **hashed IP**, country/city (ipapi.co + locale), path, device, optional wallet.
- No full raw IP is persisted.
- Set `ADMIN_DASHBOARD_OPEN=0` + `SYNC_SECRET` to require `x-admin-key` on dashboard GET.

## Local

```bash
cd server
# optional: copy OpenSea key
set OPENSEA_API_KEY=your_key   # Windows PowerShell: $env:OPENSEA_API_KEY="..."
npm start
# → http://localhost:8080/v1/collections/gremlin-cartel
```

One-shot warm (no HTTP):

```bash
npm run sync:once
```

## Deploy to Fly

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
cd server
fly auth login
fly launch --no-deploy --copy-config --name openhood-indexer
# Create volume once (if launch didn't):
fly volumes create openhood_data --region iad --size 1

fly secrets set OPENSEA_API_KEY=your_opensea_key
fly secrets set SYNC_SECRET=long-random-string

fly deploy
fly status
fly open /health
```

App URL example: `https://openhood-indexer.fly.dev`

## Wire the frontend

In root `.env` / GitHub secret:

```env
VITE_INDEXER_URL=https://openhood-indexer.fly.dev
```

GitHub Actions: set secret `INDEXER_URL` (see deploy workflow).

## Env

| Var | Default | Meaning |
|-----|---------|---------|
| `OPENSEA_API_KEY` | — | Required for live OpenSea |
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `/data` | Persist JSON store |
| `SYNC_INTERVAL_MS` | `45000` | Batch loop |
| `SYNC_BATCH` | `3` | Collections per loop |
| `INDEX_SLUGS` | priority list | Comma slugs to index |
| `ENRICH_LIMIT` | `60` | NFT images to fetch per sync |
| `SYNC_SECRET` | — | Protect POST /v1/sync |
| `CORS_ORIGIN` | `*` | Browser origin |
