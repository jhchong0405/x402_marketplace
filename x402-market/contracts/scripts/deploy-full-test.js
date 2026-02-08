const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("🚀 Deploying Fresh Test Environment (Token + x402 System)...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log(`   Deployer: ${deployer.address}`);

    // 1. Deploy MockUSDC
    console.log("\n📄 Deploying MockUSDC (EIP-3009)...");
    const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
    const token = await MockUSDC.deploy();
    await token.deployed();
    console.log(`   ✅ MockUSDC deployed to: ${token.address}`);

    // 2. Deploy ServiceRegistry
    console.log("\n📄 Deploying ServiceRegistry...");
    const Registry = await hre.ethers.getContractFactory("X402ServiceRegistry");
    const registry = await Registry.deploy();
    await registry.deployed();
    console.log(`   ✅ ServiceRegistry deployed to: ${registry.address}`);

    // 3. Deploy Escrow
    const treasury = deployer.address;
    const platformFee = 5; // 5%
    console.log("\n📄 Deploying Escrow...");
    const Escrow = await hre.ethers.getContractFactory("X402Escrow");
    const escrow = await Escrow.deploy(token.address, treasury);
    await escrow.deployed();
    console.log(`   ✅ Escrow deployed to: ${escrow.address}`);

    // 4. Deploy PaymentProcessor
    console.log("\n📄 Deploying PaymentProcessor...");
    const Processor = await hre.ethers.getContractFactory("X402PaymentProcessor");
    const processor = await Processor.deploy(token.address, escrow.address, registry.address);
    await processor.deployed();
    console.log(`   ✅ PaymentProcessor deployed to: ${processor.address}`);

    // 5. Configuration: Transfer Escrow Ownership
    console.log("\n⚙️ Configuring contracts...");
    const tx = await escrow.transferOwnership(processor.address);
    await tx.wait();
    console.log(`   ✅ Escrow ownership transferred to PaymentProcessor`);

    // 6. Save Deployment
    const deploymentData = {
        network: hre.network.name,
        chainId: hre.network.config.chainId || 71,
        deployedAt: new Date().toISOString(),
        contracts: {
            ServiceRegistry: registry.address,
            Escrow: escrow.address,
            PaymentProcessor: processor.address,
            PaymentToken: token.address
        },
        config: {
            treasury,
            platformFee
        }
    };

    const deploymentPath = path.join(__dirname, '../../deployment.json');
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentData, null, 2));
    console.log(`\n💾 Deployment saved to ${deploymentPath}`);

    // 7. Verify Domain Params (for debug)
    console.log("\n🔐 Token EIP-712 Params:");
    console.log(`   Name: ${await token.name()}`);
    console.log(`   Version: ${await token.version()}`); // Should be "Mock USD Coin", "1"
    console.log(`   ChainId: ${hre.network.config.chainId || (await deployer.provider.getNetwork()).chainId}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
