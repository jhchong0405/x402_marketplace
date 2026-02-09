const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY;

async function main() {
    console.log("🔄 Connecting to RPC:", RPC_URL);
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // Check Network
    try {
        const network = await provider.getNetwork();
        console.log(`✅ Connected to Chain ID: ${network.chainId.toString()}`);
        if (network.chainId.toString() !== '71') {
            console.warn("⚠️ WARNING: Not connected to Conflux eSpace Testnet (Expected 71)");
        }
    } catch (e) {
        console.error("❌ Failed to connect to network:", e.message);
        return;
    }

    if (!RELAYER_KEY) {
        console.error("❌ RELAYER_PRIVATE_KEY is missing in .env");
        return;
    }

    const wallet = new ethers.Wallet(RELAYER_KEY, provider);

    console.log(`\n🔑 Relayer Wallet Analysis:`);
    console.log(`Address: ${wallet.address}`);

    // Check CFX Balance
    const balance = await provider.getBalance(wallet.address);
    const balanceInCFX = ethers.formatEther(balance);
    console.log(`CFX Balance: ${balanceInCFX}`);

    if (balance === 0n) {
        console.error("\n❌ Relayer has NO gas funds on this network!");
        console.log("Please double check:");
        console.log("1. Does your wallet have funds on *eSpace* Testnet (Chain 71)?");
        console.log("   (Note: Conflux has Core vs eSpace networks. They have different addresses usually starting with cfx: vs 0x)");
        console.log("2. Is this the correct address? " + wallet.address);
    } else {
        console.log("\n✅ Relayer has funds. Ready to pay gas.");
    }
}

main().catch(console.error);
