const { writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = network.config.chainId;

  console.log(`Deploying AgentMemoryVault to ${network.name} (${chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const AgentMemoryVault = await ethers.getContractFactory("AgentMemoryVault");
  const vault = await AgentMemoryVault.deploy();
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  const deployment = {
    network: network.name,
    chainId,
    contractName: "AgentMemoryVault",
    address,
    deployer: deployer.address,
    explorer: `https://chainscan.0g.ai/address/${address}`,
    deployedAt: new Date().toISOString()
  };

  mkdirSync("deployments", { recursive: true });
  writeFileSync(
    join("deployments", `${network.name}.json`),
    `${JSON.stringify(deployment, null, 2)}\n`
  );

  console.log(`AgentMemoryVault deployed: ${address}`);
  console.log(`Explorer: ${deployment.explorer}`);
  console.log(`Saved deployment to deployments/${network.name}.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

