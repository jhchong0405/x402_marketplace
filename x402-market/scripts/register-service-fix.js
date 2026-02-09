const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const SERVICE_REGISTRY = process.env.SERVICE_REGISTRY_ADDRESS;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

// 468efc1e-66bc-4cf7-a32c-42eb35fe0069
const SERVICE_UUID = "468efc1e-66bc-4cf7-a32c-42eb35fe0069";
const PRICE = ethers.parseEther("5"); // 5 mUSDC

const REGISTRY_ABI = [
    'function registerService(bytes32 id, address provider, uint256 price, string name, string endpoint) external',
    'function getService(bytes32 serviceId) view returns (address provider, uint256 price, bool isActive)',
    'function owner() view returns (address)'
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);

    console.log("Registering Service on-chain...");
    console.log("Registry:", SERVICE_REGISTRY);
    console.log("Relayer (Signer):", wallet.address);

    const registry = new ethers.Contract(SERVICE_REGISTRY, REGISTRY_ABI, wallet);

    // Check Owner
    try {
        const owner = await registry.owner();
        console.log("Contract Owner:  ", owner);

        if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
            console.error("❌ Signer is NOT the owner! Registration will fail.");
            console.error("   Please provide the private key for:", owner);
            return;
        }
    } catch (e) {
        console.error("Error fetching owner:", e.message);
    }

    const serviceHash = ethers.keccak256(ethers.toUtf8Bytes(SERVICE_UUID));
    console.log("Service Hash:", serviceHash);

    // Check if already registered
    try {
        const existing = await registry.getService(serviceHash);
        if (existing.isActive) {
            console.log("⚠️ Service already registered!");
            return;
        }
    } catch (e) {
        console.log("Service not found (as expected). Registering...");
    }

    try {
        // provider, price, name, endpoint
        // NOTE: Provider should be wallet.address (the relayer) or another address that can receive funds?
        // In this test, relayer receives funds via Escrow.
        const tx = await registry.registerService(
            serviceHash,
            wallet.address, // Provider = Relayer
            PRICE,
            "Coca-cola Analysis",
            "https://placeholder.com"
        );
        console.log("Tx Sent:", tx.hash);
        await tx.wait();
        console.log("✅ Service Registered Successfully!");
    } catch (e) {
        console.error("❌ Registration Failed:", e.message);
        if (e.data) console.error("Data:", e.data);
    }
}

main().catch(console.error);
