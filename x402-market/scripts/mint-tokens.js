const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY;
const CLIENT_KEY = process.env.CLIENT_PRIVATE_KEY;
const MOCK_USDC = process.env.MOCK_USDC_ADDRESS;

// Mintable ERC20 Interface
const MINT_ABI = [
    'function mint(address to, uint256 amount) external',
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

async function main() {
    console.log("🔄 Connecting to RPC:", RPC_URL);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const relayer = new ethers.Wallet(RELAYER_KEY, provider);
    const client = new ethers.Wallet(CLIENT_KEY, provider);

    console.log(`\n🏦 Minting for Client: ${client.address}`);
    console.log(`⛽ Using Relayer Gas: ${relayer.address}`);

    const token = new ethers.Contract(MOCK_USDC, MINT_ABI, relayer);

    try {
        const decimals = await token.decimals();
        const amount = ethers.parseUnits("1000", decimals); // Mint 1000 mUSDC

        console.log(`Attempting to mint 1000 mUSDC...`);

        const tx = await token.mint(client.address, amount);
        console.log(`Transaction sent: ${tx.hash}`);

        console.log("Waiting for confirmation...");
        await tx.wait();
        console.log("✅ Minted successfully!");

        const balance = await token.balanceOf(client.address);
        console.log(`New Client Balance: ${ethers.formatUnits(balance, decimals)} mUSDC`);

    } catch (e) {
        console.error("❌ Minting failed:", e.message);
        console.log("\nIf this failed, the MockUSDC contract might not have a public 'mint' function or it's restricted.");
    }
}

main().catch(console.error);
