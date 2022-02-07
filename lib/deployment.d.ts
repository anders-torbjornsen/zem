declare type DeployedContracts = {
    contracts: any;
    artifacts: any;
};
export declare class Deployment {
    jsonFilePath: string;
    deployedContracts: DeployedContracts;
    constructor(network: string);
    writeToFile(): void;
}
export {};
//# sourceMappingURL=deployment.d.ts.map