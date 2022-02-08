// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Upgradeable is ERC1967ProxyImplementation
{
    uint256 public _number;
    string public _str;

    function init(uint256 number, string memory str) external initializer
    {
        _number = number;
        _str = str;
    }
}