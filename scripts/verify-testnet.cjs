/**
 * Verify OpenHood contracts on Robinhood testnet Blockscout.
 */
require("dotenv").config();
const hre = require("hardhat");
const dep = require("../deployments/robinhoodTestnet.json");

async function main() {
  const market = dep.contracts.OpenHoodMarketplace;
  const nft = dep.contracts.MockERC721;
  const feeRecipient = dep.feeRecipient;
  const feeBps = dep.feeBps;

  console.log("=== Verify on Robinhood testnet Blockscout ===\n");

  console.log("1) MockERC721", nft);
  try {
    await hre.run("verify:verify", {
      address: nft,
      constructorArguments: [
        "OpenHood Demo NFT",
        "OHD",
        "https://openhood.app/api/nft/",
      ],
      contract: "contracts/MockERC721.sol:MockERC721",
    });
    console.log("   ✓ MockERC721 verified\n");
  } catch (e) {
    const msg = e.message || String(e);
    if (/already verified/i.test(msg)) console.log("   ✓ already verified\n");
    else console.error("   ✗", msg.slice(0, 400), "\n");
  }

  console.log("2) OpenHoodMarketplace", market);
  try {
    await hre.run("verify:verify", {
      address: market,
      constructorArguments: [feeRecipient, feeBps],
      contract: "contracts/OpenHoodMarketplace.sol:OpenHoodMarketplace",
    });
    console.log("   ✓ OpenHoodMarketplace verified\n");
  } catch (e) {
    const msg = e.message || String(e);
    if (/already verified/i.test(msg)) console.log("   ✓ already verified\n");
    else console.error("   ✗", msg.slice(0, 400), "\n");
  }

  console.log("Explorer:");
  console.log(" ", dep.explorer.marketplace);
  console.log(" ", dep.explorer.nft);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
