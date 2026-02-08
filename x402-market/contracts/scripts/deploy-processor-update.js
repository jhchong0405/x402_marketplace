/**
 * Deploy Updated PaymentProcessor
 * 
 * This script deploys only the updated PaymentProcessor and configures Escrow.
 */
const hre = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("\n🔧 Deploying Updated PaymentProcessor\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);

    // Load current deployment
    const deploymentPath = "/root/project/gwdc/x402-market/deployment.json";
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

    console.log(`\n📋 Current Deployment:`);
    console.log(`   Token: ${deployment.contracts.PaymentToken}`);
    console.log(`   Escrow: ${deployment.contracts.Escrow}`);
    console.log(`   Registry: ${deployment.contracts.ServiceRegistry}`);
    console.log(`   Old Processor: ${deployment.contracts.PaymentProcessor}`);

    // Deploy new PaymentProcessor
    const PaymentProcessor = await hre.ethers.getContractFactory("X402PaymentProcessor");
    const processor = await PaymentProcessor.deploy(
        deployment.contracts.PaymentToken,
        deployment.contracts.Escrow,
        deployment.contracts.ServiceRegistry
    );
    await processor.deployed();
    console.log(`\n✅ New PaymentProcessor deployed to: ${processor.address}`);

    // Transfer Escrow ownership to new Processor
    const escrow = await hre.ethers.getContractAt("X402Escrow", deployment.contracts.Escrow);

    console.log(`\n⚙️ Transferring Escrow ownership to new Processor...`);
    const tx = await escrow.transferOwnership(processor.address);
    await tx.wait();
    console.log(`   ✅ Escrow ownership transferred`);

    // Verify
    const newOwner = await escrow.owner();
    console.log(`   New Escrow Owner: ${newOwner}`);
    console.log(`   Match: ${newOwner.toLowerCase() === processor.address.toLowerCase() ? '✅' : '❌'}`);

    // Update deployment.json
    deployment.contracts.PaymentProcessor = processor.address;
    deployment.deployedAt = new Date().toISOString();
    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log(`\n📝 deployment.json updated`);

    // Update .env
    const envPath = "/root/project/gwdc/x402-market/.env";
    let envContent = fs.readFileSync(envPath, "utf8");
    envContent = envContent.replace(
        /PAYMENT_PROCESSOR_ADDRESS=.*/,
        `PAYMENT_PROCESSOR_ADDRESS=${processor.address}`
    );
    fs.writeFileSync(envPath, envContent);
    console.log(`📝 .env updated`);

    console.log("\n🎉 Deployment complete! Run user-test-flow.js to verify.\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
