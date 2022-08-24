import "@nomiclabs/hardhat-ethers"

import * as crypto from "crypto"
import { Contract, ContractFactory, Signer, BytesLike } from "ethers";
import { Interface, Fragment } from "@ethersproject/abi";
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

interface ERC1967Deployment extends ContractDeployment {
    implementation: ContractDeployment
}

// TODO include these in the pruning code
interface DeployedFacet { // TODO inline this in the facets bit, already enough there as it is
    address: string;
    buildInfoId: string;
}

interface DeployedContracts {
    contracts: { [id: string]: ContractDeployment | ERC1967Deployment };
    facets: { // TODO rename this so it's not diamond specific, and use for erc1967
        byContract: {
            [contract: string]: {
                [bytecodeHash: string]: DeployedFacet
            }
        };
        byAddress: {
            [address: string]: {
                contract: string;
                version: string;
            }
        }
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
            this._deployedContracts =
                JSON.parse(fs.readFileSync(this._jsonFilePath).toString());
        }
        else {
            this._deployedContracts = {
                contracts: {},
                artifacts: {},
                facets: {
                    byContract: {},
                    byAddress: {}
                }
            };
        }
    }

    async deploy(
        id: string,
        contractConfig: ContractDeployConfig,
        ...args: any[]): Promise<Contract> {

        this._deployedContracts.contracts[id] = await this._deploy(
            contractConfig,
            args,
            this._deployedContracts.contracts[id]);

        const instance = this._getContractInstance(this._deployedContracts.contracts[id]);

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

        // TODO rename _deployedContracts to _deployment or something
        let contractDeployment = this._deployedContracts.contracts[id] as ERC1967Deployment;

        const implDeployment = await this._deploy(
            contractConfig.implementation,
            [],
            contractDeployment ? contractDeployment.implementation : undefined);
        const implementation = this._getContractInstance(implDeployment);

        this._deployedContracts.contracts[id] = await this._deploy(
            contractConfig.proxy,
            getProxyConstructorArgs ? getProxyConstructorArgs(implementation) : [],
            contractDeployment);

        contractDeployment = this._deployedContracts.contracts[id] as ERC1967Deployment;
        contractDeployment.implementation = implDeployment;

        const proxy = this._getContractInstance(contractDeployment);
        const instance = this._getContractInstance(implDeployment, contractDeployment.address);

        let currentImplementation: string =
            await this._getERC1967ImplementationAddress(contractDeployment.address);
        if (currentImplementation != implDeployment.address) {
            // TODO update all the logs
            console.log("implementation contract has changed, updating");
            await upgradeFunc(instance, implementation);

            if (await this._getERC1967ImplementationAddress(contractDeployment.address) !=
                implDeployment.address) {
                throw "failed to update implementation to the correct address";
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

        const currentFacets = this._deployedContracts.contracts[id] ?
            await (new Contract(this._deployedContracts.contracts[id].address, diamondAbi, this._signer)).facets() as IDiamondLoupeFacetStruct[] : [];

        const currentFacetLookup: { [contract: string]: ContractDeployment } = {};
        for (const currentFacet of currentFacets) {
            const facetInfo = this._deployedContracts.facets.byAddress[currentFacet.facetAddress];
            currentFacetLookup[facetInfo.contract] = {
                contract: facetInfo.contract,
                address: currentFacet.facetAddress,
                bytecodeHash: facetInfo.version,
                buildInfoId: this._deployedContracts.facets.byContract[facetInfo.contract][facetInfo.version].buildInfoId
            };
        }

        const facets: { [contract: string]: Contract } = {};
        for (const facetConfig of contractConfig.facets) {
            // have to work with fully qualified contract names
            const artifact = this._hre.artifacts.readArtifactSync(facetConfig.contract);
            const fullyQualifiedContractName = `${artifact.sourceName}:${artifact.contractName}`;

            let currentDeployedFacet = facetConfig.autoUpdate ?
                undefined : currentFacetLookup[fullyQualifiedContractName];
            // in the case of autoUpdate being true then we always want the latest version of 
            // the contract, if there is no instance of this facet hooked up to the diamond yet 
            // then we also want the latest version. So we see if it's already deployed, and if 
            // not then use undefined so _deploy will deploy it for us
            if (!currentDeployedFacet) {
                const buildInfo = await this._hre.artifacts.getBuildInfo(fullyQualifiedContractName);
                const version = getBytecodeHash(artifact);
                if (this._deployedContracts.facets.byContract[fullyQualifiedContractName] &&
                    this._deployedContracts.facets.byContract[fullyQualifiedContractName][version]) {
                    currentDeployedFacet = {
                        address: this._deployedContracts.facets.byContract[fullyQualifiedContractName][version].address,
                        contract: fullyQualifiedContractName,
                        bytecodeHash: version,
                        buildInfoId: buildInfo!.id
                    };
                }
            }

            const deployedFacet = await this._deploy(
                facetConfig,
                [],
                currentDeployedFacet);

            facets[facetConfig.contract] = this._getContractInstance(deployedFacet);

            if (!this._deployedContracts.facets.byContract[deployedFacet.contract]) {
                this._deployedContracts.facets.byContract[deployedFacet.contract] = {};
            }

            this._deployedContracts.facets.byContract[deployedFacet.contract][deployedFacet.bytecodeHash] = {
                address: deployedFacet.address,
                buildInfoId: deployedFacet.buildInfoId
            };

            this._deployedContracts.facets.byAddress[deployedFacet.address] = {
                contract: deployedFacet.contract,
                version: deployedFacet.bytecodeHash
            };
        }

        // generate proxy constructor args with callback to project code
        const proxyConstructorArgs = getProxyConstructorArgs ?
            getProxyConstructorArgs(facets) : [];

        // deploy proxy contract
        this._deployedContracts.contracts[id] = await this._deploy(
            contractConfig,
            proxyConstructorArgs,
            this._deployedContracts.contracts[id]);

        const deployedDiamond = this._deployedContracts.contracts[id];

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

    private async _deploy(
        contractConfig: ContractDeployConfig,
        args: any[],
        currentDeployment?: ContractDeployment): Promise<ContractDeployment> {

        console.log(`deploying: ${contractConfig.contract} | autoUpdate=${contractConfig.autoUpdate || false}`);

        const artifact: Artifact = this._hre.artifacts.readArtifactSync(contractConfig.contract);
        const fullyQualifiedContractName = `${artifact.sourceName}:${artifact.contractName}`;

        const bytecodeHash = getBytecodeHash(artifact);

        if (currentDeployment) {
            console.log(`- already deployed at ${currentDeployment.address}`);

            if (currentDeployment.bytecodeHash != bytecodeHash &&
                contractConfig.autoUpdate) {
                console.log(`- out of date (${currentDeployment.bytecodeHash} -> ${bytecodeHash})`);
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

        const buildInfo: BuildInfo | undefined =
            await this._hre.artifacts.getBuildInfo(fullyQualifiedContractName);
        if (buildInfo == undefined) {
            throw new Error("buildInfo not found for " + fullyQualifiedContractName);
        }
        if (this._deployedContracts.artifacts[buildInfo.id] == undefined) {
            this._deployedContracts.artifacts[buildInfo.id] = buildInfo;
        }

        const contractFactory: ContractFactory =
            await this._hre.ethers.getContractFactoryFromArtifact(artifact, this._signer);
        const instance: Contract =
            await (await contractFactory.deploy(...args)).deployed();

        console.log("- deployed at", instance.address);

        currentDeployment.contract = fullyQualifiedContractName;
        currentDeployment.address = instance.address;
        currentDeployment.bytecodeHash = bytecodeHash;
        currentDeployment.buildInfoId = buildInfo.id;

        return currentDeployment;
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
        const abi = this._deployedContracts.artifacts[contractDeployment.buildInfoId].output.contracts[sourceName][contractName].abi;
        return new Contract(address || contractDeployment.address, abi, this._signer);
    }

    writeToFile(): void {
        // prune any unneeded artifacts
        try {
            if (!fs.existsSync("./deployments")) {
                fs.mkdirSync("./deployments");
            }

            let usedBuildInfoIds = new Set<string>();
            for (const contractId in this._deployedContracts.contracts) {
                let contractDeployment =
                    this._deployedContracts.contracts[contractId];

                usedBuildInfoIds.add(contractDeployment.buildInfoId);

                let erc1967Deployment =
                    contractDeployment as ERC1967Deployment;
                if (erc1967Deployment.implementation) {
                    usedBuildInfoIds.add(
                        erc1967Deployment.implementation.buildInfoId);
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

    calculateDiamondCut(facets: FacetConfig[], currentFacets: IDiamondLoupeFacetStruct[]): FacetCut[] {
        // TODO include a test for autoupdate
        const facetAutoUpdate: { [contract: string]: boolean } = {};
        for (const facet of facets) {
            facetAutoUpdate[facet.contract] = facet.autoUpdate || false;
        }

        const currentFacetAddresses: { [contract: string]: string } = {};
        for (const facet of currentFacets) {
            currentFacetAddresses[this._deployedContracts.facets.byAddress[facet.facetAddress].contract] = facet.facetAddress;
        }

        const selectorToAddress: { [selector: string]: string } = {};
        for (const facet of getFacets(facets, this._hre)) {
            const artifact = this._hre.artifacts.readArtifactSync(facet.contract);
            const fullyQualifiedContractName = `${artifact.sourceName}:${artifact.contractName}`;

            let facetAddress = currentFacetAddresses[fullyQualifiedContractName];

            if (!facetAddress || facetAutoUpdate[facet.contract]) {
                const bytecodeHash = getBytecodeHash(artifact);
                const deployedFacet = this._deployedContracts.facets.byContract[fullyQualifiedContractName][bytecodeHash];
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