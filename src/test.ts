import {Contract} from "ethers";
import * as hre from "hardhat"

import {Deployment} from "./deployment";

let deployment: Deployment;

async function main()
{
    await hre.run("compile");

    deployment = new Deployment(hre);

    let loot: Contract = await deployment.deploy(
        {id: "loot", contract: "contracts/Loot.sol:Loot", autoUpdate: true});

    console.log(await loot.getWeapon(0));

    let upgr: Contract = await deployment.deployERC1967(
        {
            id: "upgrade",
            proxy: {
                contract: "contracts/ERC1967Proxy.sol:ERC1967Proxy",
                autoUpdate: false
            },
            implementation: {
                contract: "contracts/Upgradeable.sol:Upgradeable",
                autoUpdate: true
            }
        },
        function(implementation: Contract) {
            return [
                implementation.address,
                implementation.interface.encodeFunctionData(
                    "init", [42, "the answer"])
            ];
        },
        async function(proxy: Contract, newImplementation: Contract) {
            // TODO check that removing this will make it fail
            await (await proxy.setImplementation(newImplementation.address))
                .wait();
        });

    console.log(await upgr._number(), await upgr._str());
}

main()
    .catch(e => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => {
        deployment.writeToFile();
    })