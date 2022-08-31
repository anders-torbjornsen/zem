import { Deployment } from "../../src";
import hre from "hardhat";
import { DiamondFacet, NFTFacet } from "../typechain-types";
import { FacetInitialiserStruct } from "../typechain-types/contracts/Diamond";
import { FacetConfig } from "../../src/deployment";

let deployment: Deployment;

async function main() {
    deployment = await Deployment.create(hre);

    // TODO first do a diamond with the non empty proxy

    const diamond1 = await deployment.deployDiamond("diamond1", {
        contract: "DiamondProxy",
        autoUpdate: false,
        facets: [{
            contract: "NFTFacet",
            functionsToIgnore: ["__NFTFacet_init", "supportsInterface"]
        }]
    }, async (facets) => {
        const nftFacet = facets["NFTFacet"] as NFTFacet;

        const initData = nftFacet.interface.encodeFunctionData("__NFTFacet_init", ["My Token", "MTKN", "https://baseuri.com"]);
        return [nftFacet.address, initData];
    });

    const nft1 = diamond1 as NFTFacet;
    console.log(await nft1.name(), await nft1.symbol());

    const facets1 = await (diamond1 as DiamondFacet).facets();
    for (const facet of facets1) {
        for (const selector of facet.selectors) {
            console.log(facet.target, selector);
        }
    }


    // TODO then show with empty proxy, stress this is probably uncommon but you can do it and this is how etc

    const facetConfig: FacetConfig[] = [
        {
            contract: "DiamondFacet",
            functionsToIgnore: ["__DiamondFacet_init"]
        },
        {
            contract: "NFTFacet",
            functionsToIgnore: ["__NFTFacet_init"]
        }
    ];

    const diamond2 = await deployment.deployDiamond("diamond2", {
        contract: "DiamondProxyEmpty",
        autoUpdate: false,
        facets: facetConfig
    }, async (facets) => {
        const diamondCut = await deployment.calculateDiamondCut("", facetConfig, []);

        const diamondFacet = facets["DiamondFacet"] as DiamondFacet;
        const diamondInit: FacetInitialiserStruct = {
            facetCuts: [],
            target: diamondFacet.address,
            data: diamondFacet.interface.encodeFunctionData("__DiamondFacet_init")
        };

        const nftFacet = facets["NFTFacet"] as NFTFacet;
        const nftInit: FacetInitialiserStruct = {
            facetCuts: [],
            target: nftFacet.address,
            data: nftFacet.interface.encodeFunctionData("__NFTFacet_init", ["My Token", "MTKN", "https://baseuri.com"])
        };

        // TODO simplify this, just have facet cuts and init address/data array
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

    const nft2 = diamond2 as NFTFacet;
    console.log(await nft2.name(), await nft2.symbol());

    const facets2 = await (diamond2 as DiamondFacet).facets();
    for (const facet of facets2) {
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