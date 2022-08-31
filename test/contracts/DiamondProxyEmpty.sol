// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { DiamondBase, DiamondBaseStorage } from "@solidstate/contracts/proxy/diamond/base/DiamondBase.sol";
import { IDiamondWritable } from "@solidstate/contracts/proxy/diamond/writable/IDiamondWritable.sol";
import { AddressUtils } from "@solidstate/contracts/utils/AddressUtils.sol";

struct Initialiser {
    address target;
    bytes data;
}

contract DiamondProxyEmpty is DiamondBase {
    using DiamondBaseStorage for DiamondBaseStorage.Layout;
    using AddressUtils for address;

    constructor(
        IDiamondWritable.FacetCut[] memory facetCuts,
        Initialiser[] memory init
    ) {
        DiamondBaseStorage.layout().diamondCut(facetCuts, address(0), "");

        for (uint256 i = 0; i < init.length; ++i) {
            require(
                (init[i].target == address(0)) == (init[i].data.length == 0),
                "DiamondProxy: invalid init params"
            );

            if (init[i].target != address(0)) {
                require(
                    init[i].target.isContract(),
                    "DiamondProxy: init target has no code"
                );

                (bool success, ) = init[i].target.delegatecall(init[i].data);

                if (!success) {
                    assembly {
                        returndatacopy(0, 0, returndatasize())
                        revert(0, returndatasize())
                    }
                }
            }
        }
    }
}
