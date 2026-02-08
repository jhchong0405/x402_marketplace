
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function checkProviderEarnings() {
    console.log('🔍 Checking Provider Earnings...\n');

    // 1. Find the Bitcoin Service
    const service = await prisma.service.findFirst({
        where: { name: { contains: 'Bitcoin' } },
        include: { provider: true }
    });

    if (!service) {
        console.log('❌ Service "Bitcoin Q1 2026 Analysis" not found in DB.');
        return;
    }

    console.log(`✅ Service Found: "${service.name}"`);
    console.log(`   ID: ${service.id}`);
    console.log(`   Price: ${service.price} mUSDC`);

    // 2. Provider Info
    const provider = service.provider;
    console.log(`\n👤 Provider Info:`);
    console.log(`   Name: ${provider.name}`);
    console.log(`   Wallet Address: ${provider.walletAddress}`);
    console.log(`   ID: ${provider.id}`);

    // 3. User Wallets check
    const relayerAddr = process.env.RELAYER_PRIVATE_KEY ? require('ethers').Wallet.fromPhrase ? '...' : new (require('ethers').Wallet)(process.env.RELAYER_PRIVATE_KEY).address : 'N/A';

    console.log(`\n🔑 Your Wallets:`);
    console.log(`   Relayer (User): ${relayerAddr}`);

    if (provider.walletAddress.toLowerCase() === relayerAddr.toLowerCase()) {
        console.log('\n✅ Your Relayer Wallet IS the Provider.');
    } else {
        console.log(`\n⚠️ The Provider is NOT your Relayer wallet.`);
        console.log(`   You paid: ${relayerAddr}`);
        console.log(`   Earnings went to: ${provider.walletAddress}`);
        console.log(`   You cannot claim earnings from a wallet you don't own!`);
    }

    // 4. Check Access Logs (Earnings)
    const logs = await prisma.accessLog.findMany({
        where: { serviceId: service.id }
    });

    console.log(`\n💰 Earnings Logic:`);
    console.log(`   Total Logs: ${logs.length}`);
    const totalEarned = logs.reduce((acc, log) => acc + log.amount, 0);
    console.log(`   Total Earned (DB): ${totalEarned} mUSDC`);

    // 5. Escrow Balance (if possible)
    console.log(`   Claimed Amount: ${provider.claimedAmount}`);
}

checkProviderEarnings()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
