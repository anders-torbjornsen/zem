import { Deployment, eip2535DiamondCutToSolidStateDiamondCut, FacetConfig } from "../../src";
import hre from "hardhat";
import { DiamondFacet, NFTFacet } from "../typechain-types";
import { InitialiserStruct } from "../typechain-types/contracts/DiamondProxyEmpty";

let deployment: Deployment;

async function main() {
    deployment = await Deployment.create(hre);

    // deployment of a common diamond contract
    const diamond1 = await deployment.deployDiamond("diamond1", {
        contract: "DiamondProxy",
        facets: [{
            contract: "NFTFacet",
            functionsToIgnore: ["__NFTFacet_init", "supportsInterface"],
            autoUpdate: true
        }]
    }, async (facets) => {
        const nftFacet = facets.NFTFacet as NFTFacet;

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

    // Second example is unlikely to be used by many people, but I wanted to show how to do it. This
    // is for those who want their DiamondReadable/DiamondWritable (DiamondLoupe/DiamondCut) 
    // functionality to be implemented by a facet rather than as immutable functions in the proxy.
    // This will probably mean you want to pass the initial facet cuts to the proxy constructor,
    // this example shows how you can get zem to calculate the diamond cut for you.
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
        // solid state IDiamondWritable.FacetCut struct is slightly different to 
        // IDiamondCut.FacetCut, so use this helper to convert between the two
        const diamondCut = eip2535DiamondCutToSolidStateDiamondCut(
            await deployment.calculateDiamondCut("", facetConfig, []));

        const diamondFacet = facets.DiamondFacet as DiamondFacet;
        const diamondInit: InitialiserStruct = {
            target: diamondFacet.address,
            data: diamondFacet.interface.encodeFunctionData("__DiamondFacet_init")
        };

        const nftFacet = facets.NFTFacet as NFTFacet;
        const nftInit: InitialiserStruct = {
            target: nftFacet.address,
            data: nftFacet.interface.encodeFunctionData("__NFTFacet_init", ["My Token", "MTKN", "https://baseuri.com"])
        };

        return [diamondCut, [diamondInit, nftInit]];
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