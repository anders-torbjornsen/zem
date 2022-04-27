import "@shardlabs/starknet-hardhat-plugin/dist/type-extensions"

import {DeployOptions} from "@shardlabs/starknet-hardhat-plugin/dist/types";
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
    private _json:
        {contracts: {[id: string]: {contract: string, address: string}}};

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
        config: ContractDeployConfigStandard,
        constructorArguments?: StringMap,
        options?: DeployOptions): Promise<StarknetContract>
    {
        const contractFactory =
            await this.hre.starknet.getContractFactory(config.contract);
        const instance =
            await contractFactory.deploy(constructorArguments, options);

        this._json.contracts[config.id] = {
            contract: config.contract,
            address: instance.address
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