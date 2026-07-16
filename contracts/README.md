# OpenHood Marketplace Contracts

Controls **fixed-price listings** and **English auctions**, and takes a **protocol fee** on every settled trade.

## Contracts

| Contract | Role |
|----------|------|
| `OpenHoodMarketplace` | List / buy / cancel · auction / bid / settle · fee routing |
| `MockERC721` | Demo NFT for testnet smoke tests |

### Fee model
- Default **2.5%** (`feeBps = 250`) of sale price → `feeRecipient`
- Remainder → seller
- Owner can update fee (max 10%) via `setFee`

### Flow
1. Seller `approve`s marketplace for NFT (or `setApprovalForAll`)
2. **List** → NFT escrowed in marketplace  
   **or Auction** → NFT escrowed, bidders pay ETH, outbid refunds auto
3. **Buy** / **settleAuction** → NFT to buyer, ETH split (fee + seller)

## Networks

| Network | Chain ID | RPC |
|---------|----------|-----|
| Hardhat (local) | 31337 | — |
| **Robinhood Testnet** | **46630** | `https://rpc.testnet.chain.robinhood.com` |
| Robinhood Mainnet | 4663 | `https://rpc.mainnet.chain.robinhood.com` |

Explorer (testnet): https://explorer.testnet.chain.robinhood.com  
Faucet: https://faucet.testnet.chain.robinhood.com/

## Commands

```bash
# unit tests (local hardhat)
npm run contracts:test

# compile
npm run contracts:compile

# deploy local
npm run contracts:deploy:local

# deploy Robinhood testnet (needs funded DEPLOYER_PRIVATE_KEY in .env)
npm run contracts:deploy:testnet

# smoke test on testnet (list + buy + fee)
npm run contracts:smoke:testnet
```

## Env

Copy `.env.example` → `.env`:

```
DEPLOYER_PRIVATE_KEY=0x...
RH_TESTNET_RPC=https://rpc.testnet.chain.robinhood.com
FEE_RECIPIENT=0x...   # optional, defaults to deployer
```

After deploy, addresses are written to:
- `deployments/robinhoodTestnet.json`
- `deployments/robinhoodTestnet.env` (for Vite frontend)
