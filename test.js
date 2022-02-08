const {Deployment} = require("./lib/deployment.js");

async function main()
{
    let deployment = new Deployment("hardhat");

    deployment.writeToFile();
}

main().catch(e => {
    console.error(e);
    process.exitCode = 1;
});