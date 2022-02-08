import "@nomiclabs/hardhat-ethers"

import * as crypto from "crypto"
import {Contract, ContractFactory, Signer} from "ethers";
import * as fs from "fs";
import {HardhatRuntimeEnvironment} from "hardhat/types";

interface DeployedContract
{
    contract: string;  // fully qualified contract name
    address: string;
    bytecodeHash: string;
    buildInfoId: string;
}

// TODO more type info for these
interface DeployedContracts
{
    contracts: any;
    artifacts: any;
}

interface ContractDeployConfig
{
    contract: string;     // fully qualified contract to use
    autoUpdate: boolean;  // whether to auto-redeploy this when it has changed
}

interface ContractDeployConfigStandard extends ContractDeployConfig
{
    id: string;  // id unique to deployment which identifies this contract
                 // instance
}

interface ContractDeployConfigERC1967
{
    id: string;
    proxy: ContractDeployConfig;
    implementation: ContractDeployConfig;
}

export class Deployment
{
    public instances: {[id: string]: Contract};
    public proxyInstances: {[id: string]: Contract};
    public proxyImplInstances: {[id: string]: Contract};

    private _hre: HardhatRuntimeEnvironment;
    private _signer: Signer|undefined;
    private _jsonFilePath: string;
    private _deployedContracts: DeployedContracts;

    constructor(hre: HardhatRuntimeEnvironment, signer?: Signer)
    {
        this.instances = {};
        this.proxyInstances = {};
        this.proxyImplInstances = {};

        this._hre = hre;
        this._signer = signer;
        this._jsonFilePath = `./deployments/${hre.network.name}.json`;

        if (fs.existsSync(this._jsonFilePath))
        {
            this._deployedContracts =
                JSON.parse(fs.readFileSync(this._jsonFilePath).toString());
        }
        else
        {
            this._deployedContracts = {contracts: {}, artifacts: {}};
        }
    }

    async deploy(contractConfig: ContractDeployConfigStandard, ...args: any[]):
        Promise<Contract>
    {
        if (this._deployedContracts.contracts[contractConfig.id] == undefined)
        {
            this._deployedContracts.contracts[contractConfig.id] = {};
        }

        const instance: Contract = await this._deploy(
            contractConfig,
            this._deployedContracts.contracts[contractConfig.id],
            ...args);

        this.instances[contractConfig.id] = instance;
        return instance;
    }

    async deployERC1967(
        contractConfig: ContractDeployConfigERC1967,
        getProxyConstructorArgs: (implementation: Contract) => any[],
        upgradeFunc:
            (proxy: Contract, newImplementation: Contract) => Promise<void>):
        Promise<Contract>
    {
        // TODO can we use typeof for this?
        if (this._deployedContracts.contracts[contractConfig.id] == undefined)
        {
            this._deployedContracts.contracts[contractConfig.id] = {
                implementation: {}
            };
        }
        else if (
            this._deployedContracts.contracts[contractConfig.id]
                .implementation == undefined)
        {
            this._deployedContracts.contracts[contractConfig.id]
                .implementation = {};
        }

        const implementationConfig: ContractDeployConfigStandard = {
            id: contractConfig.id + "[impl]",
            contract: contractConfig.implementation.contract,
            autoUpdate: contractConfig.implementation.autoUpdate
        };
        const implementation: Contract = await this._deploy(
            implementationConfig,
            this._deployedContracts.contracts[contractConfig.id]
                .implementation);

        const proxyConfig: ContractDeployConfigStandard = {
            id: contractConfig.id + "[proxy]",
            contract: contractConfig.proxy.contract,
            autoUpdate: contractConfig.proxy.autoUpdate
        };

        const proxy: Contract = await this._deploy(
            proxyConfig,
            this._deployedContracts.contracts[contractConfig.id],
            getProxyConstructorArgs(implementation));

        const instance: Contract = await this._hre.ethers.getContractAt(
            contractConfig.implementation.contract,
            proxy.address,
            this._signer);

        // this is where the implementation address is stored in ERC1967
        // proxies
        let currentImplementation: string =
            await this._hre.ethers.provider.getStorageAt(
                proxy.address,
                "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc");
        // on hardhat node (and possibly others) this returns a full 32 byte
        // word with padded zeroes at the start, those need trimming or
        // getAddress will fail. Ganache doesn't though, so we just chop off
        // the last 40 chars (20 bytes) and prepend 0x.
        currentImplementation = this._hre.ethers.utils.getAddress(
            "0x" +
            currentImplementation.substring(currentImplementation.length - 40));

        if (currentImplementation != implementation.address)
        {
            console.log("implementation contract has changed, updating");
            await upgradeFunc(instance, implementation);

            // TODO verify it's updated after this
        }

        this.instances[contractConfig.id] = instance;
        this.proxyInstances[contractConfig.id] = proxy;
        this.proxyImplInstances[contractConfig.id] = implementation;

        return instance;
    }

    private async _deploy(
        contractConfig: ContractDeployConfigStandard,
        deployedContract: DeployedContract,
        ...args: any[]): Promise<Contract>
    {
        if (contractConfig.autoUpdate == undefined)
        {
            contractConfig.autoUpdate = true;
        }

        console.log(`deploying ${contractConfig.id} | ${
            contractConfig.contract} | autoUpdate=${
            contractConfig.autoUpdate}`);

        const artifact =
            await this._hre.artifacts.readArtifact(contractConfig.contract);
        const buildInfo =
            await this._hre.artifacts.getBuildInfo(contractConfig.contract);
        if (buildInfo == undefined)
        {
            throw "buildInfo not found for " + contractConfig.contract;
        }

        const hash = crypto.createHash("sha256");
        hash.update(artifact.bytecode);
        const bytecodeHash = hash.digest("hex");

        if (deployedContract.address != undefined)
        {
            console.log(`${contractConfig.id} is already deployed at ${
                deployedContract.address}`);

            if (deployedContract.bytecodeHash != bytecodeHash &&
                contractConfig.autoUpdate)
            {
                console.log(`${contractConfig.id} is out of date (${
                    deployedContract.bytecodeHash}), redeploying (${
                    bytecodeHash})`);
            }
            else
            {
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

        if (this._deployedContracts.artifacts[buildInfo.id] == undefined)
        {
            this._deployedContracts.artifacts[buildInfo.id] = buildInfo;
        }

        deployedContract.contract = contractConfig.contract;
        deployedContract.address = instance.address;
        deployedContract.bytecodeHash = bytecodeHash;
        deployedContract.buildInfoId = buildInfo.id;

        return instance;
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
            for (const contractId in this._deployedContracts.contracts)
            {
                let deployedContract =
                    this._deployedContracts.contracts[contractId];

                usedBuildInfoIds.add(deployedContract.buildInfo);

                if (this._deployedContracts.contracts[contractId]
                        .implementation != undefined)
                {
                    usedBuildInfoIds.add(
                        deployedContract.implementation.buildInfo);
                }
            }

            let toPrune: string[] = [];
            for (const buildInfoId in this._deployedContracts.artifacts)
            {
                if (!usedBuildInfoIds.has(buildInfoId) == undefined)
                {
                    toPrune.push(buildInfoId);
                }
            }

            for (let i = 0; i < toPrune.length; ++i)
            {
                delete this._deployedContracts.artifacts[toPrune[i]];
            }

            // clear output section of artifacts as it's massive, we can
            // always rebuild it when needed
            for (const artifact in this._deployedContracts.artifacts)
            {
                delete this._deployedContracts.artifacts[artifact].output;
            }
        }
        catch (e)
        {
            console.error("Deployment:writeToFile()", e);
        }

        fs.writeFileSync(
            this._jsonFilePath,
            JSON.stringify(this._deployedContracts, null, 4));
    }
}