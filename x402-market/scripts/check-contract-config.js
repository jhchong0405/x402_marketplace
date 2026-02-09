const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const PAYMENT_PROCESSOR = process.env.PAYMENT_PROCESSOR_ADDRESS;

const ABI = [
    'function escrow() view returns (address)',
    'function paymentToken() view returns (address)',
    'function serviceRegistry() view returns (address)'
];

async function main() {
    console.log("Checking PaymentProcessor state at:", PAYMENT_PROCESSOR);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const processor = new ethers.Contract(PAYMENT_PROCESSOR, ABI, provider);

    try {
        const escrow = await processor.escrow();
        console.log("Stored Escrow:", escrow);
        console.log("Env Escrow:   ", process.env.ESCROW_ADDRESS);

        if (escrow !== process.env.ESCROW_ADDRESS) {
            console.error("❌ MISMATCH! The signature signs 'Env Escrow' but contract uses 'Stored Escrow'.");
        } else {
            console.log("✅ Escrow addresses match.");
        }

        const token = await processor.paymentToken();
        console.log("Stored Token: ", token);
        console.log("Env Token:    ", process.env.MOCK_USDC_ADDRESS);

        if (token !== process.env.MOCK_USDC_ADDRESS) {
            console.error("❌ MISMATCH! Payment Processor uses a different token!");
        } else {
            console.log("✅ Token addresses match.");
        }

    } catch (e) {
        console.log("Error reading state:", e.message);
    }
}

main().catch(console.error);
