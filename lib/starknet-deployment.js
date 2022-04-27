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
require("@shardlabs/starknet-hardhat-plugin/dist/type-extensions");
const fs = __importStar(require("fs"));
class StarknetDeployment {
    constructor(hre) {
        this.hre = hre;
        this.jsonFilePath = `${StarknetDeployment.DEPLOYMENTS_DIR}/${hre.config.starknet.network}.json`;
        this.instances = {};
        if (fs.existsSync(this.jsonFilePath)) {
            this._json =
                JSON.parse(fs.readFileSync(this.jsonFilePath).toString());
        }
        else {
            this._json = { contracts: {} };
        }
    }
    async deploy(config, constructorArguments, options) {
        const contractFactory = await this.hre.starknet.getContractFactory(config.contract);
        const instance = await contractFactory.deploy(constructorArguments, options);
        this._json.contracts[config.id] = {
            contract: config.contract,
            address: instance.address
        };
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