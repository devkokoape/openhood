// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Test NFT for OpenHood marketplace on Robinhood testnet
contract MockERC721 is ERC721, Ownable {
    uint256 public nextTokenId = 1;
    string private _base;

    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        _base = baseURI_;
    }

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
    }

    function mintBatch(address to, uint256 count) external returns (uint256 firstId) {
        firstId = nextTokenId;
        for (uint256 i = 0; i < count; i++) {
            uint256 id = nextTokenId++;
            _safeMint(to, id);
        }
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _base = baseURI_;
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }
}
