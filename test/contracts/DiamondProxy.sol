// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { AddressUtils } from "@solidstate/contracts/utils/AddressUtils.sol";
import { DiamondBase, DiamondBaseStorage } from "@solidstate/contracts/proxy/diamond/base/DiamondBase.sol";
import { DiamondReadable, IDiamondReadable } from "@solidstate/contracts/proxy/diamond/readable/DiamondReadable.sol";
import { DiamondWritable, IDiamondWritable } from "@solidstate/contracts/proxy/diamond/writable/DiamondWritable.sol";
import { Ownable, IERC173, OwnableStorage } from "@solidstate/contracts/access/ownable/Ownable.sol";
import { ERC165, IERC165, ERC165Storage } from "@solidstate/contracts/introspection/ERC165.sol";

struct Initialiser {
    address target;
    bytes data;
}

contract DiamondProxy is
    DiamondBase,
    DiamondReadable,
    DiamondWritable,
    Ownable,
    ERC165
{
    using AddressUtils for address;
    using DiamondBaseStorage for DiamondBaseStorage.Layout;
    using ERC165Storage for ERC165Storage.Layout;
    using OwnableStorage for OwnableStorage.Layout;

    constructor(address initTarget, bytes memory initData) {
        ERC165Storage.Layout storage erc165 = ERC165Storage.layout();
        bytes4[] memory selectors = new bytes4[](8);

        // register DiamondWritable
        selectors[0] = IDiamondWritable.diamondCut.selector;
        erc165.setSupportedInterface(type(IDiamondWritable).interfaceId, true);

        // register DiamondReadable
        selectors[1] = IDiamondReadable.facets.selector;
        selectors[2] = IDiamondReadable.facetFunctionSelectors.selector;
        selectors[3] = IDiamondReadable.facetAddresses.selector;
        selectors[4] = IDiamondReadable.facetAddress.selector;
        erc165.setSupportedInterface(type(IDiamondReadable).interfaceId, true);

        // register ERC165
        selectors[5] = IERC165.supportsInterface.selector;
        erc165.setSupportedInterface(type(IERC165).interfaceId, true);

        // register Ownable
        selectors[6] = Ownable.owner.selector;
        selectors[7] = Ownable.transferOwnership.selector;
        erc165.setSupportedInterface(type(IERC173).interfaceId, true);

        // diamond cut
        FacetCut[] memory facetCuts = new FacetCut[](1);

        facetCuts[0] = FacetCut({
            target: address(this),
            action: IDiamondWritable.FacetCutAction.ADD,
            selectors: selectors
        });

        DiamondBaseStorage.layout().diamondCut(facetCuts, address(0), "");

        // set owner
        OwnableStorage.layout().setOwner(msg.sender);

        require(
            initTarget.isContract(),
            "DiamondProxy: init target has no code"
        );

        (bool success, ) = initTarget.delegatecall(initData);

        if (!success) {
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
    }

    receive() external payable {}
}
