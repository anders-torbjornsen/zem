// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { DiamondBase, DiamondBaseStorage } from "@solidstate/contracts/proxy/diamond/base/DiamondBase.sol";
import { IDiamondWritable } from "@solidstate/contracts/proxy/diamond/writable/IDiamondWritable.sol";

struct FacetInitialiser {
    IDiamondWritable.FacetCut[] facetCuts;
    address target;
    bytes data;
}

contract DiamondProxyEmpty is DiamondBase {
    using DiamondBaseStorage for DiamondBaseStorage.Layout;

    constructor(FacetInitialiser[] memory init) {
        for (uint256 i = 0; i < init.length; ++i) {
            DiamondBaseStorage.layout().diamondCut(
                init[i].facetCuts,
                init[i].target,
                init[i].data
            );
        }
    }
}
