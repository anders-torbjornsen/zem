import { HardhatRuntimeEnvironment } from "hardhat/types";
import "@shardlabs/starknet-hardhat-plugin/dist/type-extensions";
export declare class StarknetDeployment {
    private static readonly DEPLOYMENTS_DIR;
    readonly hre: HardhatRuntimeEnvironment;
    readonly jsonFilePath: string;
    private _persistentData;
    constructor(hre: HardhatRuntimeEnvironment);
    writeToFile(): void;
}
//# sourceMappingURL=starknet-deployment.d.ts.map