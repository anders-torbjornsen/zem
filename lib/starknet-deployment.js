"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StarknetDeployment = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const starknet_1 = require("starknet");
require("@playmint/hardhat-starknetjs");
class StarknetDeployment {
    constructor(hre) {
        this.hre = hre;
        this.jsonFilePath = `${StarknetDeployment.DEPLOYMENTS_DIR}/${hre.starknetjs.networkId}.json`;
        this.instances = {};
        if (fs_1.default.existsSync(this.jsonFilePath)) {
            this._json =
                starknet_1.json.parse(fs_1.default.readFileSync(this.jsonFilePath).toString());
        }
        else {
            this._json = { contracts: {}, abis: {} };
        }
    }
    async deploy(contractConfig, constructorArgs, addressSalt) {
        console.log(`deploying ${contractConfig.id} | ${contractConfig.contract} | autoUpdate=${contractConfig.autoUpdate}`);
        const contractFactory = await this.hre.starknetjs.getContractFactory(contractConfig.contract);
        const hash = crypto_1.default.createHash("sha256");
        hash.update(starknet_1.json.stringify(contractFactory.compiledContract.program));
        const bytecodeHash = hash.digest("hex");
        const contractJson = this._json.contracts[contractConfig.id];
        if (contractJson !== undefined) {
            console.log(`${contractConfig.id} is already deployed at ${contractJson.address}`);
            if (contractJson.contract != contractConfig.contract) {
                throw `attempting to deploy contract '${contractConfig.contract}' with id '${contractConfig.id}' but existing contract is '${contractJson
                    .contract}', if that's intentional then change the id of the contract in the deployment json or remote it entirely.`;
            }
            if (contractJson.bytecodeHash == bytecodeHash ||
                !contractConfig.autoUpdate) {
                this.instances[contractConfig.id] = contractFactory.attach(contractJson.address);
                return this.instances[contractConfig.id];
            }
            console.log(`${contractConfig.id} is out of date (${contractJson.bytecodeHash}), redeploying (${bytecodeHash})`);
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
        const instance = await (await contractFactory.deploy(constructorCalldata, addressSalt)).deployed();
        console.log("deployed to", instance.address);
        this.instances[contractConfig.id] = instance;
        this._json.contracts[contractConfig.id] = {
            contract: contractConfig.contract,
            address: instance.address,
            bytecodeHash: bytecodeHash
        };
        this._json.abis[contractConfig.id] = contractFactory.compiledContract.abi;
        return instance;
    }
    writeToFile() {
        if (!fs_1.default.existsSync(StarknetDeployment.DEPLOYMENTS_DIR)) {
            fs_1.default.mkdirSync(StarknetDeployment.DEPLOYMENTS_DIR);
        }
        fs_1.default.writeFileSync(this.jsonFilePath, starknet_1.json.stringify(this._json, null, 4));
    }
}
exports.StarknetDeployment = StarknetDeployment;
StarknetDeployment.DEPLOYMENTS_DIR = "./starknet-deployments";
//# sourceMappingURL=starknet-deployment.js.map