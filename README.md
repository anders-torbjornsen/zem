<img src="https://raw.githubusercontent.com/anders-torbjornsen/zem/main/zem.png" width=300 height=300/>

[![NPM Package](https://img.shields.io/npm/v/@anders-t/zem.svg?style=flat-square)](https://www.npmjs.com/package/@anders-t/zem)
---
# Zem

An Ethereum/Starknet smart contract deployment system for [Hardhat](https://github.com/nomiclabs/hardhat) written in Typescript.

Create a deployment script for your project, create a Zem Deployment object and use it to deploy your contracts, and at the end of the script call `writeToFile()` on your Deployment object (see below for examples). The first time you run your deployment script, your contracts will be deployed, but on subsequent runs Zem will load the saved file and use the existing instances of your contracts which were deployed before. The standard input json is also stored to the deployment file, which means you automatically have information you might need for debugging, verifying, etc. Zem will detect if a deployed contract is outdated, and can optionally automatically redeploy your contracts, including handling ERC1967 proxy contracts.

## Installation

`npm install --save-dev @anders-t/zem`

## Ethereum Example

```ts
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

## Starknet Example
```ts
// hardhat.config.ts

import "@playmint/hardhat-starknetjs";
import "@playmint/hardhat-starknet-compile";
import { HardhatUserConfig } from "hardhat/types/config";


const config: HardhatUserConfig =
{
    solidity: "0.8.9",
    starknetjs: {
        networks: {
            devnet: {
                baseUrl: "http://localhost:5000"
            }
        }
    }
};

export default config;
```

```ts
// deploy.ts
// This script can be run as many times as you like, it will only deploy what isn't already deployed

import hre from "hardhat";
import { StarknetDeployment } from "@anders-t/zem";

let deployment: Deployment;

async function main()
{
    await hre.run("starknet-compile");

    deployment = new StarknetDeployment(hre);

    const contract = await deployment.deploy({
        id: "contract",
        contract: "Contract.cairo",
        autoUpdate: true
    }, 
    [1, 42]); // array of constructor args (omit this if there's no constructor)

    console.log(await contract.get_number());
    await contract.set_number(21);

    // you can also get contract instances from the deployment
    console.log(await deployment.instances.contract.get_number());
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
