"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StarknetDeployment = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
require("@playmint/hardhat-starknetjs");
class StarknetDeployment {
    constructor(hre) {
        this.hre = hre;
        this.jsonFilePath = `${StarknetDeployment.DEPLOYMENTS_DIR}/${hre.starknetjs.networkId}.json`;
        this.instances = {};
        if (fs.existsSync(this.jsonFilePath)) {
            this._json =
                JSON.parse(fs.readFileSync(this.jsonFilePath).toString());
        }
        else {
            this._json = { contracts: {}, abis: {} };
        }
    }
    async deploy(contractConfig, constructorName, constructorArgs, addressSalt) {
        console.log(`deploying ${contractConfig.id} | ${contractConfig.contract} | autoUpdate=${contractConfig.autoUpdate}`);
        const contractFactory = await this.hre.starknetjs.getContractFactory(contractConfig.contract);
        const hash = crypto.createHash("sha256");
        hash.update(contractFactory.compiledContract.program.data.join());
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
        if (constructorName !== undefined && constructorArgs !== undefined) {
            constructorCalldata = contractFactory.attach("").populate(constructorName, constructorArgs).calldata;
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
        if (!fs.existsSync(StarknetDeployment.DEPLOYMENTS_DIR)) {
            fs.mkdirSync(StarknetDeployment.DEPLOYMENTS_DIR);
        }
        fs.writeFileSync(this.jsonFilePath, JSON.stringify(this._json, null, 4));
    }
}
exports.StarknetDeployment = StarknetDeployment;
StarknetDeployment.DEPLOYMENTS_DIR = "./starknet-deployments";
//# sourceMappingURL=starknet-deployment.js.map