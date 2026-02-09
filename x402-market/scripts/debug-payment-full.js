const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY;
const CLIENT_KEY = process.env.CLIENT_PRIVATE_KEY;
const MOCK_USDC = process.env.MOCK_USDC_ADDRESS;
const PAYMENT_PROCESSOR = process.env.PAYMENT_PROCESSOR_ADDRESS;
const SERVICE_REGISTRY = process.env.SERVICE_REGISTRY_ADDRESS;
const ESCROW = process.env.ESCROW_ADDRESS;

const REGISTRY_ABI = [
    'function registerService(bytes32 serviceId, address provider, uint256 price, address tokenAddress) external',
    'function services(bytes32 serviceId) view returns (address provider, uint256 price, address tokenAddress, bool isActive)'
];

const PAYMENT_ABI = [
    'function processPayment(bytes32 serviceId, address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external'
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const relayer = new ethers.Wallet(RELAYER_KEY, provider);
    const client = new ethers.Wallet(CLIENT_KEY, provider);

    const registry = new ethers.Contract(SERVICE_REGISTRY, REGISTRY_ABI, relayer);
    const processor = new ethers.Contract(PAYMENT_PROCESSOR, PAYMENT_ABI, relayer);

    // 1. Register a Mock Service (if needed)
    const serviceIdUtf8 = "debug-service-" + Date.now();
    const serviceId = ethers.id(serviceIdUtf8); // Keccak256 hash
    const price = ethers.parseUnits("1", 18); // 1 Token
    const tokenAddress = MOCK_USDC;

    console.log(`\n🛠️  Registering Service: ${serviceId}`);
    try {
        const tx = await registry.registerService(serviceId, relayer.address, price, tokenAddress);
        console.log("Registration TX:", tx.hash);
        await tx.wait();
        console.log("✅ Service Registered.");
    } catch (e) {
        console.error("❌ Registration Failed:", e.message);
        return;
    }

    // 2. Prepare Payment Signature
    const chainId = (await provider.getNetwork()).chainId;
    const domain = {
        name: "MockUSDC",
        version: "1",
        chainId,
        verifyingContract: MOCK_USDC,
    };
    const types = {
        ReceiveWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
        ],
    };

    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validBefore = Math.floor(Date.now() / 1000) + 3600;

    // Note: PaymentProcessor expects `to` to be the Escrow address in the signed message? 
    // Or the Service Provider? Usually receiveWithAuthorization transfers to `to`.
    // In PaymentProcessor, `processPayment` calls `receiveWithAuthorization`.
    // The `to` in `receiveWithAuthorization` MUST match the `to` passed to `processPayment`, which is usually derived from the service.

    // Let's check what `processPayment` does. 
    // It likely calls: usdc.receiveWithAuthorization(from, escrowAddress, value, ...) 
    // So `to` in the signature MUST be the Escrow Address.

    const message = {
        from: client.address,
        to: ESCROW,
        value: price,
        validAfter: 0,
        validBefore: validBefore,
        nonce: nonce,
    };

    console.log("\n✍️  Signing message...");
    const signature = await client.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(signature);

    console.log(`\n🚀 Simulating processPayment for Service: ${serviceId}`);
    try {
        await processor.processPayment.staticCall(
            serviceId,
            client.address,
            price,
            0,
            validBefore,
            nonce,
            v,
            r,
            s
        );
        console.log("✅ Simulation Successful!");
    } catch (error) {
        console.error("\n❌ Simulation Failed!");
        if (error.reason) console.error("Revert Reason:", error.reason);
        else console.error("Error:", error);
    }
}

main().catch(console.error);
