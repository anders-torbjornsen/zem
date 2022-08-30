// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

// ERC721 - NFT
// ERC173 - Ownership
// ERC165 - Interface Detection

import { ERC721Metadata, ERC721MetadataStorage } from "@solidstate/contracts/token/ERC721/metadata/ERC721Metadata.sol";
import { IERC721, ERC721Base, ERC721BaseInternal } from "@solidstate/contracts/token/ERC721/base/ERC721Base.sol";
import { ERC165, IERC165, ERC165Storage } from "@solidstate/contracts/introspection/ERC165.sol";

contract NFTFacet is ERC721Base, ERC721Metadata, ERC165 {
    using ERC165Storage for ERC165Storage.Layout;

    function __NFTFacet_init(
        string calldata name,
        string calldata symbol,
        string calldata baseURI
    ) external {
        ERC721MetadataStorage.Layout storage l = ERC721MetadataStorage.layout();
        l.name = name;
        l.symbol = symbol;
        l.baseURI = baseURI;

        ERC165Storage.Layout storage erc165 = ERC165Storage.layout();
        erc165.setSupportedInterface(type(IERC165).interfaceId, true);
        erc165.setSupportedInterface(type(IERC721).interfaceId, true);
    }

    function mint(address account, uint256 tokenId) external {
        _mint(account, tokenId);
    }

    function burn(uint256 tokenId) external {
        _burn(tokenId);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721BaseInternal, ERC721Metadata) {
        super._beforeTokenTransfer(from, to, tokenId);
    }
}
