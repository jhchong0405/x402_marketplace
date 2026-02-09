const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const CLIENT_KEY = process.env.CLIENT_PRIVATE_KEY;
const MOCK_USDC = process.env.MOCK_USDC_ADDRESS;

const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(CLIENT_KEY, provider);

    console.log(`\n👤 Client Wallet Analysis:`);
    console.log(`Address: ${wallet.address}`);

    // Check CFX Balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`CFX Balance: ${ethers.formatEther(balance)} CFX`);

    if (!MOCK_USDC) {
        console.error("❌ MOCK_USDC_ADDRESS not found in .env");
        return;
    }

    // Check USDC Balance
    const token = new ethers.Contract(MOCK_USDC, ERC20_ABI, provider);
    try {
        const tokenBalance = await token.balanceOf(wallet.address);
        const decimals = await token.decimals();
        const symbol = await token.symbol();
        const formatted = ethers.formatUnits(tokenBalance, decimals);

        console.log(`${symbol} Balance: ${formatted}`);

        if (tokenBalance === 0n) {
            console.error(`❌ Client has 0 ${symbol}! Payment will fail.`);
        } else {
            console.log(`✅ Client has ${symbol} funds.`);
        }
    } catch (e) {
        console.error("❌ Failed to query token balance:", e.message);
    }
}

main().catch(console.error);
