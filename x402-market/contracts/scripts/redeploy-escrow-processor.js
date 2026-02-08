/**
 * Redeploy Escrow + Processor Only
 * 
 * Keeps existing Token and Registry, deploys new Escrow and Processor.
 */
const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("\n🔄 Redeploying Escrow + Processor\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);

    // Load current deployment
    const deploymentPath = "/root/project/gwdc/x402-market/deployment.json";
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

    const tokenAddress = deployment.contracts.PaymentToken;
    const registryAddress = deployment.contracts.ServiceRegistry;
    const treasury = deployment.config.treasury;

    console.log(`\n📋 Keeping Existing:`);
    console.log(`   Token: ${tokenAddress}`);
    console.log(`   Registry: ${registryAddress}`);

    // 1. Deploy new Escrow (with relayer = deployer for gasless claims)
    console.log("\n📄 Deploying new Escrow...");
    const Escrow = await hre.ethers.getContractFactory("X402Escrow");
    const escrow = await Escrow.deploy(tokenAddress, treasury, deployer.address);
    await escrow.deployed();
    console.log(`   ✅ Escrow deployed to: ${escrow.address}`);
    console.log(`   Relayer: ${deployer.address}`);

    // 2. Deploy new Processor
    console.log("\n📄 Deploying new PaymentProcessor...");
    const Processor = await hre.ethers.getContractFactory("X402PaymentProcessor");
    const processor = await Processor.deploy(tokenAddress, escrow.address, registryAddress);
    await processor.deployed();
    console.log(`   ✅ PaymentProcessor deployed to: ${processor.address}`);

    // 3. Transfer Escrow ownership to Processor
    console.log("\n⚙️ Transferring Escrow ownership to Processor...");
    const tx = await escrow.transferOwnership(processor.address, { gasLimit: 100000 });
    await tx.wait();
    console.log(`   ✅ Ownership transferred`);

    // 4. Verify
    const owner = await escrow.owner();
    console.log(`   Escrow Owner: ${owner}`);
    console.log(`   Match: ${owner.toLowerCase() === processor.address.toLowerCase() ? '✅' : '❌'}`);

    // 5. Update deployment.json
    deployment.contracts.Escrow = escrow.address;
    deployment.contracts.PaymentProcessor = processor.address;
    deployment.deployedAt = new Date().toISOString();
    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log(`\n📝 deployment.json updated`);

    // 6. Update .env
    const envPath = "/root/project/gwdc/x402-market/.env";
    let envContent = fs.readFileSync(envPath, "utf8");
    envContent = envContent.replace(
        /PAYMENT_PROCESSOR_ADDRESS=.*/,
        `PAYMENT_PROCESSOR_ADDRESS=${processor.address}`
    );
    envContent = envContent.replace(
        /ESCROW_ADDRESS=.*/,
        `ESCROW_ADDRESS=${escrow.address}`
    );
    fs.writeFileSync(envPath, envContent);
    console.log(`📝 .env updated`);

    console.log("\n🎉 Redeployment complete!\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
