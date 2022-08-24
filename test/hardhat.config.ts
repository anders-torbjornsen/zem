import { HardhatUserConfig } from "hardhat/types";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";

const config: HardhatUserConfig = {
    solidity: "0.8.9",
    networks: {
        ganache: { url: "http://127.0.0.1:7545" }
    }
}

export default config;