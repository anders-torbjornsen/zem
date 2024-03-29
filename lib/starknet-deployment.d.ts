import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ContractDeployConfig } from "./deployment";
import { Contract } from "starknet";
import "@playmint/hardhat-starknetjs";
import { BigNumberish } from "starknet/dist/utils/number";
export declare class StarknetDeployment {
    private static readonly DEPLOYMENTS_DIR;
    readonly hre: HardhatRuntimeEnvironment;
    readonly jsonFilePath: string;
    readonly instances: {
        [id: string]: Contract;
    };
    private _json;
    constructor(hre: HardhatRuntimeEnvironment);
    deploy(id: string, contractConfig: ContractDeployConfig, constructorArgs?: any[], addressSalt?: BigNumberish): Promise<Contract>;
    writeToFile(): void;
}
//# sourceMappingURL=starknet-deployment.d.ts.map