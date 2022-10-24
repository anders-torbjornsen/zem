import { Deployment } from "../../src";
import hre from "hardhat";
import { LibTest } from "../typechain-types/contracts/LibraryTest.sol";

let deployment: Deployment;

async function main() {
    deployment = await Deployment.create(hre);

    const testLib1 = await deployment.deploy("testLib1", { contract: "TestLib1", autoUpdate: true });
    const testLib2 = await deployment.deploy("testLib2", { contract: "TestLib2", autoUpdate: true });

    const libTest = await deployment.deploy(
        "libTest", {
        contract: "LibTest",
        autoUpdate: true,
        linkTable: {
            TestLib1: testLib1.address,
            TestLib2: testLib2.address
        }
    }) as LibTest;

    console.log(await libTest.foo(42));
    console.log(await libTest.bar(42));
}

main().catch(e => console.error(e)).finally(() => {
    if (deployment !== undefined && deployment.hre.network.name != "hardhat") {
        console.log("saving to file");
        deployment.writeToFile();
    }
});