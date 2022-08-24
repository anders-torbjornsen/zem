import { Deployment } from "../../src";
import hre from "hardhat";
import { DiamondFacet, DiamondFacet__factory, NFTFacet, NFTFacet__factory } from "../typechain-types";
import { FacetInitialiserStruct } from "../typechain-types/contracts/Diamond";
import { FacetConfig } from "../../src/deployment";

let deployment: Deployment;

async function main() {
    const [deployer] = await hre.ethers.getSigners();

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

    const diamondProxy = await deployment.deployDiamond("diamond", {
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

    const nft = NFTFacet__factory.connect(diamondProxy.address, deployer);
    console.log(await nft.name(), await nft.symbol());

    const diamond = DiamondFacet__factory.connect(diamondProxy.address, deployer);

    const facets = await diamond.facets();
    for (const facet of facets) {
        for (const selector of facet.selectors) {
            console.log(facet.target, selector);
        }
    }

    const diamondProxyCopy = await deployment.deployDiamond("diamond", {
        contract: "Diamond",
        autoUpdate: false,
        facets: facetConfig
    });

    const diamondProxy2 = await deployment.deployDiamond("diamond2", {
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
}

main().catch(e => console.error(e)).finally(() => {
    if (deployment !== undefined && deployment.hre.network.name != "hardhat") {
        console.log("saving to file");
        deployment.writeToFile();
    }
});