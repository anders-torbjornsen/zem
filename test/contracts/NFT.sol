// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ERC1967Upgrade } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Upgrade.sol";

contract NFT is ERC721Upgradeable, ERC1967Upgrade, OwnableUpgradeable {
    function init(string calldata name, string calldata symbol)
        public
        initializer
    {
        __ERC721_init(name, symbol);
    }

    function upgradeTo(address newImplementation) public onlyOwner {
        _upgradeTo(newImplementation);
    }
}
