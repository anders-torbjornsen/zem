import { Deployment } from "@anders-t/zem";
import hre from "hardhat";
import { DiamondFacet__factory, NFTFacet__factory } from "../typechain-types";

let deployment: Deployment;

async function main() {
    const [deployer] = await hre.ethers.getSigners();

    deployment = new Deployment(hre);

    const diamondProxy = await deployment.deployDiamond({
        id: "diamond",
        proxy: "Diamond.sol:Diamond",
        facets: [
            {
                contract: "DiamondFacet.sol:DiamondFacet"
            },
            {
                contract: "NFTFacet.sol:NFTFacet"
            }
        ]
    });

    /*
        const init: FacetInitialiserStruct[] = [];
    
        init.push(facetInitialiser(diamondFacet, diamondFacet.interface.encodeFunctionData("init"), ["init"]));
        init.push(facetInitialiser(nftFacet, nftFacet.interface.encodeFunctionData("init", ["My Token", "MTKN", "https://baseuri.com"]), ["init"]));
    
        const diamondProxy = await new Diamond__factory(deployer).deploy(init);
        */

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
    if (deployment !== undefined) {
        console.log("saving to file");
        deployment.writeToFile();
    }
});