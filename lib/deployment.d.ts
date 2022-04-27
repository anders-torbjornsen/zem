import "@nomiclabs/hardhat-ethers";
import { Contract, Signer } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
interface ContractDeployConfig {
    contract: string;
    autoUpdate: boolean;
}
export interface ContractDeployConfigStandard extends ContractDeployConfig {
    id: string;
}
interface ContractDeployConfigERC1967 {
    id: string;
    proxy: ContractDeployConfig;
    implementation: ContractDeployConfig;
}
export declare class Deployment {
    private _hre;
    private _signer;
    private _jsonFilePath;
    private _deployedContracts;
    private _instances;
    private _proxyInstances;
    private _proxyImplInstances;
    get hre(): HardhatRuntimeEnvironment;
    get instances(): {
        [id: string]: Contract;
    };
    get proxyInstances(): {
        [id: string]: Contract;
    };
    get proxyImplInstances(): {
        [id: string]: Contract;
    };
    constructor(hre: HardhatRuntimeEnvironment, signer?: Signer);
    deploy(contractConfig: ContractDeployConfigStandard, ...args: any[]): Promise<Contract>;
    deployERC1967(contractConfig: ContractDeployConfigERC1967, getProxyConstructorArgs: (implementation: Contract) => any[], upgradeFunc: (proxy: Contract, newImplementation: Contract) => Promise<void>): Promise<Contract>;
    private _deploy;
    private _getERC1967ImplementationAddress;
    writeToFile(): void;
}
export {};
//# sourceMappingURL=deployment.d.ts.map