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
exports.eip2535FacetCutToSolidstateFacetCut = exports.eip2535DiamondCutToSolidStateDiamondCut = exports.IDiamondCutFacetCutAction = exports.Deployment = void 0;
require("@nomiclabs/hardhat-ethers");
const crypto = __importStar(require("crypto"));
const ethers_1 = require("ethers");
const abi_1 = require("@ethersproject/abi");
const constants_1 = require("@ethersproject/constants");
const keccak256_1 = require("@ethersproject/keccak256");
const strings_1 = require("@ethersproject/strings");
const bytes_1 = require("@ethersproject/bytes");
const fs = __importStar(require("fs"));
class Deployment {
    constructor(hre, signer) {
        this._instances = {};
        this._proxyInstances = {};
        this._proxyImplInstances = {};
        this._facetInstances = {};
        this._abiCachePath = `${hre.config.paths.cache}/zem-abi-cache.json`;
        this._abiCache = fs.existsSync(this._abiCachePath) ?
            JSON.parse(fs.readFileSync(this._abiCachePath).toString()) : {};
        this._compilers = {};
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
                const contractDeployment = this._deployment.implContracts[contract][bytecodeHash];
                this._implContractsByAddress[contractDeployment.address] = {
                    contract,
                    bytecodeHash
                };
            }
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
    get facetInstances() {
        return this._facetInstances;
    }
    static async create(hre, signer) {
        return new Deployment(hre, signer || (await hre.ethers.getSigners())[0]);
    }
    async deploy(id, contractConfig, ...args) {
        console.log(`deploy(${id})`);
        this._deployment.contracts[id] = await this._deployContract(contractConfig, async () => { return args; }, this._deployment.contracts[id]);
        const instance = await this._getContractInstance(this._deployment.contracts[id]);
        this._instances[id] = instance;
        return instance;
    }
    async deployERC1967(id, contractConfig, upgradeFunc, getProxyConstructorArgs) {
        console.log(`deployERC1967(${id})`);
        let contractDeployment = this._deployment.contracts[id];
        let currentImplAddress = contractDeployment ?
            await this._getERC1967ImplementationAddress(contractDeployment.address) : undefined;
        const implDeployment = await this._deployImpl(contractConfig.implementation, currentImplAddress);
        const implementation = await this._getContractInstance(implDeployment);
        this._deployment.contracts[id] = await this._deployContract(contractConfig.proxy, async () => { return getProxyConstructorArgs ? getProxyConstructorArgs(implementation) : []; }, contractDeployment);
        contractDeployment = this._deployment.contracts[id];
        const proxy = await this._getContractInstance(contractDeployment);
        const instance = await this._getContractInstance(implDeployment, contractDeployment.address);
        let currentImplementationAddress = await this._getERC1967ImplementationAddress(contractDeployment.address);
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
    async deployDiamond(id, contractConfig, getProxyConstructorArgs) {
        console.log(`deployDiamond(${id})`);
        const diamondAbi = new abi_1.Interface(`[
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
                        "internalType": "enum IDiamondCut.IDiamondCutFacetCutAction",
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
                    "name": "_diamondCut",
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
            await (new ethers_1.Contract(this._deployment.contracts[id].address, diamondAbi, this._signer)).facets() : [];
        const currentFacetLookup = {};
        for (const currentFacet of currentFacets) {
            // make sure this facet isn't the proxy itself (immutable functions)
            if (currentFacet.facetAddress == this._deployment.contracts[id].address) {
                continue;
            }
            const facetDeployment = this._getImplDeploymentByAddress(currentFacet.facetAddress);
            currentFacetLookup[facetDeployment.contract] = facetDeployment;
        }
        this._facetInstances[id] = {};
        for (const facetConfig of contractConfig.facets) {
            // have to work with fully qualified contract names
            const artifact = this._hre.artifacts.readArtifactSync(facetConfig.contract);
            const fullyQualifiedContractName = `${artifact.sourceName}:${artifact.contractName}`;
            const currentDeployedFacet = facetConfig.autoUpdate ?
                undefined : currentFacetLookup[fullyQualifiedContractName];
            const deployedFacet = await this._deployImpl(facetConfig, currentDeployedFacet ? currentDeployedFacet.address : undefined);
            this._facetInstances[id][facetConfig.contract] = await this._getContractInstance(deployedFacet);
        }
        // deploy proxy contract
        this._deployment.contracts[id] = await this._deployContract(contractConfig, async () => { return getProxyConstructorArgs ? getProxyConstructorArgs(this._facetInstances[id]) : []; }, this._deployment.contracts[id]);
        const deployedProxy = this._deployment.contracts[id];
        const proxy = await this._getContractInstance(deployedProxy);
        // use diamond abi for now, as diamondCut() and facets() may not exist in the proxy
        // contract, they could be in a facet
        const diamondProxy = new ethers_1.Contract(deployedProxy.address, diamondAbi, this._signer);
        // apply diamond cut if needed
        const diamondCut = await this.calculateDiamondCut(deployedProxy.address, contractConfig.facets, await diamondProxy.facets());
        if (diamondCut.length) {
            // this next section is all just for logging
            console.log("- diamondCut");
            const selectorLookup = {};
            const facets = this._facetInstances[id];
            for (const facet in facets) {
                for (const func in facets[facet].interface.functions) {
                    selectorLookup[functionSigToSelector(func)] = func;
                }
            }
            for (const facetCut of diamondCut) {
                console.log(` - ${IDiamondCutFacetCutAction[facetCut.action]} | ${facetCut.facetAddress}`);
                for (const selector of facetCut.functionSelectors) {
                    const selectorStr = (0, bytes_1.hexlify)(selector);
                    console.log(`  - ${selectorLookup[selectorStr] ? `${selectorLookup[selectorStr]} | ` : ""}${selectorStr}`);
                }
            }
            await (await diamondProxy.diamondCut(diamondCut, constants_1.AddressZero, [])).wait();
        }
        // now create a contract object with an ABI combining that of all the facets
        // need to keep track of identifiers so we don't end up with duplicates
        const allIdentifiers = new Set();
        // start by copying the interface of the proxy contract as is
        const combinedInterface = proxy.interface.fragments.map((fragment) => {
            if (fragment.type == "function" || fragment.type == "event") {
                allIdentifiers.add(fragment.format());
            }
            return fragment;
        });
        // figure out all the selectors which have a facet set for them, used to selectively only
        // add function fragments to the combined interface if the selector for that fragment is
        // actually set up on the proxy contract. For example, a facet contract could contain 
        // functions which are not used by this proxy.
        const allSelectors = new Set();
        for (const facet of (await diamondProxy.facets())) {
            for (const selector of facet.functionSelectors) {
                allSelectors.add((0, bytes_1.hexlify)(selector));
            }
        }
        // now merge the facet interfaces
        const facets = this._facetInstances[id];
        for (const facet in facets) {
            for (const fragment of facets[facet].interface.fragments) {
                if (fragment.type == "function") {
                    const sig = fragment.format();
                    const selector = functionSigToSelector(sig);
                    // only add this function to the interface if this selector is one of the ones
                    // that this proxy will recognise
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
        const diamond = new ethers_1.Contract(deployedProxy.address, combinedInterface, this._signer);
        this._instances[id] = diamond;
        this._proxyInstances[id] = proxy;
        return diamond;
    }
    async _deployContract(contractConfig, getArgs, // this is a func so that args are only generated if actually needed
    currentDeployment) {
        const artifact = this._hre.artifacts.readArtifactSync(contractConfig.contract);
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
        const deployment = await this._deploy(fullyQualifiedContractName, artifact.abi, artifact.bytecode, bytecodeHash, await getArgs());
        console.log(` - deployed | address:${deployment.address}`);
        return deployment;
    }
    async _deployImpl(contractConfig, currentAddress) {
        // have to work with fully qualified contract names
        const artifact = this._hre.artifacts.readArtifactSync(contractConfig.contract);
        const fullyQualifiedContractName = `${artifact.sourceName}:${artifact.contractName}`;
        const bytecodeHash = getBytecodeHash(artifact);
        console.log(`- deploy impl contract | ${fullyQualifiedContractName} | autoUpdate:${contractConfig.autoUpdate || false}`);
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
    async _deploy(fullyQualifiedContractName, contractInterface, bytecode, bytecodeHash, args) {
        const buildInfo = await this._hre.artifacts.getBuildInfo(fullyQualifiedContractName);
        if (buildInfo == undefined) {
            throw new Error("buildInfo not found for " + fullyQualifiedContractName);
        }
        if (this._deployment.artifacts[buildInfo.id] == undefined) {
            this._deployment.artifacts[buildInfo.id] = buildInfo;
        }
        const contractFactory = new ethers_1.ContractFactory(contractInterface, bytecode, this._signer);
        const instance = await (await contractFactory.deploy(...args)).deployed();
        if (!this._abiCache[buildInfo.id]) {
            this._addToAbiCache(buildInfo.id, buildInfo.output);
        }
        return {
            contract: fullyQualifiedContractName,
            address: instance.address,
            bytecodeHash,
            buildInfoId: buildInfo.id
        };
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
    async _getContractInstance(contractDeployment, address) {
        const abi = await this._getAbi(contractDeployment.buildInfoId, contractDeployment.contract);
        return new ethers_1.Contract(address || contractDeployment.address, abi, this._signer);
    }
    async _getAbi(buildInfoId, contract) {
        if (this._abiCache[buildInfoId]) {
            return this._abiCache[buildInfoId][contract];
        }
        console.log(`abi not in cache ${contract} from build ${buildInfoId}`);
        const buildInfo = this._deployment.artifacts[buildInfoId];
        const solcVersion = "v" + buildInfo.solcLongVersion;
        if (!this._compilers[solcVersion]) {
            if (!this._solc) {
                console.log("loading solcjs");
                this._solc = await require("solc");
            }
            console.log(`downloading solc ${solcVersion}`);
            this._compilers[solcVersion] = await new Promise((resolve, reject) => {
                this._solc.loadRemoteVersion(solcVersion, (err, solc) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(solc);
                    }
                });
            });
        }
        console.log(`compiling ${buildInfoId} with solc ${solcVersion}`);
        const output = JSON.parse(this._compilers[solcVersion].compile(JSON.stringify(buildInfo.input)));
        this._addToAbiCache(buildInfoId, output);
        return this._abiCache[buildInfoId][contract];
    }
    _addToAbiCache(buildInfoId, compilerOutput) {
        this._abiCache[buildInfoId] = {};
        for (const source in compilerOutput.contracts) {
            for (const contract in compilerOutput.contracts[source]) {
                this._abiCache[buildInfoId][`${source}:${contract}`] = compilerOutput.contracts[source][contract].abi;
            }
        }
        fs.writeFileSync(this._abiCachePath, JSON.stringify(this._abiCache, null, 4));
    }
    _getImplDeploymentByAddress(address) {
        const deploymentInfo = this._implContractsByAddress[address];
        return {
            contract: deploymentInfo.contract,
            address: address,
            bytecodeHash: deploymentInfo.bytecodeHash,
            buildInfoId: this._deployment.implContracts[deploymentInfo.contract][deploymentInfo.bytecodeHash].buildInfoId
        };
    }
    _getImplDeploymentByContract(contract, bytecodeHash) {
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
    writeToFile() {
        // prune any unneeded artifacts
        try {
            if (!fs.existsSync("./deployments")) {
                fs.mkdirSync("./deployments");
            }
            let usedBuildInfoIds = new Set();
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
            let toPrune = [];
            for (const buildInfoId in this._deployment.artifacts) {
                if (!usedBuildInfoIds.has(buildInfoId) == undefined) {
                    toPrune.push(buildInfoId);
                }
            }
            for (let i = 0; i < toPrune.length; ++i) {
                delete this._deployment.artifacts[toPrune[i]];
            }
            // remove output as it's huge, can be rebuilt from input anyway
            for (const buildInfoId in this._deployment.artifacts) {
                delete this._deployment.artifacts[buildInfoId].output;
            }
        }
        catch (e) {
            console.error("Deployment:writeToFile()", e);
        }
        fs.writeFileSync(this._jsonFilePath, JSON.stringify(this._deployment, null, 4));
    }
    async calculateDiamondCut(proxyAddress, facets, currentFacets) {
        // create a set of immutable selectors so we can throw an error if the user is trying to
        // change an immutable selector (rather than silently fail)
        const immutableSelectors = new Set();
        // build a map of contract name to current facet contract address (if it exists), this 
        // is so we use the correct contract deployment for calculating the facet cut (if a facet is
        // already deployed and autoUpdate is false for example, we want to continue using a 
        // potentially outdated version of a contract which may have a different abi from the up to
        // date one)
        const currentFacetDeployments = {};
        for (const facet of currentFacets) {
            // selectors implemented by the proxy contract are immutable so can't be changed by a cut
            if (facet.facetAddress == proxyAddress) {
                for (const immutableSelector of facet.functionSelectors) {
                    immutableSelectors.add((0, bytes_1.hexlify)(immutableSelector));
                }
                continue;
            }
            const deployedFacet = this._getImplDeploymentByAddress(facet.facetAddress);
            currentFacetDeployments[deployedFacet.contract] = deployedFacet;
        }
        // as we iterate facets we build a map of selector to NEEDED facet address, this is so we
        // can calculate the needed diamond cut later
        const selectorToAddress = {};
        for (const facetConfig of facets) {
            const artifact = this._hre.artifacts.readArtifactSync(facetConfig.contract);
            const fullyQualifiedContractName = `${artifact.sourceName}:${artifact.contractName}`;
            let deployedFacet = currentFacetDeployments[fullyQualifiedContractName];
            if (!deployedFacet || facetConfig.autoUpdate) {
                const bytecodeHash = getBytecodeHash(artifact);
                deployedFacet = this._getImplDeploymentByContract(fullyQualifiedContractName, bytecodeHash);
                if (!deployedFacet) {
                    throw new Error(`latest version of '${fullyQualifiedContractName}' contract not found in the deployed proxy implementation contracts of deployment`);
                }
            }
            const facetInterface = new abi_1.Interface(await this._getAbi(deployedFacet.buildInfoId, deployedFacet.contract));
            const selectorsToIgnore = new Set();
            if (facetConfig.functionsToIgnore) {
                for (const func of facetConfig.functionsToIgnore) {
                    const selector = functionSigToSelector(getFunctionSig(func, facetInterface));
                    selectorsToIgnore.add(selector);
                }
            }
            if (facetConfig.selectorsToIgnore) {
                for (const selector of facetConfig.selectorsToIgnore) {
                    selectorsToIgnore.add((0, bytes_1.hexlify)(selector));
                }
            }
            for (const funcSig in facetInterface.functions) {
                const selector = functionSigToSelector(funcSig);
                if (selectorsToIgnore.has(selector)) {
                    continue;
                }
                if (immutableSelectors.has(selector)) {
                    throw new Error(`function '${funcSig}' is immutable, add it to ignored functions in facet config`);
                }
                if (selectorToAddress[selector]) {
                    throw new Error(`function '${funcSig}' defined in multiple facets`);
                }
                selectorToAddress[selector] = deployedFacet.address;
            }
        }
        // this will track what add/update/remove cuts are needed per facet address
        const addressToNeededCuts = {};
        // convenience function to get the neededCuts object for a given address, but creates an
        // empty one if it doesn't exist yet
        const getOrCreateNeededCuts = (address) => {
            if (!addressToNeededCuts[address]) {
                addressToNeededCuts[address] = { add: [], update: [], remove: [] };
            }
            return addressToNeededCuts[address];
        };
        // iterate current facets, compare against the needed facet addresses in selectorToAddress
        // map, those which don't match need to be updated or removed
        for (const currentFacet of currentFacets) {
            // selectors implemented by the proxy contract are immutable so can't be changed by a cut
            if (currentFacet.facetAddress == proxyAddress) {
                continue;
            }
            for (const functionSelector of currentFacet.functionSelectors) {
                const selectorStr = (0, bytes_1.hexlify)(functionSelector);
                const neededAddress = selectorToAddress[selectorStr];
                if (neededAddress != currentFacet.facetAddress) {
                    if (neededAddress) {
                        // update
                        getOrCreateNeededCuts(neededAddress).update.push(selectorStr);
                    }
                    else {
                        // remove
                        getOrCreateNeededCuts(constants_1.AddressZero).remove.push(selectorStr);
                    }
                }
                // remove processed selectors from the map, any which are left at the end of this
                // loop need to be added
                delete selectorToAddress[selectorStr];
            }
        }
        // previous loop deleted all updated selectors from selectorToAddress, so any remaining need
        // to be added
        for (const selector in selectorToAddress) {
            // add
            getOrCreateNeededCuts(selectorToAddress[selector]).add.push(selector);
        }
        const diamondCut = [];
        for (const address in addressToNeededCuts) {
            if (addressToNeededCuts[address].add.length) {
                diamondCut.push({
                    facetAddress: address,
                    action: IDiamondCutFacetCutAction.Add,
                    functionSelectors: addressToNeededCuts[address].add
                });
            }
            if (addressToNeededCuts[address].update.length) {
                diamondCut.push({
                    facetAddress: address,
                    action: IDiamondCutFacetCutAction.Update,
                    functionSelectors: addressToNeededCuts[address].update
                });
            }
            if (addressToNeededCuts[address].remove.length) {
                diamondCut.push({
                    facetAddress: address,
                    action: IDiamondCutFacetCutAction.Remove,
                    functionSelectors: addressToNeededCuts[address].remove
                });
            }
        }
        return diamondCut;
    }
}
exports.Deployment = Deployment;
function getBytecodeHash(artifact) {
    const hash = crypto.createHash("sha256");
    hash.update(artifact.deployedBytecode);
    return hash.digest("hex");
}
function getFunctionSig(func, contractInterface) {
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
function functionSigToSelector(functionSig) {
    const hash = (0, keccak256_1.keccak256)((0, strings_1.toUtf8Bytes)(functionSig));
    return hash.substring(0, 10);
}
// IDiamondCutFacetCutAction as defined in EIP-2535
var IDiamondCutFacetCutAction;
(function (IDiamondCutFacetCutAction) {
    IDiamondCutFacetCutAction[IDiamondCutFacetCutAction["Add"] = 0] = "Add";
    IDiamondCutFacetCutAction[IDiamondCutFacetCutAction["Update"] = 1] = "Update";
    IDiamondCutFacetCutAction[IDiamondCutFacetCutAction["Remove"] = 2] = "Remove";
})(IDiamondCutFacetCutAction = exports.IDiamondCutFacetCutAction || (exports.IDiamondCutFacetCutAction = {}));
function eip2535DiamondCutToSolidStateDiamondCut(diamondCut) {
    return diamondCut.map(facetCut => eip2535FacetCutToSolidstateFacetCut(facetCut));
}
exports.eip2535DiamondCutToSolidStateDiamondCut = eip2535DiamondCutToSolidStateDiamondCut;
function eip2535FacetCutToSolidstateFacetCut(facetCut) {
    return {
        target: facetCut.facetAddress,
        action: facetCut.action,
        selectors: facetCut.functionSelectors
    };
}
exports.eip2535FacetCutToSolidstateFacetCut = eip2535FacetCutToSolidstateFacetCut;
//# sourceMappingURL=deployment.js.map