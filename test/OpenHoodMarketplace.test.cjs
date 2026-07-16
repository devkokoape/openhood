const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("OpenHoodMarketplace", function () {
  async function deployFixture() {
    const [owner, seller, buyer, bidder2, feeTo] = await ethers.getSigners();

    const NFT = await ethers.getContractFactory("MockERC721");
    const nft = await NFT.deploy("OpenHood Test", "OHT", "https://openhood.test/");
    await nft.waitForDeployment();

    const Market = await ethers.getContractFactory("OpenHoodMarketplace");
    const market = await Market.deploy(feeTo.address, 250); // 2.5%
    await market.waitForDeployment();

    // mint 3 NFTs to seller
    await nft.mint(seller.address);
    await nft.mint(seller.address);
    await nft.mint(seller.address);

    return { market, nft, owner, seller, buyer, bidder2, feeTo };
  }

  it("deploys with fee config", async function () {
    const { market, feeTo } = await deployFixture();
    expect(await market.feeBps()).to.equal(250);
    expect(await market.feeRecipient()).to.equal(feeTo.address);
  });

  it("lists and buys with protocol fee", async function () {
    const { market, nft, seller, buyer, feeTo } = await deployFixture();
    const price = ethers.parseEther("1.0");
    const marketAddr = await market.getAddress();

    await nft.connect(seller).approve(marketAddr, 1);
    await market.connect(seller).list(await nft.getAddress(), 1, price);

    const feeBefore = await ethers.provider.getBalance(feeTo.address);
    const sellerBefore = await ethers.provider.getBalance(seller.address);

    await market.connect(buyer).buy(1, { value: price });

    expect(await nft.ownerOf(1)).to.equal(buyer.address);

    const fee = (price * 250n) / 10000n;
    const feeAfter = await ethers.provider.getBalance(feeTo.address);
    const sellerAfter = await ethers.provider.getBalance(seller.address);

    expect(feeAfter - feeBefore).to.equal(fee);
    expect(sellerAfter - sellerBefore).to.equal(price - fee);
  });

  it("cancels listing and returns NFT", async function () {
    const { market, nft, seller } = await deployFixture();
    const marketAddr = await market.getAddress();
    await nft.connect(seller).approve(marketAddr, 2);
    await market.connect(seller).list(await nft.getAddress(), 2, ethers.parseEther("0.5"));
    await market.connect(seller).cancelListing(1);
    expect(await nft.ownerOf(2)).to.equal(seller.address);
  });

  it("runs English auction with fee on settle", async function () {
    const { market, nft, seller, buyer, bidder2, feeTo } = await deployFixture();
    const marketAddr = await market.getAddress();
    const reserve = ethers.parseEther("0.1");

    await nft.connect(seller).approve(marketAddr, 3);
    await market
      .connect(seller)
      .createAuction(await nft.getAddress(), 3, reserve, 3600);

    await market.connect(buyer).bid(1, { value: ethers.parseEther("0.1") });
    await market.connect(bidder2).bid(1, { value: ethers.parseEther("0.2") });

    // first bidder refunded
    // advance time past end
    await time.increase(3601);

    const feeBefore = await ethers.provider.getBalance(feeTo.address);
    await market.connect(buyer).settleAuction(1);

    expect(await nft.ownerOf(3)).to.equal(bidder2.address);
    const fee = (ethers.parseEther("0.2") * 250n) / 10000n;
    const feeAfter = await ethers.provider.getBalance(feeTo.address);
    expect(feeAfter - feeBefore).to.equal(fee);
  });

  it("rejects buy with wrong payment", async function () {
    const { market, nft, seller, buyer } = await deployFixture();
    const marketAddr = await market.getAddress();
    await nft.connect(seller).approve(marketAddr, 1);
    await market
      .connect(seller)
      .list(await nft.getAddress(), 1, ethers.parseEther("1"));
    await expect(
      market.connect(buyer).buy(1, { value: ethers.parseEther("0.5") })
    ).to.be.revertedWithCustomError(market, "WrongPayment");
  });

  it("owner can update fee", async function () {
    const { market, owner, feeTo } = await deployFixture();
    await market.connect(owner).setFee(500, feeTo.address);
    expect(await market.feeBps()).to.equal(500);
  });
});
