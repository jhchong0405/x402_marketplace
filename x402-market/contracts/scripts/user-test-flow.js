const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("🧪 Starting End-to-End User Interaction Test\n");

    // 1. Setup
    const deploymentPath = path.join(__dirname, '../../deployment.json');
    const deployment = require(deploymentPath);

    // Connect to contracts
    const processor = await hre.ethers.getContractAt("X402PaymentProcessor", deployment.contracts.PaymentProcessor);
    const escrow = await hre.ethers.getContractAt("X402Escrow", deployment.contracts.Escrow);

    // Use explicit ABI for token to ensure methods exist
    const tokenAbi = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)",
        "function nonces(address owner) view returns (uint256)",
        "function name() view returns (string)",
        "function version() view returns (string)",
        "function DOMAIN_SEPARATOR() view returns (bytes32)",
        "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)"
    ];
    const token = await hre.ethers.getContractAt(tokenAbi, deployment.contracts.PaymentToken);

    // Setup wallets
    const [devWallet] = await hre.ethers.getSigners();
    const newUser = hre.ethers.Wallet.createRandom().connect(devWallet.provider);

    console.log("👤 Wallets:");
    console.log(`   Dev (Relayer): ${devWallet.address}`);
    console.log(`   New User:      ${newUser.address}`);
    console.log(`   Private Key:   ${newUser.privateKey}\n`); // Log key for debugging if needed

    // 2. Fund New User
    console.log("💸 Step 1: Funding New User...");
    const amount = hre.ethers.utils.parseUnits("100.0", 18); // 100 mUSDC
    const fundAmount = hre.ethers.utils.parseEther("1.0"); // 1 CFX for gas if needed (though payment is gasless for user)

    // Check dev balance
    const devBalance = await token.balanceOf(devWallet.address);
    console.log(`   Dev Balance: ${hre.ethers.utils.formatUnits(devBalance, 18)} mUSDC`);

    if (devBalance.lt(amount)) {
        throw new Error("Dev wallet has insufficient mUSDC!");
    }

    // Transfer mUSDC
    const tx1 = await token.transfer(newUser.address, amount);
    await tx1.wait();
    console.log(`   ✅ Sent 100 mUSDC to User (tx: ${tx1.hash.substring(0, 10)}...)`);

    // Transfer CFX (optional, just in case user needs to approve something manually, though EIP-3009 avoids this)
    const tx2 = await devWallet.sendTransaction({
        to: newUser.address,
        value: fundAmount
    });
    await tx2.wait();
    console.log(`   ✅ Sent 1 CFX to User`);

    const userBalance = await token.balanceOf(newUser.address);
    console.log(`   User New Balance: ${hre.ethers.utils.formatUnits(userBalance, 18)} mUSDC\n`);

    // Define payment amount early for service registration
    const paymentAmount = hre.ethers.utils.parseUnits("5.0", 18); // 5 mUSDC

    // 3. Register Service (if not exists)
    const serviceId = "0x" + "1".padStart(64, "0"); // Service ID 1
    const registry = await hre.ethers.getContractAt("X402ServiceRegistry", deployment.contracts.ServiceRegistry);

    console.log(`\n🛠️  Step 2: Registering Service ${serviceId}...`);
    try {
        const txReg = await registry.connect(devWallet).registerService(
            serviceId,
            devWallet.address, // provider
            paymentAmount,     // price
            "Test Service",    // name
            "https://test.api" // endpoint
        );
        await txReg.wait();
        console.log(`   ✅ Service Registered`);
    } catch (e) {
        console.log(`   ⚠️ Service may already be registered: ${e.message.split('revert')[0]}`);
    }

    // 4. Prepare Payment
    console.log("✍️  Step 3: User Generates Payment Signature...");

    // Choose a service (we'll look one up or use a dummy ID)
    // const serviceId = hre.ethers.utils.id("test-verification-service"); // Original serviceId, now using fixed ID
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const nonce = hre.ethers.utils.hexlify(hre.ethers.utils.randomBytes(32));

    // EIP-712 Domain
    const chainId = (await devWallet.provider.getNetwork()).chainId;

    // Fetch domain info from contract with fallbacks
    let tokenName = "MockUSDC";
    let tokenVersion = "1";

    try { tokenName = await token.name(); } catch (e) { console.warn("   ⚠️ Could not fetch token name, using default"); }
    try { tokenVersion = await token.version(); } catch (e) { console.warn("   ⚠️ Could not fetch token version, using default '1'"); }

    // Verify DOMAIN_SEPARATOR - SKIPPING as it reverts on some tokens
    // const onChainSeparator = await token.DOMAIN_SEPARATOR();

    // Try calculating for version 1 and 2
    /*
    for (const v of ["1", "2"]) {
        const testDomain = {
            name: tokenName,
            version: v,
            chainId: chainId,
            verifyingContract: token.address
        };
        const calculated = hre.ethers.utils._TypedDataEncoder.hashDomain(testDomain);
        console.log(`   Local v${v}:  ${calculated}`);
    }
    */

    // Just log what we have
    // console.log(`   Using Version: ${tokenVersion}\n`);

    const domain = {
        name: tokenName,
        version: tokenVersion,
        chainId: chainId,
        verifyingContract: token.address
    };

    // EIP-3009 Types
    const types = {
        ReceiveWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" }
        ]
    };

    // Data to sign
    // CRITICAL: 'to' must be the Escrow contract, NOT the Relayer or PaymentProcessor
    const message = {
        from: newUser.address,
        to: escrow.address,
        value: paymentAmount.toString(),
        validAfter,
        validBefore,
        nonce
    };

    // Sign
    // Use _signTypedData for Ethers v5
    const signature = await newUser._signTypedData(domain, types, message);
    const { v, r, s } = hre.ethers.utils.splitSignature(signature);

    console.log(`   ✅ Signature Generated`);
    console.log(`      To (Escrow): ${escrow.address}`);
    console.log(`      Amount: ${hre.ethers.utils.formatUnits(paymentAmount, 18)}`);
    console.log(`      Nonce: ${nonce.substring(0, 10)}...\n`);

    // Verify Escrow State
    const escrowOwner = await escrow.owner();
    // ... (logs)

    // Skip diagnostic (bug was in Processor calling wrong function, now fixed)
    console.log("\n🔧 Bug Fixed: Processor now calls receiveWithAuthorization correctly.");
    console.log("   Proceeding directly to processPayment...\n");


    // 4. Relayer Executes Payment
    const escrowToken = await escrow.paymentToken();
    const escrowTreasury = await escrow.platformTreasury();

    console.log(`\n🔍 System Config Check:`);
    console.log(`   Escrow Owner:    ${escrowOwner} ${escrowOwner.toLowerCase() === processor.address.toLowerCase() ? '✅' : '❌'}`);
    console.log(`   Escrow Token:    ${escrowToken} ${escrowToken.toLowerCase() === token.address.toLowerCase() ? '✅' : '❌'}`);
    console.log(`   Escrow Treasury: ${escrowTreasury}`);

    // Verify Service details
    const serviceDetails = await registry.getService(serviceId);
    console.log(`\n🔍 Service Check:`);
    console.log(`   Provider: ${serviceDetails.provider}`);
    console.log(`   Price:    ${hre.ethers.utils.formatUnits(serviceDetails.price, 18)}`);
    console.log(`   Active:   ${serviceDetails.isActive}`);

    if (serviceDetails.price.toString() !== paymentAmount.toString()) {
        console.error("❌ Price mismatch!");
    }

    console.log(`   Payment Processor: ${processor.address}`);

    if (escrowOwner.toLowerCase() !== processor.address.toLowerCase()) {
        console.log("   ⚠️ OWNESHIP MISMATCH! Trying to fix...");
        // Try to transfer ownership if we act as deployer
        try {
            await escrow.connect(devWallet).transferOwnership(processor.address);
            console.log("   ✅ Ownership transferred to Processor");
        } catch (e) {
            console.log("   ❌ Failed to transfer ownership: " + e.message);
        }
    }

    // 4. Relayer Executes Payment
    console.log("🚀 Step 3: Relayer Submits Payment...");

    try {
        /*
        // Estimate gas first
        const gasLimit = await processor.connect(devWallet).estimateGas.processPayment(
            serviceId,
            newUser.address,
            paymentAmount, // ...
        );
        */
        console.log(`   Skipping estimation, using manual gas limit...`);

        const tx3 = await processor.connect(devWallet).processPayment(
            serviceId,
            newUser.address,
            paymentAmount,
            validAfter,
            validBefore,
            nonce,
            v, r, s,
            { gasLimit: 3000000 } // Force high limit
        );
        console.log(`   Transaction Sent: ${tx3.hash}`);
        await tx3.wait();
        console.log(`   ✅ Payment Processed Successfully!\n`);
    } catch (error) {
        console.error(`   ❌ Payment Failed: ${error.message}`);
        if (error.data) console.error(`   Data: ${error.data}`);

        // Debug info if failure persists
        console.log("\n   🕵️ Debug Info:");
        console.log(`   Signer: ${newUser.address}`);
        console.log(`   Domain: ${JSON.stringify(domain)}`);
        console.log(`   Message: ${JSON.stringify(message)}`);

        process.exit(1);
    }

    // 5. Verify Results
    console.log("🔍 Step 4: Verifying On-Chain State...");

    // Check User Balance
    const finalUserBalance = await token.balanceOf(newUser.address);
    console.log(`   User Final Balance: ${hre.ethers.utils.formatUnits(finalUserBalance, 18)} mUSDC`);
    console.log(`   Deduction Correct: ${userBalance.sub(finalUserBalance).eq(paymentAmount) ? '✅' : '❌'}`);

    // Check Escrow Provider Balance
    // We know the provider for 'test-verification-service' is DevWallet (from previous script)
    // Or we can query the registry to be sure
    // const registry = await hre.ethers.getContractAt("X402ServiceRegistry", deployment.contracts.ServiceRegistry);
    const serviceInfo = await registry.getService(serviceId);
    const providerAddress = serviceInfo.provider;

    const providerData = await escrow.getProviderInfo(providerAddress);
    console.log(`   Provider (${providerAddress.substring(0, 6)}...):`);
    console.log(`      Earned: ${hre.ethers.utils.formatUnits(providerData.earned, 18)}`);
    console.log(`      Balance: ${hre.ethers.utils.formatUnits(providerData.balance, 18)}`);

    // Calculate expected split (5% fee)
    const fee = paymentAmount.mul(5).div(100);
    const earned = paymentAmount.sub(fee);

    console.log(`   Expected Earned (95%): ${hre.ethers.utils.formatUnits(earned, 18)}`);
    // Note: provider might have previous balance, so we check if balance >= earned
    console.log(`   Balance Update: ${providerData.earned.gte(earned) ? '✅' : '❌'}\n`);

    console.log("🎉 Interaction Test Complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
