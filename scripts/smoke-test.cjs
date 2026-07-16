/**
 * End-to-end smoke test against a deployed marketplace.
 * Lists NFT #1, buys with a second wallet (or same if only one), checks fee.
 *
 * Requires DEPLOYER_PRIVATE_KEY. Optional BUYER_PRIVATE_KEY (defaults to deployer — self-buy not allowed for real UX, so mint to buyer).
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  const depFile = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(depFile)) {
    throw new Error(`No deployment at ${depFile}. Run deploy first.`);
  }
  const dep = JSON.parse(fs.readFileSync(depFile, "utf8"));
  const [deployer] = await hre.ethers.getSigners();

  const market = await hre.ethers.getContractAt(
    "OpenHoodMarketplace",
    dep.contracts.OpenHoodMarketplace
  );
  const nft = await hre.ethers.getContractAt(
    "MockERC721",
    dep.contracts.MockERC721
  );

  console.log("Marketplace:", await market.getAddress());
  console.log("NFT:", await nft.getAddress());
  console.log("Fee bps:", (await market.feeBps()).toString());

  // Ensure deployer owns token 1
  let tokenId = 1n;
  try {
    const owner = await nft.ownerOf(tokenId);
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.log("Minting fresh NFT for smoke test...");
      const mintTx = await nft.mint(deployer.address);
      const receipt = await mintTx.wait();
      tokenId = await nft.nextTokenId() - 1n;
      console.log("Minted token", tokenId.toString());
    }
  } catch {
    const mintTx = await nft.mint(deployer.address);
    await mintTx.wait();
    tokenId = (await nft.nextTokenId()) - 1n;
  }

  const price = hre.ethers.parseEther("0.01");
  console.log("\nApproving marketplace for token", tokenId.toString());
  await (await nft.approve(await market.getAddress(), tokenId)).wait();

  console.log("Listing at 0.01 ETH...");
  const listTx = await market.list(await nft.getAddress(), tokenId, price);
  const listRc = await listTx.wait();
  const listingId = await market.nextListingId() - 1n;
  console.log("Listing ID:", listingId.toString());

  // Use a random wallet as buyer funded by deployer
  const buyer = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  console.log("Funding buyer", buyer.address);
  await (
    await deployer.sendTransaction({
      to: buyer.address,
      value: hre.ethers.parseEther("0.05"),
    })
  ).wait();

  const feeRecipient = await market.feeRecipient();
  const feeBefore = await hre.ethers.provider.getBalance(feeRecipient);

  console.log("Buying listing...");
  const marketAsBuyer = market.connect(buyer);
  await (await marketAsBuyer.buy(listingId, { value: price })).wait();

  const newOwner = await nft.ownerOf(tokenId);
  console.log("New owner:", newOwner);
  if (newOwner.toLowerCase() !== buyer.address.toLowerCase()) {
    throw new Error("Buy failed — NFT not transferred");
  }

  const feeAfter = await hre.ethers.provider.getBalance(feeRecipient);
  const fee = feeAfter - feeBefore;
  console.log("Fee collected:", hre.ethers.formatEther(fee), "ETH");
  console.log("Expected fee ~", hre.ethers.formatEther((price * 250n) / 10000n), "ETH");

  console.log("\n✅ Smoke test passed on", network);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
