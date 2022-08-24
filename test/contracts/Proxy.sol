// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract TestProxy is ERC1967Proxy {
    constructor(address logic, bytes memory data)
        payable
        ERC1967Proxy(logic, data)
    {}
}
