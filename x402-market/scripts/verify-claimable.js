
const { ethers } = require("ethers");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function verifyClaimable() {
    const API_BASE = "http://localhost:3000";
    // We know Relayer is the provider
    const walletAddress = process.env.RELAYER_PRIVATE_KEY
        ? new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY).address
        : '0xC08CC32481e49C167f505EdB5717ab6212012c07';

    console.log(`🔍 Verifying Claimable Balance for: ${walletAddress}`);

    try {
        const res = await fetch(`${API_BASE}/api/revenue/wallet?address=${walletAddress}`);
        const data = await res.json();

        console.log('📊 Balance Response:');
        console.dir(data, { depth: null, colors: true });

        if (data.claimableBalance > 0) {
            console.log(`\n✅ You have ${data.claimableBalance} mUSDC waiting to be claimed!`);
            console.log(`   Detailed Breakdown:`);
            console.log(`   - On-Chain Escrow: ${data.rawBalance} Wei`);
            console.log(`   - Formatted: ${data.claimableBalance} mUSDC`);

            // Execute Claim
            console.log(`\n💸 Executing Claim...`);
            const claimRes = await fetch(`${API_BASE}/api/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress,
                    amount: data.claimableBalance,
                }),
            });
            const claimData = await claimRes.json();

            if (claimRes.ok) {
                console.log(`✅ Claim SUCCESS!`);
                console.log(`   TxHash: ${claimData.txHash}`);
                console.log(`   Explorer: https://evmtestnet.confluxscan.io/tx/${claimData.txHash}`);
            } else {
                console.log(`❌ Claim Failed: ${claimData.error}`);
            }

        } else {
            console.log(`\n❌ Balance is still 0.`);
            console.log(`   Possible reasons:`);
            console.log(`   1. Payment transaction failed on-chain (check Explorer)`);
            console.log(`   2. Escrow contract logic issue (deposit not called)`);
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

verifyClaimable();
