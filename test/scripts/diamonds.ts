import { Deployment } from "../../src";
import hre from "hardhat";
import { DiamondFacet, NFTFacet } from "../typechain-types";
import { FacetInitialiserStruct } from "../typechain-types/contracts/Diamond";
import { FacetConfig } from "../../src/deployment";

let deployment: Deployment;

async function main() {
    deployment = await Deployment.create(hre);

    const facetConfig: FacetConfig[] = [
        {
            contract: "DiamondFacet",
            functionsToIgnore: ["init"]
        },
        {
            contract: "NFTFacet",
            functionsToIgnore: ["init"]
        }
    ];

    const diamond = await deployment.deployDiamond("diamond", {
        contract: "Diamond",
        autoUpdate: false,
        facets: facetConfig
    }, (facets) => {
        const diamondCut = deployment.calculateDiamondCut(facetConfig, []);

        const diamondFacet = facets["DiamondFacet"] as DiamondFacet;
        const diamondInit: FacetInitialiserStruct = {
            facetCuts: [],
            target: diamondFacet.address,
            data: diamondFacet.interface.encodeFunctionData("init")
        };

        const nftFacet = facets["NFTFacet"] as NFTFacet;
        const nftInit: FacetInitialiserStruct = {
            facetCuts: [],
            target: nftFacet.address,
            data: nftFacet.interface.encodeFunctionData("init", ["My Token", "MTKN", "https://baseuri.com"])
        };

        for (const facetCut of diamondCut) {
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
    });

    const nft = diamond as NFTFacet;
    console.log(await nft.name(), await nft.symbol());

    const facets = await (diamond as DiamondFacet).facets();
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