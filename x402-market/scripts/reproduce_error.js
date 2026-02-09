const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const PAYMENT_PROCESSOR = process.env.PAYMENT_PROCESSOR_ADDRESS;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

const ABI = [
    'function processPayment(bytes32 serviceId, address from, uint256 paymentAmount, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external'
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
    const processor = new ethers.Contract(PAYMENT_PROCESSOR, ABI, wallet);

    console.log("Processor:", PAYMENT_PROCESSOR);

    // Mock Values based on error and context
    const serviceId = ethers.keccak256(ethers.toUtf8Bytes("468efc1e-66bc-4cf7-a32c-42eb35fe0069"));
    const from = "0x81e4CE4E4b079CeC8d420b42F0DEC70A5F26f922"; // Client
    const value = ethers.parseEther("5"); // 5 mUSDC
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600;

    // The problematic value from error
    const BAD_VALUE = "0xed2999543a6aafedf125584ada4141167293c435edaa2272afa6c7f30de5c79";
    const nonce = BAD_VALUE;

    // Mock signature
    const v = 27;
    const r = ethers.hexlify(ethers.randomBytes(32));
    const s = ethers.hexlify(ethers.randomBytes(32));

    console.log("Service ID:", serviceId);
    console.log("Nonce:", nonce);

    try {
        // Just estimate gas to trigger argument validation
        const gas = await processor.processPayment.estimateGas(
            serviceId,
            from,
            value,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
        console.log("✅ Gas estimated:", gas.toString());
    } catch (e) {
        console.error("❌ Error reproduced:");
        console.error("Code:", e.code);
        console.error("Argument:", e.argument);
        console.error("Value:", e.value);
        console.error("Message:", e.message);
    }
}

main().catch(console.error);
