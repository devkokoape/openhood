# Deployments

| File | Purpose |
|------|---------|
| `hardhat.json` | Local hardhat network (ephemeral) |
| `robinhoodTestnet.json` | **Live** Robinhood testnet addresses (after deploy) |
| `deployer.address.txt` | Address to fund via faucet |

## Deploy to Robinhood testnet

1. Ensure `.env` has `DEPLOYER_PRIVATE_KEY`
2. Fund the address:
   - Faucet: https://faucet.testnet.chain.robinhood.com/
   - Or: `Get-Content deployments/deployer.address.txt`
3. Deploy:
   ```bash
   npm run contracts:deploy:testnet
   ```
   Or wait until funded automatically:
   ```bash
   node scripts/deploy-when-funded.cjs
   ```
4. Smoke test:
   ```bash
   npm run contracts:smoke:testnet
   ```
5. Copy `deployments/robinhoodTestnet.env` into project `.env` for the frontend.
