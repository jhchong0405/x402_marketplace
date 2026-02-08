/**
 * Isolated Test: Escrow.receivePayment
 * 
 * This script tests the Escrow contract's receivePayment function in isolation
 * to determine if the revert originates from the Escrow logic or the nested Token call.
 */
const hre = require("hardhat");
const deploymentInfo = require("/root/project/gwdc/x402-market/deployment.json");

async function main() {
    console.log("\n🔬 Isolated Escrow Test\n");

    const [devWallet] = await hre.ethers.getSigners();
    console.log(`Caller (Processor Impersonator): ${devWallet.address}`);

    // Load contracts
    const token = await hre.ethers.getContractAt("MockUSDC", deploymentInfo.contracts.PaymentToken);
    const escrow = await hre.ethers.getContractAt("X402Escrow", deploymentInfo.contracts.Escrow);
    const processor = await hre.ethers.getContractAt("X402PaymentProcessor", deploymentInfo.contracts.PaymentProcessor);

    // Check initial state
    const escrowOwner = await escrow.owner();
    const escrowToken = await escrow.paymentToken();
    const escrowTreasury = await escrow.platformTreasury();
    const escrowBalance = await token.balanceOf(escrow.address);

    console.log("\n📋 Escrow State:");
    console.log(`   Owner (should be Processor): ${escrowOwner}`);
    console.log(`   Is Owner Processor? ${escrowOwner.toLowerCase() === processor.address.toLowerCase() ? '✅' : '❌'}`);
    console.log(`   Token: ${escrowToken}`);
    console.log(`   Treasury: ${escrowTreasury}`);
    console.log(`   Current Balance: ${hre.ethers.utils.formatUnits(escrowBalance, 18)} mUSDC`);

    // First, send some tokens to Escrow (simulating receiveWithAuthorization)
    const testAmount = hre.ethers.utils.parseUnits("1.0", 18);
    console.log(`\n💸 Step 1: Sending ${hre.ethers.utils.formatUnits(testAmount, 18)} mUSDC to Escrow...`);

    const tx1 = await token.connect(devWallet).transfer(escrow.address, testAmount);
    await tx1.wait();
    console.log("   ✅ Tokens sent to Escrow");

    const newEscrowBalance = await token.balanceOf(escrow.address);
    console.log(`   Escrow Balance: ${hre.ethers.utils.formatUnits(newEscrowBalance, 18)} mUSDC`);

    // Now try to call receivePayment
    // Problem: Only the Processor (owner) can call this
    console.log(`\n🔐 Step 2: Trying to call Escrow.receivePayment...`);
    console.log(`   Note: This requires msg.sender to be the Processor contract.`);

    // We cannot call receivePayment directly as devWallet because we're not the owner (Processor is)
    // Let's check if we can "impersonate" the processor via hardhat network
    // This only works on hardhat local network, not on testnet

    console.log(`   ⚠️ Cannot directly call receivePayment on testnet (only Processor can).`);
    console.log(`   ⚠️ This test requires a modified Processor or a local fork.`);

    console.log("\n🔍 Alternative: Checking Escrow.transfer capability...");
    // Instead, let's see what happens if Escrow tries to transfer out tokens
    // We'll use the claim function which also calls transfer

    const providerAddress = devWallet.address;
    const providerBalance = await escrow.providerBalances(providerAddress);
    console.log(`   Provider Balance in Escrow: ${hre.ethers.utils.formatUnits(providerBalance, 18)} mUSDC`);

    // If there's any balance, try claiming
    if (providerBalance.gt(0)) {
        console.log(`   Attempting claim...`);
        try {
            const txClaim = await escrow.connect(devWallet).claim({ gasLimit: 500000 });
            await txClaim.wait();
            console.log("   ✅ Claim successful!");
        } catch (e) {
            console.error(`   ❌ Claim failed: ${e.message}`);
        }
    } else {
        console.log("   No provider balance to claim.");
    }

    // Final analysis
    console.log("\n📊 Diagnosis:");
    console.log("If Escrow can receive and transfer out tokens via claim(), the token interaction works.");
    console.log("The issue is likely in how Processor calls Escrow.receivePayment internally.");
    console.log("\n💡 Recommended Fix: Two-Phase Settlement (Relayer calls Token + Escrow separately)");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
