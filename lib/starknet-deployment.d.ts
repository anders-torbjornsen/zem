import "@shardlabs/starknet-hardhat-plugin/dist/type-extensions";
import { DeployOptions } from "@shardlabs/starknet-hardhat-plugin/dist/types";
import { HardhatRuntimeEnvironment, StarknetContract, StringMap } from "hardhat/types";
import { ContractDeployConfigStandard } from "./deployment";
export declare class StarknetDeployment {
    private static readonly DEPLOYMENTS_DIR;
    readonly hre: HardhatRuntimeEnvironment;
    readonly jsonFilePath: string;
    readonly instances: {
        [id: string]: StarknetContract;
    };
    private _json;
    constructor(hre: HardhatRuntimeEnvironment);
    deploy(contractConfig: ContractDeployConfigStandard, constructorArguments?: StringMap, options?: DeployOptions): Promise<StarknetContract>;
    writeToFile(): void;
}
//# sourceMappingURL=starknet-deployment.d.ts.map