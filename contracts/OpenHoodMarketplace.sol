// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OpenHoodMarketplace
 * @notice Fixed-price listings + English auctions with protocol fee on every trade.
 * @dev Deployed on Robinhood Chain. Seller must approve this contract for the NFT.
 *
 * Fee model: feeBps of sale price goes to feeRecipient; remainder to seller.
 * Auctions: highest bid wins after endTime; previous bids are refunded on outbid.
 */
contract OpenHoodMarketplace is ReentrancyGuard, Ownable, IERC721Receiver {
    // ─── Config ─────────────────────────────────────────────────────────────
    uint96 public feeBps; // e.g. 250 = 2.5%
    address public feeRecipient;
    uint96 public constant MAX_FEE_BPS = 1000; // 10% cap

    // ─── Listings ───────────────────────────────────────────────────────────
    struct Listing {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 price; // wei (native ETH)
        bool active;
    }

    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) public listings;
    // nft => tokenId => listingId (0 = none)
    mapping(address => mapping(uint256 => uint256)) public listingIdOf;

    // ─── Auctions ───────────────────────────────────────────────────────────
    struct Auction {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 reservePrice;
        uint256 highestBid;
        address highestBidder;
        uint64 endTime;
        bool settled;
        bool active;
    }

    uint256 public nextAuctionId = 1;
    mapping(uint256 => Auction) public auctions;
    mapping(address => mapping(uint256 => uint256)) public auctionIdOf;

    // ─── Events ─────────────────────────────────────────────────────────────
    event FeeUpdated(uint96 feeBps, address feeRecipient);
    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        address indexed nft,
        uint256 tokenId,
        uint256 price
    );
    event ListingCancelled(uint256 indexed listingId);
    event ListingPriceUpdated(uint256 indexed listingId, uint256 newPrice);
    event Bought(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        address nft,
        uint256 tokenId,
        uint256 price,
        uint256 fee
    );
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nft,
        uint256 tokenId,
        uint256 reservePrice,
        uint64 endTime
    );
    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );
    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        address indexed seller,
        uint256 price,
        uint256 fee
    );
    event AuctionCancelled(uint256 indexed auctionId);

    error InvalidFee();
    error InvalidPrice();
    error NotSeller();
    error NotActive();
    error WrongPayment();
    error AlreadyListed();
    error AuctionLive();
    error AuctionEnded();
    error AuctionNotEnded();
    error BidTooLow();
    error ZeroAddress();
    error TransferFailed();

    constructor(address _feeRecipient, uint96 _feeBps) Ownable(msg.sender) {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        if (_feeBps > MAX_FEE_BPS) revert InvalidFee();
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
        emit FeeUpdated(_feeBps, _feeRecipient);
    }

    // ─── Admin ──────────────────────────────────────────────────────────────
    function setFee(uint96 _feeBps, address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        if (_feeBps > MAX_FEE_BPS) revert InvalidFee();
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
        emit FeeUpdated(_feeBps, _feeRecipient);
    }

    // ─── Fixed-price listings ───────────────────────────────────────────────
    function list(
        address nft,
        uint256 tokenId,
        uint256 price
    ) external nonReentrant returns (uint256 listingId) {
        if (price == 0) revert InvalidPrice();
        if (listingIdOf[nft][tokenId] != 0) revert AlreadyListed();
        if (auctionIdOf[nft][tokenId] != 0) revert AlreadyListed();

        IERC721 token = IERC721(nft);
        // Escrow NFT in marketplace for clean settlement
        token.safeTransferFrom(msg.sender, address(this), tokenId);

        listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            price: price,
            active: true
        });
        listingIdOf[nft][tokenId] = listingId;

        emit Listed(listingId, msg.sender, nft, tokenId, price);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage L = listings[listingId];
        if (!L.active) revert NotActive();
        if (L.seller != msg.sender) revert NotSeller();

        L.active = false;
        listingIdOf[L.nft][L.tokenId] = 0;

        IERC721(L.nft).safeTransferFrom(address(this), L.seller, L.tokenId);
        emit ListingCancelled(listingId);
    }

    function updateListingPrice(uint256 listingId, uint256 newPrice) external {
        Listing storage L = listings[listingId];
        if (!L.active) revert NotActive();
        if (L.seller != msg.sender) revert NotSeller();
        if (newPrice == 0) revert InvalidPrice();
        L.price = newPrice;
        emit ListingPriceUpdated(listingId, newPrice);
    }

    function buy(uint256 listingId) external payable nonReentrant {
        Listing storage L = listings[listingId];
        if (!L.active) revert NotActive();
        if (msg.value != L.price) revert WrongPayment();

        L.active = false;
        listingIdOf[L.nft][L.tokenId] = 0;

        uint256 fee = (msg.value * feeBps) / 10_000;
        uint256 sellerProceeds = msg.value - fee;

        IERC721(L.nft).safeTransferFrom(address(this), msg.sender, L.tokenId);

        _pay(L.seller, sellerProceeds);
        if (fee > 0) _pay(feeRecipient, fee);

        emit Bought(
            listingId,
            msg.sender,
            L.seller,
            L.nft,
            L.tokenId,
            msg.value,
            fee
        );
    }

    // ─── English auctions ───────────────────────────────────────────────────
    function createAuction(
        address nft,
        uint256 tokenId,
        uint256 reservePrice,
        uint64 durationSeconds
    ) external nonReentrant returns (uint256 auctionId) {
        if (reservePrice == 0) revert InvalidPrice();
        if (durationSeconds < 60) revert InvalidPrice(); // min 1 minute
        if (listingIdOf[nft][tokenId] != 0) revert AlreadyListed();
        if (auctionIdOf[nft][tokenId] != 0) revert AlreadyListed();

        IERC721(nft).safeTransferFrom(msg.sender, address(this), tokenId);

        uint64 endTime = uint64(block.timestamp) + durationSeconds;
        auctionId = nextAuctionId++;
        auctions[auctionId] = Auction({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            reservePrice: reservePrice,
            highestBid: 0,
            highestBidder: address(0),
            endTime: endTime,
            settled: false,
            active: true
        });
        auctionIdOf[nft][tokenId] = auctionId;

        emit AuctionCreated(
            auctionId,
            msg.sender,
            nft,
            tokenId,
            reservePrice,
            endTime
        );
    }

    function bid(uint256 auctionId) external payable nonReentrant {
        Auction storage A = auctions[auctionId];
        if (!A.active || A.settled) revert NotActive();
        if (block.timestamp >= A.endTime) revert AuctionEnded();

        uint256 minBid = A.highestBid == 0
            ? A.reservePrice
            : A.highestBid + (A.highestBid * 5) / 100; // +5% min raise
        if (minBid == A.highestBid) minBid = A.highestBid + 1;
        if (msg.value < minBid) revert BidTooLow();

        address prevBidder = A.highestBidder;
        uint256 prevBid = A.highestBid;

        A.highestBidder = msg.sender;
        A.highestBid = msg.value;

        // Soft close: extend 2 minutes if bid in last 2 minutes
        if (A.endTime - block.timestamp < 120) {
            A.endTime = uint64(block.timestamp + 120);
        }

        if (prevBidder != address(0) && prevBid > 0) {
            _pay(prevBidder, prevBid);
        }

        emit BidPlaced(auctionId, msg.sender, msg.value);
    }

    function settleAuction(uint256 auctionId) external nonReentrant {
        Auction storage A = auctions[auctionId];
        if (!A.active || A.settled) revert NotActive();
        if (block.timestamp < A.endTime) revert AuctionNotEnded();

        A.settled = true;
        A.active = false;
        auctionIdOf[A.nft][A.tokenId] = 0;

        if (A.highestBidder == address(0)) {
            // No bids — return NFT to seller
            IERC721(A.nft).safeTransferFrom(address(this), A.seller, A.tokenId);
            emit AuctionSettled(auctionId, address(0), A.seller, 0, 0);
            return;
        }

        uint256 price = A.highestBid;
        uint256 fee = (price * feeBps) / 10_000;
        uint256 sellerProceeds = price - fee;

        IERC721(A.nft).safeTransferFrom(
            address(this),
            A.highestBidder,
            A.tokenId
        );
        _pay(A.seller, sellerProceeds);
        if (fee > 0) _pay(feeRecipient, fee);

        emit AuctionSettled(
            auctionId,
            A.highestBidder,
            A.seller,
            price,
            fee
        );
    }

    /// @notice Cancel auction only if no bids yet and still active
    function cancelAuction(uint256 auctionId) external nonReentrant {
        Auction storage A = auctions[auctionId];
        if (!A.active || A.settled) revert NotActive();
        if (A.seller != msg.sender) revert NotSeller();
        if (A.highestBidder != address(0)) revert AuctionLive();

        A.active = false;
        A.settled = true;
        auctionIdOf[A.nft][A.tokenId] = 0;

        IERC721(A.nft).safeTransferFrom(address(this), A.seller, A.tokenId);
        emit AuctionCancelled(auctionId);
    }

    // ─── Views ──────────────────────────────────────────────────────────────
    function quoteFee(uint256 price) external view returns (uint256 fee, uint256 sellerGets) {
        fee = (price * feeBps) / 10_000;
        sellerGets = price - fee;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    receive() external payable {}
}
