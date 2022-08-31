// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { DiamondReadable, IDiamondReadable } from "@solidstate/contracts/proxy/diamond/readable/DiamondReadable.sol";
import { DiamondWritable, IDiamondWritable } from "@solidstate/contracts/proxy/diamond/writable/DiamondWritable.sol";
import { ERC165Storage } from "@solidstate/contracts/introspection/ERC165Storage.sol";
import { Ownable, IERC173, OwnableStorage } from "@solidstate/contracts/access/ownable/Ownable.sol";

contract DiamondFacet is DiamondReadable, DiamondWritable, Ownable {
    using ERC165Storage for ERC165Storage.Layout;
    using OwnableStorage for OwnableStorage.Layout;

    function __DiamondFacet_init() external {
        ERC165Storage.Layout storage erc165 = ERC165Storage.layout();
        erc165.setSupportedInterface(type(IDiamondWritable).interfaceId, true);
        erc165.setSupportedInterface(type(IDiamondReadable).interfaceId, true);
        erc165.setSupportedInterface(type(IERC173).interfaceId, true);
        OwnableStorage.layout().setOwner(msg.sender);
    }
}
