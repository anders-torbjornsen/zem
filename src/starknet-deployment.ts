import "@shardlabs/starknet-hardhat-plugin/dist/type-extensions"

import {DeployOptions} from "@shardlabs/starknet-hardhat-plugin/dist/types";
import * as crypto from "crypto"
import * as fs from "fs";
import {HardhatRuntimeEnvironment, StarknetContract, StringMap} from "hardhat/types";

import {ContractDeployConfigStandard} from "./deployment"

export class StarknetDeployment
{
    private static readonly DEPLOYMENTS_DIR: string = "./starknet-deployments";
    public readonly hre: HardhatRuntimeEnvironment;
    public readonly jsonFilePath: string;
    public readonly instances: {[id: string]: StarknetContract};
    // using a similar shape to the json of L1
    // deployments for consistency
    private _json: {
        contracts: {
            [id: string]:
                {contract: string, address: string, bytecodeHash: string}
        }
    };

    constructor(hre: HardhatRuntimeEnvironment)
    {
        this.hre = hre;
        this.jsonFilePath = `${StarknetDeployment.DEPLOYMENTS_DIR}/${
            hre.config.starknet.network}.json`;
        this.instances = {};

        if (fs.existsSync(this.jsonFilePath))
        {
            this._json =
                JSON.parse(fs.readFileSync(this.jsonFilePath).toString());
        }
        else
        {
            this._json = {contracts: {}};
        }
    }

    public async deploy(
        contractConfig: ContractDeployConfigStandard,
        constructorArguments?: StringMap,
        options?: DeployOptions): Promise<StarknetContract>
    {
        console.log(`deploying ${contractConfig.id} | ${
            contractConfig.contract} | autoUpdate=${
            contractConfig.autoUpdate}`);

        const contractFactory =
            await this.hre.starknet.getContractFactory(contractConfig.contract);

        // HACK starknet-hardhat-plugin doesn't expose this
        const contractMetadataPath = (contractFactory as any).metadataPath;
        const hash = crypto.createHash("sha256");
        hash.update(JSON.parse(fs.readFileSync(contractMetadataPath).toString())
                        .program.data.join());
        const bytecodeHash = hash.digest("hex");

        const contractJson = this._json.contracts[contractConfig.id];
        if (contractJson !== undefined)
        {
            console.log(`${contractConfig.id} is already deployed at ${
                contractJson.address}`);

            if (contractJson.contract != contractConfig.contract)
            {
                throw `attempting to deploy contract '${
                    contractConfig.contract}' with id '${
                    contractConfig.id}' but existing contract is '${
                    contractJson
                        .contract}', if that's intentional then change the id of the contract in the deployment json or remote it entirely.`;
            }

            if (contractJson.bytecodeHash == bytecodeHash ||
                !contractConfig.autoUpdate)
            {
                return contractFactory.getContractAt(contractJson.address);
            }
            console.log(`${contractConfig.id} is out of date (${
                contractJson.bytecodeHash}), redeploying (${bytecodeHash})`);
        }

        const instance =
            await contractFactory.deploy(constructorArguments, options);

        console.log("deployed to", instance.address);

        this._json.contracts[contractConfig.id] = {
            contract: contractConfig.contract,
            address: instance.address,
            bytecodeHash: bytecodeHash
        };

        return instance;
    }

    public writeToFile(): void
    {
        if (!fs.existsSync(StarknetDeployment.DEPLOYMENTS_DIR))
        {
            fs.mkdirSync(StarknetDeployment.DEPLOYMENTS_DIR);
        }

        fs.writeFileSync(
            this.jsonFilePath, JSON.stringify(this._json, null, 4));
    }
}