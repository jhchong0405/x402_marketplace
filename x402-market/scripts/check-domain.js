const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const MOCK_USDC = process.env.MOCK_USDC_ADDRESS;

const ABI = [
    'function name() view returns (string)',
    'function version() view returns (string)',
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    'function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)'
];

async function main() {
    console.log("Checking token domain at:", MOCK_USDC);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const token = new ethers.Contract(MOCK_USDC, ABI, provider);

    try {
        const name = await token.name();
        console.log("Name:", name);
    } catch (e) {
        console.log("Name error:", e.message);
    }

    try {
        const version = await token.version();
        console.log("Version:", version);
    } catch (e) {
        // version() might not be on standard ERC20, but EIP-2612/3009 usually have it or put it in domain
        console.log("Version error (common if not exposed):", e.message);
    }

    try {
        const separator = await token.DOMAIN_SEPARATOR();
        console.log("DOMAIN_SEPARATOR:", separator);
    } catch (e) {
        console.log("DOMAIN_SEPARATOR error:", e.message);
    }

    // Calculate expected separator for "MockUSDC" version "1" chain 71
    const domain = {
        name: "MockUSDC",
        version: "1",
        chainId: 71,
        verifyingContract: MOCK_USDC
    };

    const calculated = ethers.TypedDataEncoder.hashDomain(domain);
    console.log("Expected SEPARATOR (MockUSDC, 1, 71):", calculated);

}

main().catch(console.error);
