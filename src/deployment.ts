import * as fs from 'fs';

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
            if (!fs.existsSync('./deployments'))
            {
                fs.mkdirSync('./deployments');
            }

            interface UsedBuildInfoIds
            {
                [key: string]: boolean;
            }

            let usedBuildInfoIds: UsedBuildInfoIds = {};
            for (const contractId in this.deployedContracts.contracts)
            {
                usedBuildInfoIds[this.deployedContracts.contracts[contractId]
                                     .buildInfo] = true;

                if (this.deployedContracts.contracts[contractId]
                        .implementation != undefined)
                {
                    usedBuildInfoIds[this.deployedContracts
                                         .contracts[contractId]
                                         .implementation.buildInfo] = true;
                }
            }

            let toPrune = [];
            for (const buildInfo in this.deployedContracts.artifacts)
            {
                if (usedBuildInfoIds[buildInfo] == undefined)
                {
                    toPrune.push(buildInfo);
                }
            }

            for (let i = 0; i < toPrune.length; ++i)
            {
                delete this.deployedContracts.artifacts[toPrune[i]];
            }

            for (const artifact in this.deployedContracts.artifacts)
            {
                delete this.deployedContracts.artifacts[artifact].output;
            }
        }
        catch (e)
        {
            console.error('Deployment:writeToFile()', e);
        }

        fs.writeFileSync(
            this.jsonFilePath, JSON.stringify(this.deployedContracts, null, 4));
    }
}