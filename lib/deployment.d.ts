import "@nomiclabs/hardhat-ethers";
import { Contract, Signer, BytesLike } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
export interface ContractDeployConfig {
    contract: string;
    autoUpdate?: boolean;
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
export declare class Deployment {
    private _hre;
    private _signer;
    private _jsonFilePath;
    private _deployment;
    private _implContractsByAddress;
    private _instances;
    private _proxyInstances;
    private _proxyImplInstances;
    private _facetInstances;
    private _abiCachePath;
    private _abiCache;
    private _solc;
    private _compilers;
    get hre(): HardhatRuntimeEnvironment;
    get signer(): Signer | undefined;
    get instances(): {
        [id: string]: Contract;
    };
    get proxyInstances(): {
        [id: string]: Contract;
    };
    get proxyImplInstances(): {
        [id: string]: Contract;
    };
    get facetInstances(): {
        [id: string]: {
            [contract: string]: Contract;
        };
    };
    static create(hre: HardhatRuntimeEnvironment, signer?: Signer): Promise<Deployment>;
    private constructor();
    deploy(id: string, contractConfig: ContractDeployConfig, ...args: any[]): Promise<Contract>;
    deployERC1967(id: string, contractConfig: ContractDeployConfigERC1967, upgradeFunc: (proxy: Contract, newImplementation: Contract) => Promise<void>, getProxyConstructorArgs?: (implementation: Contract) => any[]): Promise<Contract>;
    deployDiamond(id: string, contractConfig: ContractDeployConfigDiamond, getProxyConstructorArgs?: (facets: {
        [contract: string]: Contract;
    }) => any[]): Promise<Contract>;
    private _deployContract;
    private _deployImpl;
    private _deploy;
    private _getERC1967ImplementationAddress;
    private _getContractInstance;
    private _getAbi;
    private _addToAbiCache;
    private _getImplDeploymentByAddress;
    private _getImplDeploymentByContract;
    writeToFile(): void;
    calculateDiamondCut(facets: FacetConfig[], currentFacets: IDiamondLoupeFacetStruct[]): FacetCut[];
}
export declare type IDiamondLoupeFacetStruct = {
    facetAddress: string;
    functionSelectors: BytesLike[];
};
export declare type Facet = {
    contract: string;
    selectors: BytesLike[];
};
export declare function getFacets(facets: FacetConfig[], hre: HardhatRuntimeEnvironment): Facet[];
export declare enum FacetCutAction {
    Add = 0,
    Update = 1,
    Remove = 2
}
export declare type FacetCut = {
    facetAddress: string;
    action: FacetCutAction;
    functionSelectors: BytesLike[];
};
//# sourceMappingURL=deployment.d.ts.map