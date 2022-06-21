import "@nomiclabs/hardhat-ethers"

import * as crypto from "crypto"
import { Contract, ContractFactory, Signer } from "ethers";
import * as fs from "fs";
import { Artifact, BuildInfo, HardhatRuntimeEnvironment } from "hardhat/types";

interface DeployedContract {
    contract: string;  // fully qualified contract name
    address: string;
    bytecodeHash: string;
    buildInfoId: string;  // artifact build info id
}

interface DeployedERC1967 extends DeployedContract {
    implementation: DeployedContract
}

interface DeployedContracts {
    contracts: { [id: string]: DeployedContract | DeployedERC1967 };
    artifacts: { [buildInfoId: string]: BuildInfo };
}

interface ContractDeployConfig {
    contract: string;     // fully qualified contract to use
    autoUpdate: boolean;  // whether to auto-redeploy this when it has changed
}

export interface ContractDeployConfigStandard extends ContractDeployConfig {
    id: string;  // id unique to deployment which identifies this contract
    // instance
}

interface ContractDeployConfigERC1967 {
    id: string;
    proxy: ContractDeployConfig;
    implementation: ContractDeployConfig;
}

export class Deployment {
    private _hre: HardhatRuntimeEnvironment;
    private _signer: Signer | undefined;
    private _jsonFilePath: string;
    private _deployedContracts: DeployedContracts;
    private _instances: { [id: string]: Contract };
    private _proxyInstances: { [id: string]: Contract };
    private _proxyImplInstances: { [id: string]: Contract };

    public get hre() {
        return this._hre;
    }
    public get signer() {
        return this._signer;
    }
    public get instances() {
        return this._instances;
    }
    public get proxyInstances() {
        return this._proxyInstances;
    }
    public get proxyImplInstances() {
        return this._proxyImplInstances;
    }

    constructor(hre: HardhatRuntimeEnvironment, signer?: Signer) {
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

    async deploy(contractConfig: ContractDeployConfigStandard, ...args: any[]):
        Promise<Contract> {
        if (this._deployedContracts.contracts[contractConfig.id] == undefined) {
            this._deployedContracts.contracts[contractConfig.id] =
                { contract: "", address: "", bytecodeHash: "", buildInfoId: "" };
        }

        const instance: Contract = await this._deploy(
            contractConfig,
            this._deployedContracts.contracts[contractConfig.id],
            ...args);

        this._instances[contractConfig.id] = instance;
        return instance;
    }

    async deployERC1967(
        contractConfig: ContractDeployConfigERC1967,
        getProxyConstructorArgs: (implementation: Contract) => any[],
        upgradeFunc:
            (proxy: Contract, newImplementation: Contract) => Promise<void>):
        Promise<Contract> {
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

        const implementationConfig: ContractDeployConfigStandard = {
            id: contractConfig.id + "[impl]",
            contract: contractConfig.implementation.contract,
            autoUpdate: contractConfig.implementation.autoUpdate
        };
        const implementation: Contract = await this._deploy(
            implementationConfig,
            (this._deployedContracts.contracts[contractConfig.id] as
                DeployedERC1967)
                .implementation);

        const proxyConfig: ContractDeployConfigStandard = {
            id: contractConfig.id + "[proxy]",
            contract: contractConfig.proxy.contract,
            autoUpdate: contractConfig.proxy.autoUpdate
        };

        const proxy: Contract = await this._deploy(
            proxyConfig,
            this._deployedContracts.contracts[contractConfig.id],
            ...getProxyConstructorArgs(implementation));

        const instance: Contract = await this._hre.ethers.getContractAt(
            contractConfig.implementation.contract,
            proxy.address,
            this._signer);

        let currentImplementation: string =
            await this._getERC1967ImplementationAddress(proxy.address);
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

    private async _deploy(
        contractConfig: ContractDeployConfigStandard,
        deployedContract: DeployedContract,
        ...args: any[]): Promise<Contract> {
        console.log(`deploying ${contractConfig.id} | ${contractConfig.contract} | autoUpdate=${contractConfig.autoUpdate}`);

        const artifact: Artifact =
            await this._hre.artifacts.readArtifact(contractConfig.contract);
        const buildInfo: BuildInfo | undefined =
            await this._hre.artifacts.getBuildInfo(contractConfig.contract);
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
                return await this._hre.ethers.getContractAt(
                    contractConfig.contract,
                    deployedContract.address,
                    this._signer);
            }
        }

        const contractFactory: ContractFactory =
            await this._hre.ethers.getContractFactory(
                contractConfig.contract, this._signer);
        const instance: Contract =
            await (await contractFactory.deploy(...args)).deployed();

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

    private async _getERC1967ImplementationAddress(proxyAddress: string):
        Promise<string> {
        // this is where the implementation address is stored in ERC1967
        // proxies
        let currentImplementation: string =
            await this._hre.ethers.provider.getStorageAt(
                proxyAddress,
                "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc");

        // on hardhat node (and possibly others) this returns a full 32 byte
        // word with padded zeroes at the start, those need trimming or
        // getAddress will fail. Ganache doesn't though, so we just chop off
        // the last 40 chars (20 bytes) and prepend 0x.
        currentImplementation = this._hre.ethers.utils.getAddress(
            "0x" +
            currentImplementation.substring(currentImplementation.length - 40));

        return currentImplementation;
    }

    writeToFile(): void {
        // prune any unneeded artifacts
        try {
            if (!fs.existsSync("./deployments")) {
                fs.mkdirSync("./deployments");
            }

            let usedBuildInfoIds = new Set<string>();
            for (const contractId in this._deployedContracts.contracts) {
                let deployedContract: DeployedContract =
                    this._deployedContracts.contracts[contractId];

                usedBuildInfoIds.add(deployedContract.buildInfoId);

                let deployedERC1967: DeployedERC1967 =
                    deployedContract as DeployedERC1967;
                if (deployedERC1967.implementation !== undefined) {
                    usedBuildInfoIds.add(
                        deployedERC1967.implementation.buildInfoId);
                }
            }

            let toPrune: string[] = [];
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
                delete (this._deployedContracts.artifacts[artifact] as any)
                    .output;
            }
        }
        catch (e) {
            console.error("Deployment:writeToFile()", e);
        }

        fs.writeFileSync(
            this._jsonFilePath,
            JSON.stringify(this._deployedContracts, null, 4));
    }
}