import {Deployment} from "./deployment";

async function main()
{
    let deployment: Deployment = new Deployment("hardhat");

    deployment.writeToFile();
}

main().catch(e => {
    console.error(e);
    process.exitCode = 1;
});