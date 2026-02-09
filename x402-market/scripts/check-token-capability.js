const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const MOCK_USDC = process.env.MOCK_USDC_ADDRESS;

// receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
// Signature: 0xef55bec6
const SELECTOR = '0xef55bec6';

// transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
// Signature: 0xe3ee160e
const SELECTOR_TRANSFER = '0xe3ee160e';

async function main() {
    console.log("Checking token capabilities at:", MOCK_USDC);
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // We can't easily check if a function exists without ABI unless we try to call it or decompile.
    // However, we can try to *estimateGas* for a dummy call, or `eth_call`.
    // If it reverts with "fallback" or specific error, it might not exist.
    // But better: check bytecode for the selector.

    const code = await provider.getCode(MOCK_USDC);
    if (code === '0x') {
        console.error("❌ No code at address!");
        return;
    }

    // Check if selector is present in bytecode (simple check, not 100% reliable due to optimizations/proxies)
    // receiveWithAuthorization selector: ef55bec6
    if (code.includes('ef55bec6')) {
        console.log("✅ Selector ef55bec6 (receiveWithAuthorization) FOUND in bytecode.");
    } else {
        console.log("⚠️ Selector ef55bec6 (receiveWithAuthorization) NOT found in bytecode.");
        console.log("   -> Token might NOT support EIP-3009.");
    }

    if (code.includes('e3ee160e')) {
        console.log("✅ Selector e3ee160e (transferWithAuthorization) FOUND in bytecode.");
    } else {
        console.log("⚠️ Selector e3ee160e (transferWithAuthorization) NOT found in bytecode.");
    }
}

main().catch(console.error);
