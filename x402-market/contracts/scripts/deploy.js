const hre = require("hardhat");

async function main() {
    console.log("🚀 Deploying X402 Smart Contracts to Conflux eSpace Testnet\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log(`Deploying with account: ${deployer.address}`);
    const balance = await deployer.getBalance();
    console.log(`Account balance: ${hre.ethers.utils.formatEther(balance)} CFX\n`);

    // Get token address (MockUSDC on Conflux testnet)
    const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS || "0xB6f2355db983518173A8cb3c1D94b92814950D89";
    const TREASURY_ADDRESS = deployer.address; // For now, deployer is treasury

    console.log(`Payment Token: ${TOKEN_ADDRESS}`);
    console.log(`Treasury: ${TREASURY_ADDRESS}\n`);

    // 1. Deploy ServiceRegistry
    console.log("📝 Deploying X402ServiceRegistry...");
    const ServiceRegistry = await hre.ethers.getContractFactory("X402ServiceRegistry");
    const registry = await ServiceRegistry.deploy();
    await registry.deployed();
    console.log(`✅ ServiceRegistry deployed to: ${registry.address}\n`);

    // 2. Deploy Escrow
    console.log("💰 Deploying X402Escrow...");
    const Escrow = await hre.ethers.getContractFactory("X402Escrow");
    const escrow = await Escrow.deploy(TOKEN_ADDRESS, TREASURY_ADDRESS);
    await escrow.deployed();
    console.log(`✅ Escrow deployed to: ${escrow.address}\n`);

    // 3. Deploy PaymentProcessor
    console.log("💳 Deploying X402PaymentProcessor...");
    const PaymentProcessor = await hre.ethers.getContractFactory("X402PaymentProcessor");
    const processor = await PaymentProcessor.deploy(
        TOKEN_ADDRESS,
        escrow.address,
        registry.address
    );
    await processor.deployed();
    console.log(`✅ PaymentProcessor deployed to: ${processor.address}\n`);

    // 4. Configure Escrow - Set PaymentProcessor as owner
    console.log("⚙️  Configuring contracts...");
    const tx = await escrow.transferOwnership(processor.address);
    await tx.wait();
    console.log("✅ Escrow ownership transferred to PaymentProcessor\n");

    // 5. Summary
    console.log("════════════════════════════════════════════════════");
    console.log("🎉 Deployment Complete!");
    console.log("════════════════════════════════════════════════════");
    console.log(`ServiceRegistry:  ${registry.address}`);
    console.log(`Escrow:           ${escrow.address}`);
    console.log(`PaymentProcessor: ${processor.address}`);
    console.log(`Token:            ${TOKEN_ADDRESS}`);
    console.log(`Treasury:         ${TREASURY_ADDRESS}`);
    console.log("════════════════════════════════════════════════════\n");

    // Save deployment addresses
    const fs = require('fs');
    const deployment = {
        network: "conflux-testnet",
        chainId: 71,
        deployedAt: new Date().toISOString(),
        contracts: {
            ServiceRegistry: registry.address,
            Escrow: escrow.address,
            PaymentProcessor: processor.address,
            PaymentToken: TOKEN_ADDRESS,
        },
        config: {
            treasury: TREASURY_ADDRESS,
            platformFee: 5,
        }
    };

    fs.writeFileSync(
        '../deployment.json',
        JSON.stringify(deployment, null, 2)
    );
    console.log("💾 Deployment info saved to deployment.json\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

