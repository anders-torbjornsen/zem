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
exports.__esModule = true;
exports.Deployment = void 0;
var fs = __importStar(require("fs"));
var Deployment = /** @class */ (function () {
    function Deployment(network) {
        this.jsonFilePath = "./deployments/".concat(network, ".json");
        if (fs.existsSync(this.jsonFilePath)) {
            this.deployedContracts =
                JSON.parse(fs.readFileSync(this.jsonFilePath).toString());
        }
        else {
            this.deployedContracts = { contracts: {}, artifacts: {} };
        }
    }
    Deployment.prototype.writeToFile = function () {
        // prune any unneeded artifacts
        try {
            if (!fs.existsSync("./deployments")) {
                fs.mkdirSync("./deployments");
            }
            var usedBuildInfoIds = {};
            for (var contractId in this.deployedContracts.contracts) {
                usedBuildInfoIds[this.deployedContracts.contracts[contractId]
                    .buildInfo] = true;
                if (this.deployedContracts.contracts[contractId]
                    .implementation != undefined) {
                    usedBuildInfoIds[this.deployedContracts
                        .contracts[contractId]
                        .implementation.buildInfo] = true;
                }
            }
            var toPrune = [];
            for (var buildInfo in this.deployedContracts.artifacts) {
                if (usedBuildInfoIds[buildInfo] == undefined) {
                    toPrune.push(buildInfo);
                }
            }
            for (var i = 0; i < toPrune.length; ++i) {
                delete this.deployedContracts.artifacts[toPrune[i]];
            }
            for (var artifact in this.deployedContracts.artifacts) {
                delete this.deployedContracts.artifacts[artifact].output;
            }
        }
        catch (e) {
            console.error("Deployment:writeToFile()", e);
        }
        fs.writeFileSync(this.jsonFilePath, JSON.stringify(this.deployedContracts, null, 4));
    };
    return Deployment;
}());
exports.Deployment = Deployment;
//# sourceMappingURL=deployment.js.map