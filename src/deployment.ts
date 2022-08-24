import "@nomiclabs/hardhat-ethers"

import * as crypto from "crypto"
import { Contract, ContractFactory, Signer, BytesLike } from "ethers";
import { Interface, Fragment } from "@ethersproject/abi";
import { ContractInterface } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/keccak256";
import { toUtf8Bytes } from "@ethersproject/strings";
import { hexlify } from "@ethersproject/bytes";
import * as fs from "fs";
import { Artifact, BuildInfo, HardhatRuntimeEnvironment } from "hardhat/types";

interface ContractDeployment {
    contract: string;  // fully qualified contract name
    address: string;
    bytecodeHash: string;
    buildInfoId: string;  // artifact build info id
}

interface DeploymentData {
    contracts: { [id: string]: ContractDeployment };
    implContracts: {
        [contract: string]: {
            [bytecodeHash: string]: {
                address: string;
                buildInfoId: string
            };
        };
    };
    artifacts: { [buildInfoId: string]: BuildInfo };
}

export interface ContractDeployConfig {
    contract: string;     // fully qualified contract to use
    autoUpdate?: boolean;  // whether to auto-redeploy this when it has changed
}

export interface ContractDeployConfigERC1967 {
    proxy: ContractDeployConfig;
    implementation: ContractDeployConfig;
}

export interface FacetConfig extends ContractDeployConfig {
    functionsToIgnore?: string[];
    selectorsToIgnore?: BytesLike[];
}

export interface ContractDeployConfigDiamond extends ContractDeployConfig {
    facets: FacetConfig[];
}

export class Deployment {
    private _hre: HardhatRuntimeEnvironment;
    private _signer: Signer | undefined;
    private _jsonFilePath: string;
    private _deployment: DeploymentData;
    private _implContractsByAddress: { [address: string]: { contract: string, bytecodeHash: string } };
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

    static async create(hre: HardhatRuntimeEnvironment, signer?: Signer) {
        return new Deployment(hre, signer || (await hre.ethers.getSigners())[0]);
    }

    private constructor(hre: HardhatRuntimeEnvironment, signer: Signer) {
        this._instances = {};
        this._proxyInstances = {}; // TODO put diamond proxies in here too
        this._proxyImplInstances = {}; // TODO this but for facets

        this._hre = hre;
        this._signer = signer;
        this._jsonFilePath = `./deployments/${hre.network.name}.json`;

        if (fs.existsSync(this._jsonFilePath)) {
            this._deployment =
                JSON.parse(fs.readFileSync(this._jsonFilePath).toString());
        }
        else {
            this._deployment = {
                contracts: {},
                implContracts: {},
                artifacts: {}
            };
        }

        this._implContractsByAddress = {};
        for (const contract in this._deployment.implContracts) {
            for (const bytecodeHash in this._deployment.implContracts[contract]) {
                const instance = this._deployment.implContracts[contract][bytecodeHash];

                this._implContractsByAddress[instance.address] = {
                    contract,
                    bytecodeHash
                }
            }
        }
    }

    async deploy(
        id: string,
        contractConfig: ContractDeployConfig,
        ...args: any[]): Promise<Contract> {

        console.log(`deploy(${id})`);

        this._deployment.contracts[id] = await this._deployContract(
            contractConfig,
            args,
            this._deployment.contracts[id]);

        const instance = this._getContractInstance(this._deployment.contracts[id]);

        this._instances[id] = instance;
        return instance;
    }

    async deployERC1967(
        id: string,
        contractConfig: ContractDeployConfigERC1967,
        upgradeFunc:
            (proxy: Contract, newImplementation: Contract) => Promise<void>,
        getProxyConstructorArgs?: (implementation: Contract) => any[]):
        Promise<Contract> {

        console.log(`deployERC1967(${id})`);

        let contractDeployment = this._deployment.contracts[id];

        let currentImplAddress = contractDeployment ?
            await this._getERC1967ImplementationAddress(contractDeployment.address) : undefined;

        const implDeployment = await this._deployImpl(contractConfig.implementation, currentImplAddress);
        const implementation = this._getContractInstance(implDeployment);

        this._deployment.contracts[id] = await this._deployContract(
            contractConfig.proxy,
            getProxyConstructorArgs ? getProxyConstructorArgs(implementation) : [],
            contractDeployment);

        contractDeployment = this._deployment.contracts[id];

        const proxy = this._getContractInstance(contractDeployment);
        const instance = this._getContractInstance(implDeployment, contractDeployment.address);

        let currentImplementationAddress: string =
            await this._getERC1967ImplementationAddress(contractDeployment.address);
        if (currentImplementationAddress != implDeployment.address) {
            console.log("- implementation contract has changed, updating");
            await upgradeFunc(instance, implementation);

            if (await this._getERC1967ImplementationAddress(contractDeployment.address) !=
                implDeployment.address) {
                throw new Error("failed to update implementation to the correct address");
            }
        }

        this._instances[id] = instance;
        this._proxyInstances[id] = proxy;
        this._proxyImplInstances[id] = implementation;

        return instance;
    }

    async deployDiamond(
        id: string,
        contractConfig: ContractDeployConfigDiamond,
        getProxyConstructorArgs?: (facetAddresses: { [contract: string]: Contract }) => any[]) {

        console.log(`deployDiamond(${id})`);

        const diamondAbi = new Interface(`[
            {
                "inputs": [
                {
                    "components": [
                    {
                        "internalType": "address",
                        "name": "facetAddress",
                        "type": "address"
                    },
                    {
                        "internalType": "enum IDiamondCut.FacetCutAction",
                        "name": "action",
                        "type": "uint8"
                    },
                    {
                        "internalType": "bytes4[]",
                        "name": "functionSelectors",
                        "type": "bytes4[]"
                    }
                    ],
                    "internalType": "struct IDiamondCut.FacetCut[]",
                    "name": "facetCuts",
                    "type": "tuple[]"
                },
                {
                    "internalType": "address",
                    "name": "_init",
                    "type": "address"
                },
                {
                    "internalType": "bytes",
                    "name": "_calldata",
                    "type": "bytes"
                }
                ],
                "name": "diamondCut",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "facets",
                "outputs": [
                {
                    "components": [
                    {
                        "internalType": "address",
                        "name": "facetAddress",
                        "type": "address"
                    },
                    {
                        "internalType": "bytes4[]",
                        "name": "functionSelectors",
                        "type": "bytes4[]"
                    }
                    ],
                    "internalType": "struct IDiamondLoupe.Facet[]",
                    "name": "facets_",
                    "type": "tuple[]"
                }
                ],
                "stateMutability": "view",
                "type": "function"
            }
            ]`);

        const currentFacets = this._deployment.contracts[id] ?
            await (new Contract(this._deployment.contracts[id].address, diamondAbi, this._signer)).facets() as IDiamondLoupeFacetStruct[] : [];

        const currentFacetLookup: { [contract: string]: ContractDeployment } = {};
        for (const currentFacet of currentFacets) {
            const facetDeployment = this._getImplDeploymentByAddress(currentFacet.facetAddress);
            currentFacetLookup[facetDeployment.contract] = facetDeployment;
        }

        const facets: { [contract: string]: Contract } = {};
        for (const facetConfig of contractConfig.facets) {
            // have to work with fully qualified contract names
            const artifact = this._hre.artifacts.readArtifactSync(facetConfig.contract);
            const fullyQualifiedContractName = `${artifact.sourceName}:${artifact.contractName}`;

            const currentDeployedFacet = facetConfig.autoUpdate ?
                undefined : currentFacetLookup[fullyQualifiedContractName];

            const deployedFacet = await this._deployImpl(
                facetConfig,
                currentDeployedFacet ? currentDeployedFacet.address : undefined)

            facets[facetConfig.contract] = this._getContractInstance(deployedFacet);
        }

        // generate proxy constructor args with callback to project code
        const proxyConstructorArgs = getProxyConstructorArgs ?
            getProxyConstructorArgs(facets) : [];

        // deploy proxy contract
        this._deployment.contracts[id] = await this._deployContract(
            contractConfig,
            proxyConstructorArgs,
            this._deployment.contracts[id]);

        const deployedDiamond = this._deployment.contracts[id];

        // use diamond abi for now, as diamondCut() and facets() may not exist in the proxy
        // contract, they could be in a facet
        const diamondProxy = new Contract(deployedDiamond.address, diamondAbi, this._signer);

        // apply diamond cut if needed
        const diamondCut = this.calculateDiamondCut(contractConfig.facets, await diamondProxy.facets());
        if (diamondCut.length) {
            await (await diamondProxy.diamondCut(diamondCut, "0x0000000000000000000000000000000000000000", "")).wait();
        }

        // now create a contract object with an ABI combining that of all the facets
        const allSelectors = new Set<string>();
        for (const facet of ((await diamondProxy.facets()) as IDiamondLoupeFacetStruct[])) {
            for (const selector of facet.functionSelectors) {
                allSelectors.add(hexlify(selector));
            }
        }

        const allIdentifiers = new Set<string>();

        const combinedInterface: Fragment[] =
            this._getContractInstance(deployedDiamond).interface.fragments.map((fragment) => {
                if (fragment.type == "function" || fragment.type == "event") {
                    allIdentifiers.add(fragment.format());
                }
                return fragment;
            });

        for (const facet in facets) {
            for (const fragment of facets[facet].interface.fragments) {
                if (fragment.type == "function") {
                    const sig = fragment.format();
                    const selector = functionSigToSelector(sig);
                    if (allSelectors.has(selector)) {
                        if (!allIdentifiers.has(sig)) {
                            allIdentifiers.add(sig);
                            combinedInterface.push(fragment);
                        }
                    }
                }
                else if (fragment.type == "event") {
                    const sig = fragment.format();
                    if (!allIdentifiers.has(sig)) {
                        allIdentifiers.add(sig);
                        combinedInterface.push(fragment);
                    }
                }
            }
        }

        const diamond = new Contract(deployedDiamond.address, combinedInterface, this._signer);

        this._instances[id] = diamond;

        return diamond;
    }

    private async _deployContract(
        contractConfig: ContractDeployConfig,
        args: any[],
        currentDeployment?: ContractDeployment): Promise<ContractDeployment> {

        const artifact: Artifact = this._hre.artifacts.readArtifactSync(contractConfig.contract);
        const fullyQualifiedContractName = `${artifact.sourceName}:${artifact.contractName}`;

        console.log(`- deploy contract | ${fullyQualifiedContractName} | autoUpdate:${contractConfig.autoUpdate || false}`);

        const bytecodeHash = getBytecodeHash(artifact);

        if (currentDeployment) {
            console.log(` - already deployed | address:${currentDeployment.address}`);

            if (currentDeployment.bytecodeHash != bytecodeHash &&
                contractConfig.autoUpdate) {
                console.log(` - out of date (${currentDeployment.bytecodeHash} -> ${bytecodeHash})`);
            }
            else {
                return currentDeployment;
            }
        }
        else {
            currentDeployment = {
                contract: "",
                address: "",
                bytecodeHash: "",
                buildInfoId: ""
            };
        }

        const deployment = await this._deploy(fullyQualifiedContractName, artifact.abi, artifact.bytecode, bytecodeHash, args);
        console.log(` - deployed | address:${deployment.address}`);

        return deployment;
    }

    private async _deployImpl(contractConfig: ContractDeployConfig, currentAddress: string | undefined) {
        // have to work with fully qualified contract names
        const artifact = this._hre.artifacts.readArtifactSync(contractConfig.contract);
        const fullyQualifiedContractName = `${artifact.sourceName}:${artifact.contractName}`;
        const bytecodeHash = getBytecodeHash(artifact);

        console.log(`- deploy impl contract | ${fullyQualifiedContractName} | autoUpdate:${contractConfig.autoUpdate || false}`)

        // we only want the current deployment if autoUpdate is false
        let currentDeployment = currentAddress && !contractConfig.autoUpdate ?
            this._getImplDeploymentByAddress(currentAddress) : undefined;

        // if current deployment is undefined, that contract may well already be deployed as 
        // multiple proxies can point to the same impl
        if (!currentDeployment) {
            currentDeployment = this._getImplDeploymentByContract(fullyQualifiedContractName, bytecodeHash);
        }

        if (currentDeployment) {
            console.log(` - already deployed | address:${currentDeployment.address} | bytecodeHash:${currentDeployment.bytecodeHash}`);
            return currentDeployment;
        }

        currentDeployment = await this._deploy(fullyQualifiedContractName, artifact.abi, artifact.bytecode, bytecodeHash, []);
        console.log(` - deployed | address:${currentDeployment.address} | bytecodeHash:${currentDeployment.bytecodeHash}`);

        if (!this._deployment.implContracts[fullyQualifiedContractName]) {
            this._deployment.implContracts[fullyQualifiedContractName] = {};
        }

        this._deployment.implContracts[fullyQualifiedContractName][bytecodeHash] = {
            address: currentDeployment.address,
            buildInfoId: currentDeployment.buildInfoId
        };

        this._implContractsByAddress[currentDeployment.address] = {
            contract: fullyQualifiedContractName,
            bytecodeHash: bytecodeHash
        };

        return currentDeployment;
    }

    private async _deploy(
        fullyQualifiedContractName: string,
        contractInterface: ContractInterface,
        bytecode: string,
        bytecodeHash: string,
        args: any[]): Promise<ContractDeployment> {

        const buildInfo: BuildInfo | undefined =
            await this._hre.artifacts.getBuildInfo(fullyQualifiedContractName);
        if (buildInfo == undefined) {
            throw new Error("buildInfo not found for " + fullyQualifiedContractName);
        }
        if (this._deployment.artifacts[buildInfo.id] == undefined) {
            this._deployment.artifacts[buildInfo.id] = buildInfo;
        }

        const contractFactory = new ContractFactory(contractInterface, bytecode, this._signer);
        const instance: Contract =
            await (await contractFactory.deploy(...args)).deployed();

        return {
            contract: fullyQualifiedContractName,
            address: instance.address,
            bytecodeHash,
            buildInfoId: buildInfo.id
        };
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

    private _getContractInstance(contractDeployment: ContractDeployment, address?: string): Contract {
        const [sourceName, contractName] = contractDeployment.contract.split(":");
        const abi = this._deployment.artifacts[contractDeployment.buildInfoId].output.contracts[sourceName][contractName].abi;
        return new Contract(address || contractDeployment.address, abi, this._signer);
    }

    private _getImplDeploymentByAddress(address: string): ContractDeployment {
        const deploymentInfo = this._implContractsByAddress[address];
        return {
            contract: deploymentInfo.contract,
            address: address,
            bytecodeHash: deploymentInfo.bytecodeHash,
            buildInfoId: this._deployment.implContracts[deploymentInfo.contract][deploymentInfo.bytecodeHash].buildInfoId
        };
    }

    private _getImplDeploymentByContract(contract: string, bytecodeHash: string): ContractDeployment | undefined {
        const contractVersions = this._deployment.implContracts[contract];
        if (contractVersions && contractVersions[bytecodeHash]) {
            return {
                contract: contract,
                address: contractVersions[bytecodeHash].address,
                bytecodeHash: bytecodeHash,
                buildInfoId: contractVersions[bytecodeHash].buildInfoId
            };
        }

        return undefined;
    }

    writeToFile(): void {
        // prune any unneeded artifacts
        try {
            if (!fs.existsSync("./deployments")) {
                fs.mkdirSync("./deployments");
            }

            let usedBuildInfoIds = new Set<string>();
            for (const contractId in this._deployment.contracts) {
                let contractDeployment = this._deployment.contracts[contractId];

                usedBuildInfoIds.add(contractDeployment.buildInfoId);
            }

            for (const contract in this._deployment.implContracts) {
                const contractVersions = this._deployment.implContracts[contract];
                for (const version in contractVersions) {
                    usedBuildInfoIds.add(contractVersions[version].buildInfoId);
                }
            }

            let toPrune: string[] = [];
            for (const buildInfoId in this._deployment.artifacts) {
                if (!usedBuildInfoIds.has(buildInfoId) == undefined) {
                    toPrune.push(buildInfoId);
                }
            }

            for (let i = 0; i < toPrune.length; ++i) {
                delete this._deployment.artifacts[toPrune[i]];
            }

            // trim fat from output that we don't use directly in the tool, can always rebuild from
            // input later
            // TODO could use solcjs to compile these on demand and cache locally, so they don't
            // have to pollute source control
            for (const buildInfoId in this._deployment.artifacts) {

                const artifact = this._deployment.artifacts[buildInfoId];

                delete (artifact.output as any).sources;

                for (const source in artifact.output.contracts) {
                    for (const contract in artifact.output.contracts[source]) {
                        delete (artifact.output.contracts[source][contract] as any).evm;
                    }
                }
            }
        }
        catch (e) {
            console.error("Deployment:writeToFile()", e);
        }

        fs.writeFileSync(
            this._jsonFilePath,
            JSON.stringify(this._deployment, null, 4));
    }

    calculateDiamondCut(facets: FacetConfig[], currentFacets: IDiamondLoupeFacetStruct[]): FacetCut[] {
        // TODO proper unit testing
        const facetAutoUpdate: { [contract: string]: boolean } = {};
        for (const facet of facets) {
            facetAutoUpdate[facet.contract] = facet.autoUpdate || false;
        }

        const currentFacetAddresses: { [contract: string]: string } = {};
        for (const facet of currentFacets) {
            currentFacetAddresses[this._implContractsByAddress[facet.facetAddress].contract] = facet.facetAddress;
        }

        const selectorToAddress: { [selector: string]: string } = {};
        for (const facet of getFacets(facets, this._hre)) {
            const artifact = this._hre.artifacts.readArtifactSync(facet.contract);
            const fullyQualifiedContractName = `${artifact.sourceName}:${artifact.contractName}`;

            let facetAddress = currentFacetAddresses[fullyQualifiedContractName];

            if (!facetAddress || facetAutoUpdate[facet.contract]) {
                const bytecodeHash = getBytecodeHash(artifact);
                const deployedFacet = this._deployment.implContracts[fullyQualifiedContractName][bytecodeHash];
                if (!deployedFacet) {
                    throw new Error(`latest version of '${fullyQualifiedContractName}' contract not found in the deployed facets of deployment`);
                }
                facetAddress = deployedFacet.address;
            }

            for (const selector of facet.selectors) {
                selectorToAddress[hexlify(selector)] = facetAddress;
            }
        }

        const addressToNeededCuts: {
            [address: string]: {
                add: string[];
                update: string[];
                remove: string[];
            }
        } = {};
        const getOrCreateNeededCuts = (address: string) => {
            if (!addressToNeededCuts[address]) {
                addressToNeededCuts[address] = { add: [], update: [], remove: [] };
            }
            return addressToNeededCuts[address];
        };
        for (const currentFacet of currentFacets) {
            for (const functionSelector of currentFacet.functionSelectors) {
                const selectorStr = hexlify(functionSelector);
                const neededAddress = selectorToAddress[selectorStr];

                if (neededAddress != currentFacet.facetAddress) {
                    if (neededAddress) {
                        // update
                        getOrCreateNeededCuts(neededAddress).update.push(selectorStr);
                    }
                    else {
                        // remove
                        getOrCreateNeededCuts(neededAddress).remove.push(selectorStr);
                    }
                }

                // remove processed selectors from the map, any which are left at the end of this
                // loop need to be added
                delete selectorToAddress[selectorStr];
            }
        }

        for (const selector in selectorToAddress) {
            // add
            getOrCreateNeededCuts(selectorToAddress[selector]).add.push(selector);
        }

        const diamondCut: FacetCut[] = [];
        for (const address in addressToNeededCuts) {
            if (addressToNeededCuts[address].add.length) {
                diamondCut.push({
                    facetAddress: address,
                    action: FacetCutAction.Add,
                    functionSelectors: addressToNeededCuts[address].add
                })
            }
            if (addressToNeededCuts[address].update.length) {
                diamondCut.push({
                    facetAddress: address,
                    action: FacetCutAction.Update,
                    functionSelectors: addressToNeededCuts[address].update
                })
            }
            if (addressToNeededCuts[address].remove.length) {
                diamondCut.push({
                    facetAddress: address,
                    action: FacetCutAction.Remove,
                    functionSelectors: addressToNeededCuts[address].remove
                })
            }
        }

        return diamondCut;
    }
}

export type IDiamondLoupeFacetStruct = {
    facetAddress: string;
    functionSelectors: BytesLike[];
}

function getBytecodeHash(artifact: Artifact) {
    const hash = crypto.createHash("sha256");
    hash.update(artifact.deployedBytecode);
    return hash.digest("hex");
}

function getFunctionSig(func: string, contractInterface: Interface) {
    if (func.indexOf("(") != -1) {
        return func;
    }

    const candidates = Object.keys(contractInterface.functions).filter((sig) => {
        return sig.substring(0, sig.indexOf("(")) == func;
    });

    if (candidates.length == 1) {
        return candidates[0];
    }

    if (candidates.length == 0) {
        throw new Error(`no function with name '${func}' found in contract interface`);
    }
    else {
        throw new Error(`multiple functions with name '${func}' found in contract interface:\n` + candidates.join("\n"));
    }
}

export type Facet = {
    contract: string;
    selectors: BytesLike[];
}

export function getFacets(facets: FacetConfig[], hre: HardhatRuntimeEnvironment) {
    const results: Facet[] = [];

    const allSelectors = new Set<BytesLike>();

    for (const facetConfig of facets) {
        const facet: Facet = {
            contract: facetConfig.contract,
            selectors: []
        };

        const artifact = hre.artifacts.readArtifactSync(facetConfig.contract);
        const facetInterface = new Interface(artifact.abi);

        const selectorsToIgnore = new Set<string>();
        if (facetConfig.functionsToIgnore) {
            for (const func of facetConfig.functionsToIgnore) {
                const selector = functionSigToSelector(getFunctionSig(func, facetInterface));
                selectorsToIgnore.add(selector);
            }
        }
        if (facetConfig.selectorsToIgnore) {
            for (const selector of facetConfig.selectorsToIgnore) {
                selectorsToIgnore.add(hexlify(selector));
            }
        }

        for (const funcSig in facetInterface.functions) {
            const selector = functionSigToSelector(funcSig);

            if (selectorsToIgnore.has(selector)) {
                continue;
            }

            facet.selectors.push(selector);

            if (allSelectors.has(selector)) {
                throw new Error(`function '${funcSig}' defined in multiple facets`);
            }
            allSelectors.add(selector);
        }

        results.push(facet);
    }

    return results;
}

function functionSigToSelector(functionSig: string) {
    const hash = keccak256(toUtf8Bytes(functionSig));
    return hash.substring(0, 10);
}

export enum FacetCutAction {
    Add,
    Update,
    Remove
}

export type FacetCut = {
    facetAddress: string;
    action: FacetCutAction;
    functionSelectors: BytesLike[];
}