// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

library TestLib1 {
    function foo(uint256 a) public pure returns (uint256) {
        return a * 2;
    }
}

library TestLib2 {
    function bar(uint256 a) public pure returns (uint256) {
        return a * a;
    }
}

contract LibTest {
    function foo(uint256 a) public pure returns (uint256) {
        return TestLib1.foo(a);
    }

    function bar(uint256 a) public pure returns (uint256) {
        return TestLib2.bar(a);
    }
}
