import { HardhatRuntimeEnvironment } from "hardhat/types";
import "@shardlabs/starknet-hardhat-plugin/dist/type-extensions"
import * as fs from "fs";


export class StarknetDeployment
{
    private static readonly DEPLOYMENTS_DIR:string = "./starknet-deployments";

    public readonly hre:HardhatRuntimeEnvironment;
    public readonly jsonFilePath:string;
    private _persistentData:{[id:string]: string};

    constructor(hre:HardhatRuntimeEnvironment)
    {
        this.hre = hre;
        this.jsonFilePath = `${StarknetDeployment.DEPLOYMENTS_DIR}/${hre.config.starknet.network}.json`;

        if (fs.existsSync(this.jsonFilePath))
        {
            this._persistentData = JSON.parse(fs.readFileSync(this.jsonFilePath).toString());
        }
        else
        {
            this._persistentData = {};
        }
    }

    public writeToFile():void
    {
        if (!fs.existsSync(StarknetDeployment.DEPLOYMENTS_DIR))
        {
            fs.mkdirSync(StarknetDeployment.DEPLOYMENTS_DIR);
        }

        // using a similar shape to the json of L1
        // deployments for consistency
        fs.writeFileSync(
            this.jsonFilePath,
            JSON.stringify({contracts:this._persistentData}, null, 4));
    }
}