import crypto from "crypto";
import fs from "fs";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ContractDeployConfig } from "./deployment";
import { Contract, Abi, json } from "starknet";
import "@playmint/hardhat-starknetjs";
import { BigNumberish } from "starknet/dist/utils/number";

export class StarknetDeployment {
    private static readonly DEPLOYMENTS_DIR: string = "./starknet-deployments";
    public readonly hre: HardhatRuntimeEnvironment;
    public readonly jsonFilePath: string;
    public readonly instances: { [id: string]: Contract };
    // using a similar shape to the json of L1
    // deployments for consistency
    private _json: {
        contracts: {
            [id: string]:
            { contract: string, address: string, bytecodeHash: string }
        },
        abis: { [id: string]: Abi }
    };

    constructor(hre: HardhatRuntimeEnvironment) {
        this.hre = hre;
        this.jsonFilePath = `${StarknetDeployment.DEPLOYMENTS_DIR}/${hre.starknetjs.networkId}.json`;
        this.instances = {};

        if (fs.existsSync(this.jsonFilePath)) {
            this._json =
                json.parse(fs.readFileSync(this.jsonFilePath).toString());
        }
        else {
            this._json = { contracts: {}, abis: {} };
        }
    }

    public async deploy(
        id: string,
        contractConfig: ContractDeployConfig,
        constructorArgs?: any[],
        addressSalt?: BigNumberish): Promise<Contract> {
        console.log(`deploying ${id} | ${contractConfig.contract} | autoUpdate=${contractConfig.autoUpdate}`);

        const contractFactory =
            await this.hre.starknetjs.getContractFactory(contractConfig.contract);

        const hash = crypto.createHash("sha256");
        hash.update(json.stringify(contractFactory.compiledContract.program));
        const bytecodeHash = hash.digest("hex");

        const contractJson = this._json.contracts[id];
        if (contractJson !== undefined) {
            console.log(`${id} is already deployed at ${contractJson.address}`);

            if (contractJson.contract != contractConfig.contract) {
                throw `attempting to deploy contract '${contractConfig.contract}' with id '${id}' but existing contract is '${contractJson
                    .contract}', if that's intentional then change the id of the contract in the deployment json or remote it entirely.`;
            }

            if (contractJson.bytecodeHash == bytecodeHash ||
                !contractConfig.autoUpdate) {
                this.instances[id] = contractFactory.attach(contractJson.address);
                return this.instances[id];
            }
            console.log(`${id} is out of date (${contractJson.bytecodeHash}), redeploying (${bytecodeHash})`);
        }

        let constructorCalldata = undefined;
        if (constructorArgs !== undefined) {
            const constructor = contractFactory.compiledContract.abi.find((abiItem) => {
                return abiItem.type == "constructor";
            });
            if (constructor === undefined) {
                throw "Constructor args were supplied but no constructor was found in Abi";
            }
            constructorCalldata = contractFactory.attach("").populate(constructor.name, constructorArgs).calldata;
        }
        const instance =
            await (await contractFactory.deploy(constructorCalldata, addressSalt)).deployed();

        console.log("deployed to", instance.address);

        this.instances[id] = instance;

        this._json.contracts[id] = {
            contract: contractConfig.contract,
            address: instance.address,
            bytecodeHash: bytecodeHash
        };
        this._json.abis[id] = contractFactory.compiledContract.abi;

        return instance;
    }

    public writeToFile(): void {
        if (!fs.existsSync(StarknetDeployment.DEPLOYMENTS_DIR)) {
            fs.mkdirSync(StarknetDeployment.DEPLOYMENTS_DIR);
        }

        fs.writeFileSync(
            this.jsonFilePath, json.stringify(this._json, null, 4));
    }
}