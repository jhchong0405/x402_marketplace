
const { ethers } = require("ethers");
const { PrismaClient } = require('@prisma/client');
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

// ABIs
const PROCESSOR_ABI = ['function serviceRegistry() view returns (address)'];
const REGISTRY_ABI = [
    'function registerService(bytes32 id, address provider, uint256 price, string name, string endpoint) external',
    'function getService(bytes32 id) view returns (address, uint256, bool)'
];

async function registerService() {
    console.log('📝 Registering Service on-chain...');

    const provider = new ethers.JsonRpcProvider(process.env.CONFLUX_RPC_URL);
    const wallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);

    // 1. Get ServiceRegistry Address
    const processorAddress = process.env.PAYMENT_PROCESSOR_ADDRESS;
    const processor = new ethers.Contract(processorAddress, PROCESSOR_ABI, provider);
    const registryAddress = await processor.serviceRegistry();
    console.log(`📍 ServiceRegistry: ${registryAddress}`);

    const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, wallet);

    // 2. Get Service from DB
    const service = await prisma.service.findFirst({
        where: { name: { contains: 'Bitcoin' } },
        include: { provider: true }
    });

    if (!service) throw new Error('Service not found in DB');

    // 3. Prepare Data
    // Use keccak256 hash of the UUID string as the bytes32 ID
    const serviceIdHash = ethers.keccak256(ethers.toUtf8Bytes(service.id));

    // Price in Wei
    const priceWei = ethers.parseUnits(service.price.toString(), 18);

    // Provider Address (from DB)
    const providerAddr = service.provider.walletAddress;

    console.log(`📦 Service: ${service.name} (${service.id})`);
    console.log(`🔑 Service ID Hash: ${serviceIdHash}`);
    console.log(`👤 Provider: ${providerAddr}`);
    console.log(`💰 Price: ${priceWei.toString()} Wei`);

    // 4. Check if already registered
    try {
        await registry.getService(serviceIdHash);
        console.log('⚠️ Service already registered. Skipping.');
        return;
    } catch (error) {
        // If error is "Service not found", we proceed
        if (!error.message.includes("Service not found")) {
            console.log("Error checking service:", error.shortMessage || error.message);
            // Optional: throw if it's a network error, but for now we assume it's just not found
        }
    }

    // 5. Register
    const tx = await registry.registerService(
        serviceIdHash,
        providerAddr,
        priceWei,
        service.name,
        service.endpointUrl
    );
    console.log(`🚀 Transaction sent: ${tx.hash}`);
    await tx.wait();
    console.log('✅ Service Registered successfully!');
}

registerService()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
