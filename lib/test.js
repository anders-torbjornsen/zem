"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
const hre = __importStar(require("hardhat"));
const deployment_1 = require("./deployment");
let deployment;
async function main() {
    await hre.run("compile");
    deployment = new deployment_1.Deployment(hre);
    let loot = await deployment.deploy({ id: "loot", contract: "contracts/Loot.sol:Loot", autoUpdate: true });
    console.log(await loot.getWeapon(0));
    let upgr = await deployment.deployERC1967({
        id: "upgrade",
        proxy: {
            contract: "contracts/ERC1967Proxy.sol:ERC1967Proxy",
            autoUpdate: false
        },
        implementation: {
            contract: "contracts/Upgradeable.sol:Upgradeable",
            autoUpdate: true
        }
    }, function (implementation) {
        return [
            implementation.address,
            implementation.interface.encodeFunctionData("init", [42, "the answer"])
        ];
    }, async function (proxy, newImplementation) {
        // TODO check that removing this will make it fail
        await (await proxy.setImplementation(newImplementation.address))
            .wait();
    });
    console.log(await upgr._number(), await upgr._str());
}
main()
    .catch(e => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => {
    deployment.writeToFile();
});
//# sourceMappingURL=test.js.map