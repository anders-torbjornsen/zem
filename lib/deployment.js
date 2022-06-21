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
exports.Deployment = void 0;
require("@nomiclabs/hardhat-ethers");
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
class Deployment {
    constructor(hre, signer) {
        this._instances = {};
        this._proxyInstances = {};
        this._proxyImplInstances = {};
        this._hre = hre;
        this._signer = signer;
        this._jsonFilePath = `./deployments/${hre.network.name}.json`;
        if (fs.existsSync(this._jsonFilePath)) {
            this._deployedContracts =
                JSON.parse(fs.readFileSync(this._jsonFilePath).toString());
        }
        else {
            this._deployedContracts = { contracts: {}, artifacts: {} };
        }
    }
    get hre() {
        return this._hre;
    }
    get signer() {
        return this._signer;
    }
    get instances() {
        return this._instances;
    }
    get proxyInstances() {
        return this._proxyInstances;
    }
    get proxyImplInstances() {
        return this._proxyImplInstances;
    }
    async deploy(contractConfig, ...args) {
        if (this._deployedContracts.contracts[contractConfig.id] == undefined) {
            this._deployedContracts.contracts[contractConfig.id] =
                { contract: "", address: "", bytecodeHash: "", buildInfoId: "" };
        }
        const instance = await this._deploy(contractConfig, this._deployedContracts.contracts[contractConfig.id], ...args);
        this._instances[contractConfig.id] = instance;
        return instance;
    }
    async deployERC1967(contractConfig, getProxyConstructorArgs, upgradeFunc) {
        if (this._deployedContracts.contracts[contractConfig.id] == undefined) {
            this._deployedContracts.contracts[contractConfig.id] = {
                contract: "",
                address: "",
                bytecodeHash: "",
                buildInfoId: "",
                implementation: {
                    contract: "",
                    address: "",
                    bytecodeHash: "",
                    buildInfoId: ""
                }
            };
        }
        const implementationConfig = {
            id: contractConfig.id + "[impl]",
            contract: contractConfig.implementation.contract,
            autoUpdate: contractConfig.implementation.autoUpdate
        };
        const implementation = await this._deploy(implementationConfig, this._deployedContracts.contracts[contractConfig.id]
            .implementation);
        const proxyConfig = {
            id: contractConfig.id + "[proxy]",
            contract: contractConfig.proxy.contract,
            autoUpdate: contractConfig.proxy.autoUpdate
        };
        const proxy = await this._deploy(proxyConfig, this._deployedContracts.contracts[contractConfig.id], ...getProxyConstructorArgs(implementation));
        const instance = await this._hre.ethers.getContractAt(contractConfig.implementation.contract, proxy.address, this._signer);
        let currentImplementation = await this._getERC1967ImplementationAddress(proxy.address);
        if (currentImplementation != implementation.address) {
            console.log("implementation contract has changed, updating");
            await upgradeFunc(instance, implementation);
            if (await this._getERC1967ImplementationAddress(proxy.address) !=
                implementation.address) {
                throw "failed to update implementation to the correct address";
            }
        }
        this._instances[contractConfig.id] = instance;
        this._proxyInstances[contractConfig.id] = proxy;
        this._proxyImplInstances[contractConfig.id] = implementation;
        return instance;
    }
    async _deploy(contractConfig, deployedContract, ...args) {
        console.log(`deploying ${contractConfig.id} | ${contractConfig.contract} | autoUpdate=${contractConfig.autoUpdate}`);
        const artifact = await this._hre.artifacts.readArtifact(contractConfig.contract);
        const buildInfo = await this._hre.artifacts.getBuildInfo(contractConfig.contract);
        if (buildInfo == undefined) {
            throw "buildInfo not found for " + contractConfig.contract;
        }
        const hash = crypto.createHash("sha256");
        hash.update(artifact.bytecode);
        const bytecodeHash = hash.digest("hex");
        if (deployedContract.address != "") {
            console.log(`${contractConfig.id} is already deployed at ${deployedContract.address}`);
            if (deployedContract.bytecodeHash != bytecodeHash &&
                contractConfig.autoUpdate) {
                console.log(`${contractConfig.id} is out of date (${deployedContract.bytecodeHash}), redeploying (${bytecodeHash})`);
            }
            else {
                return await this._hre.ethers.getContractAt(contractConfig.contract, deployedContract.address, this._signer);
            }
        }
        const contractFactory = await this._hre.ethers.getContractFactory(contractConfig.contract, this._signer);
        const instance = await (await contractFactory.deploy(...args)).deployed();
        console.log("deployed to", instance.address);
        if (this._deployedContracts.artifacts[buildInfo.id] == undefined) {
            this._deployedContracts.artifacts[buildInfo.id] = buildInfo;
        }
        deployedContract.contract = contractConfig.contract;
        deployedContract.address = instance.address;
        deployedContract.bytecodeHash = bytecodeHash;
        deployedContract.buildInfoId = buildInfo.id;
        return instance;
    }
    async _getERC1967ImplementationAddress(proxyAddress) {
        // this is where the implementation address is stored in ERC1967
        // proxies
        let currentImplementation = await this._hre.ethers.provider.getStorageAt(proxyAddress, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc");
        // on hardhat node (and possibly others) this returns a full 32 byte
        // word with padded zeroes at the start, those need trimming or
        // getAddress will fail. Ganache doesn't though, so we just chop off
        // the last 40 chars (20 bytes) and prepend 0x.
        currentImplementation = this._hre.ethers.utils.getAddress("0x" +
            currentImplementation.substring(currentImplementation.length - 40));
        return currentImplementation;
    }
    writeToFile() {
        // prune any unneeded artifacts
        try {
            if (!fs.existsSync("./deployments")) {
                fs.mkdirSync("./deployments");
            }
            let usedBuildInfoIds = new Set();
            for (const contractId in this._deployedContracts.contracts) {
                let deployedContract = this._deployedContracts.contracts[contractId];
                usedBuildInfoIds.add(deployedContract.buildInfoId);
                let deployedERC1967 = deployedContract;
                if (deployedERC1967.implementation !== undefined) {
                    usedBuildInfoIds.add(deployedERC1967.implementation.buildInfoId);
                }
            }
            let toPrune = [];
            for (const buildInfoId in this._deployedContracts.artifacts) {
                if (!usedBuildInfoIds.has(buildInfoId) == undefined) {
                    toPrune.push(buildInfoId);
                }
            }
            for (let i = 0; i < toPrune.length; ++i) {
                delete this._deployedContracts.artifacts[toPrune[i]];
            }
            // clear output section of artifacts as it's massive, we can
            // always rebuild it when needed
            for (const artifact in this._deployedContracts.artifacts) {
                delete this._deployedContracts.artifacts[artifact]
                    .output;
            }
        }
        catch (e) {
            console.error("Deployment:writeToFile()", e);
        }
        fs.writeFileSync(this._jsonFilePath, JSON.stringify(this._deployedContracts, null, 4));
    }
}
exports.Deployment = Deployment;
//# sourceMappingURL=deployment.js.map