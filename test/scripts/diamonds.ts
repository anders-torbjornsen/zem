import { Deployment } from "../../src";
import hre from "hardhat";
import { DiamondFacet, DiamondFacet__factory, NFTFacet, NFTFacet__factory } from "../typechain-types";
import { FacetInitialiserStruct } from "../typechain-types/contracts/Diamond";
import { FacetConfig } from "../../src/deployment";

let deployment: Deployment;

async function main() {
    const [deployer] = await hre.ethers.getSigners();

    deployment = new Deployment(hre);

    const facetConfig: FacetConfig[] = [
        {
            contract: "contracts/DiamondFacet.sol:DiamondFacet",
            functionsToIgnore: ["init"]
        },
        {
            contract: "contracts/NFTFacet.sol:NFTFacet",
            functionsToIgnore: ["init"]
        }
    ];

    const diamondProxy = await deployment.deployDiamond({
        id: "diamond",
        contract: "contracts/Diamond.sol:Diamond",
        autoUpdate: false,
        facets: facetConfig,
        getProxyConstructorArgs: (facets) => {
            const facetCuts = deployment.calculateFacetCuts(facetConfig, []);

            const diamondFacet = facets["contracts/DiamondFacet.sol:DiamondFacet"] as DiamondFacet;
            const diamondInit: FacetInitialiserStruct = {
                facetCuts: [],
                target: diamondFacet.address,
                data: diamondFacet.interface.encodeFunctionData("init")
            };

            const nftFacet = facets["contracts/NFTFacet.sol:NFTFacet"] as NFTFacet;
            const nftInit: FacetInitialiserStruct = {
                facetCuts: [],
                target: nftFacet.address,
                data: nftFacet.interface.encodeFunctionData("init", ["My Token", "MTKN", "https://baseuri.com"])
            };

            for (const facetCut of facetCuts) {
                if (facetCut.facetAddress == diamondFacet.address) {
                    diamondInit.facetCuts.push({
                        target: facetCut.facetAddress,
                        action: facetCut.action,
                        selectors: facetCut.functionSelectors
                    });
                }
                else if (facetCut.facetAddress == nftFacet.address) {
                    nftInit.facetCuts.push({
                        target: facetCut.facetAddress,
                        action: facetCut.action,
                        selectors: facetCut.functionSelectors
                    });
                }
            }

            return [[diamondInit, nftInit]];
        }
    });

    const nft = NFTFacet__factory.connect(diamondProxy.address, deployer);
    console.log(await nft.name(), await nft.symbol());

    const diamond = DiamondFacet__factory.connect(diamondProxy.address, deployer);

    const facets = await diamond.facets();
    for (const facet of facets) {
        for (const selector of facet.selectors) {
            console.log(facet.target, selector);
        }
    }
}

main().catch(e => console.error(e)).finally(() => {
    if (deployment !== undefined && deployment.hre.network.name != "hardhat") {
        console.log("saving to file");
        deployment.writeToFile();
    }
});