/**
 * Poll Robinhood testnet until deployer has ETH, then deploy.
 * Usage: node scripts/deploy-when-funded.cjs
 * (loads DEPLOYER_PRIVATE_KEY from .env)
 */
require("dotenv").config();
const { spawn } = require("child_process");
const { ethers } = require("ethers");

const RPC = process.env.RH_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com";
const KEY = process.env.DEPLOYER_PRIVATE_KEY;

async function main() {
  if (!KEY) throw new Error("Set DEPLOYER_PRIVATE_KEY in .env");
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(KEY, provider);
  console.log("Deployer:", wallet.address);
  console.log("Fund at: https://faucet.testnet.chain.robinhood.com/");
  console.log("Waiting for balance > 0 ...");

  for (;;) {
    const bal = await provider.getBalance(wallet.address);
    console.log(new Date().toISOString(), "balance:", ethers.formatEther(bal), "ETH");
    if (bal > 0n) break;
    await new Promise((r) => setTimeout(r, 15000));
  }

  console.log("Funded — deploying...");
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["hardhat", "run", "scripts/deploy.cjs", "--network", "robinhoodTestnet"],
    { stdio: "inherit", shell: true, env: process.env }
  );
  child.on("exit", (code) => process.exit(code ?? 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
