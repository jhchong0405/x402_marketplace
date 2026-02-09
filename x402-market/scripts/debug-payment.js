const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY;
const CLIENT_KEY = process.env.CLIENT_PRIVATE_KEY;
const MOCK_USDC = process.env.MOCK_USDC_ADDRESS;
const PAYMENT_PROCESSOR = process.env.PAYMENT_PROCESSOR_ADDRESS;
const ESCROW = process.env.ESCROW_ADDRESS;

// ABI
const PAYMENT_PROCESSOR_ABI = [
    'function processPayment(bytes32 serviceId, address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
    'function usedNonces(address payer, bytes32 nonce) view returns (bool)',
];

// EIP-712 Domain (Must match what the client signed)
// Assuming USDC-like EIP-3009
const DOMAIN_NAME = "MockUSDC";
const DOMAIN_VERSION = "1";

async function main() {
    console.log("🔄 Connecting to RPC:", RPC_URL);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();
    const chainId = network.chainId;
    console.log("Chain ID:", chainId.toString());

    const relayer = new ethers.Wallet(RELAYER_KEY, provider);
    const client = new ethers.Wallet(CLIENT_KEY, provider);

    console.log("Relayer:", relayer.address);
    console.log("Client:", client.address);
    console.log("Contract:", PAYMENT_PROCESSOR);

    // 1. Create Signature
    const domain = {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: chainId,
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
    const value = ethers.parseUnits("1", 18); // 1 mUSDC
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    const message = {
        from: client.address,
        to: ESCROW, // Payment goes to Escrow
        value: value,
        validAfter: validAfter,
        validBefore: validBefore,
        nonce: nonce,
    };

    console.log("\n✍️  Signing message...");
    const signature = await client.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(signature);

    // 2. Simulate Transaction
    const processor = new ethers.Contract(PAYMENT_PROCESSOR, PAYMENT_PROCESSOR_ABI, relayer);

    // Random service ID
    const serviceId = ethers.id("debug-service-" + Date.now());

    console.log("\n🚀 Simulating processPayment call...");
    try {
        // Use static call to get revert reason
        await processor.processPayment.staticCall(
            serviceId,
            client.address,
            value,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s,
            { from: relayer.address } // Simulate as Relayer
        );
        console.log("✅ Simulation Successful! Transaction should succeed.");

        // If simulation passes, try actual tx
        // const tx = await processor.processPayment(...)
    } catch (error) {
        console.error("\n❌ Simulation Failed!");

        if (error.reason) {
            console.error("Revert Reason:", error.reason);
        } else if (error.data) {
            console.error("Revert Data:", error.data);
            // Try to decode common errors if possible
        } else {
            console.error("Full Error:", error);
        }

        // Custom error decoding hint
        if (error.toString().includes("TransferHelper")) {
            console.log("-> Hint: Likely USDC transfer failed. Check Allowance or Balance.");
        }
    }
}

main().catch(console.error);
