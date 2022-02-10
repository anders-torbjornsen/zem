# Zem

An Ethereum smart contracts deployment system for [Hardhat](https://github.com/nomiclabs/hardhat).

Zem manages deployments, storing what contracts are deployed where, the versions of those contracts and can automatically redeploy them if desired. Also handles ERC1967 upgradeable proxy contracts. It stores a json file on a per-network basis to keep track of all of this.

## Installation

`npm install --save-dev @anders-t/zem`

## Usage

```
// deploy.ts
// This script can be run as many times as you like, it will only deploy what isn't already deployed

import {Deployment} from "@anders-t/zem";
import * as hre from "hardhat";
import {Contract} from "ethers";

let deployment: Deployment;

async function main()
{
    deployment = new Deployment(hre);

    // Standard contract example
    const regularContract: Contract = await deployment.deploy({
        id: "regularContract",
        contract: "contracts/RegularContract.sol:RegularContract",
        autoUpdate: true
    }, "This is a constructor arg", 42);

    // ERC1967 Example
    const proxyConstructorArgs = (implementation: Contract) => 
    {
        // proxy contract constructor looks like:
        // constructor(address _logic, bytes memory _data)
        //
        // _data is forwarded to the implementation contract to initialise it
        return [implementation.address, implementation.interface.encodeFunctionData("init", ["This is an argument for init()", "so is this"])];
    };
    const upgradeContract = async (proxy: Contract, newImplementation:Contract) =>
    {
        await (await proxy.upgradeTo(newImplementation.address)).wait();
    };
    const upgradeable: Contract = await deployment.deployERC1967({
        id: "upgradeable",
        proxy: {
            contract: "contracts/Proxy.sol:MyProxy",
            autoUpdate: false
        },
        implementation: {
            contract: "contracts/Upgradeable.sol:Upgradeable",
            autoUpdate: true
        }
    },
    proxyConstructorArgs,
    upgradeContract);
}

main()
    .catch((e) =>
    {
        console.error(e);
    }).finally(() =>
    {
        if (deployment != undefined)
        {
            deployment.writeToFile();
        }
    });
```
