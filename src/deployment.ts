import * as fs from "fs";

type DeployedContracts = {
    contracts: any; artifacts: any;
}

export class Deployment
{
    jsonFilePath: string;
    deployedContracts: DeployedContracts;

    constructor(network: string)
    {
        this.jsonFilePath = `./deployments/${network}.json`;

        if (fs.existsSync(this.jsonFilePath))
        {
            this.deployedContracts =
                JSON.parse(fs.readFileSync(this.jsonFilePath).toString());
        }
        else
        {
            this.deployedContracts = {contracts: {}, artifacts: {}};
        }
    }

    writeToFile(): void
    {
        // prune any unneeded artifacts
        try
        {
            if (!fs.existsSync("./deployments"))
            {
                fs.mkdirSync("./deployments");
            }

            let usedBuildInfoIds = new Set<string>();
            for (const contractId in this.deployedContracts.contracts)
            {
                let deployedContract =
                    this.deployedContracts.contracts[contractId];

                usedBuildInfoIds.add(deployedContract.buildInfo);

                if (this.deployedContracts.contracts[contractId]
                        .implementation != undefined)
                {
                    usedBuildInfoIds.add(
                        deployedContract.implementation.buildInfo);
                }
            }

            let toPrune: string[] = [];
            for (const buildInfoId in this.deployedContracts.artifacts)
            {
                if (!usedBuildInfoIds.has(buildInfoId) == undefined)
                {
                    toPrune.push(buildInfoId);
                }
            }

            for (let i = 0; i < toPrune.length; ++i)
            {
                delete this.deployedContracts.artifacts[toPrune[i]];
            }

            // clear output section of artifacts as it's massive, we can always
            // rebuild it when needed
            for (const artifact in this.deployedContracts.artifacts)
            {
                delete this.deployedContracts.artifacts[artifact].output;
            }
        }
        catch (e)
        {
            console.error("Deployment:writeToFile()", e);
        }

        fs.writeFileSync(
            this.jsonFilePath, JSON.stringify(this.deployedContracts, null, 4));
    }
}