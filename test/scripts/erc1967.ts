import { Deployment } from "../../src";
import hre from "hardhat";
import { NFT, Proxy } from "../typechain-types";

let deployment: Deployment;

async function main() {
    deployment = await Deployment.create(hre);

    const upgradeable = await deployment.deployERC1967(
        "upgradeable", {
        proxy: {
            contract: "TestProxy"
        },
        implementation: {
            contract: "NFT"
        }
    },
        async (proxy, newImplementation) => {
            const tx = (proxy as NFT).upgradeTo(newImplementation.address);
            await (await tx).wait();
        },
        (implementation) => {
            return [implementation.address, (implementation as NFT).interface.encodeFunctionData("init", ["My NFT", "MNFT"])];
        });

    console.log(await upgradeable.name());
    console.log(await upgradeable.symbol());
}

main().catch(e => console.error(e)).finally(() => {
    if (deployment !== undefined && deployment.hre.network.name != "hardhat") {
        console.log("saving to file");
        deployment.writeToFile();
    }
});