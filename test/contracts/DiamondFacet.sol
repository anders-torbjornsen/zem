// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { DiamondReadable, IDiamondReadable } from "@solidstate/contracts/proxy/diamond/readable/DiamondReadable.sol";
import { DiamondWritable, IDiamondWritable } from "@solidstate/contracts/proxy/diamond/writable/DiamondWritable.sol";
import { ERC165Storage } from "@solidstate/contracts/introspection/ERC165Storage.sol";

contract DiamondFacet is DiamondReadable, DiamondWritable {
    using ERC165Storage for ERC165Storage.Layout;

    function init() external {
        ERC165Storage.Layout storage erc165 = ERC165Storage.layout();
        erc165.setSupportedInterface(type(IDiamondWritable).interfaceId, true);
        erc165.setSupportedInterface(type(IDiamondReadable).interfaceId, true);
    }
}
