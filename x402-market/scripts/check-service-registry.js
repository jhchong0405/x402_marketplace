const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const PAYMENT_PROCESSOR = process.env.PAYMENT_PROCESSOR_ADDRESS;
const SERVICE_REGISTRY = process.env.SERVICE_REGISTRY_ADDRESS;

// 468efc1e-66bc-4cf7-a32c-42eb35fe0069
const SERVICE_UUID = "468efc1e-66bc-4cf7-a32c-42eb35fe0069";

const REGISTRY_ABI = [
    'function getService(bytes32 serviceId) view returns (address provider, uint256 price, bool isActive)'
];

const PROCESSOR_ABI = [
    'function serviceRegistry() view returns (address)'
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // 1. Get Registry Address from Processor (Source of Truth)
    const processor = new ethers.Contract(PAYMENT_PROCESSOR, PROCESSOR_ABI, provider);
    const registryAddress = await processor.serviceRegistry();
    console.log("Registry from Processor:", registryAddress);
    console.log("Registry from Env:      ", SERVICE_REGISTRY);

    if (registryAddress !== SERVICE_REGISTRY) {
        console.warn("⚠️ Mismatch between Env and Contract Registry!");
    }

    // 2. Query Registry
    const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
    const serviceHash = ethers.keccak256(ethers.toUtf8Bytes(SERVICE_UUID));

    console.log("\nService UUID:", SERVICE_UUID);
    console.log("Service Hash:", serviceHash);

    try {
        const result = await registry.getService(serviceHash);
        console.log("\n--- On-Chain Service Status ---");
        console.log("Provider:", result.provider);
        console.log("Price:   ", ethers.formatEther(result.price));
        console.log("Active:  ", result.isActive);

        if (!result.isActive) {
            console.error("\n❌ SERVICE IS NOT ACTIVE ON-CHAIN! This causes processPayment to revert.");
        } else {
            console.log("\n✅ Service is registered and active.");
        }
    } catch (e) {
        console.error("Error querying registry:", e.message);
    }
}

main().catch(console.error);
