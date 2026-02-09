const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const MOCK_USDC = process.env.MOCK_USDC_ADDRESS;

const ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function version() view returns (string)',
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    'function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)',
    'function PERMIT_TYPEHASH() view returns (bytes32)',
    'function RECEIVE_WITH_AUTHORIZATION_TYPEHASH() view returns (bytes32)'
];

async function main() {
    console.log("Analyzing token at:", MOCK_USDC);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const token = new ethers.Contract(MOCK_USDC, ABI, provider);

    // 1. Basic ERC20
    try {
        console.log("Name:", await token.name());
    } catch (e) { console.log("Name failed"); }

    try {
        console.log("Symbol:", await token.symbol());
    } catch (e) { console.log("Symbol failed"); }

    // 2. EIP-712 Domain
    try {
        const domain = await token.eip712Domain();
        console.log("✅ eip712Domain found:");
        console.log("   Name:", domain.name);
        console.log("   Version:", domain.version);
        console.log("   ChainID:", domain.chainId);
        console.log("   Contract:", domain.verifyingContract);
    } catch (e) {
        console.log("⚠️ eip712Domain failed (Older OZ or custom implementation)");
    }

    try {
        console.log("DOMAIN_SEPARATOR:", await token.DOMAIN_SEPARATOR());
    } catch (e) { console.log("DOMAIN_SEPARATOR failed"); }

    // 3. TypeHashes from Source
    try {
        console.log("Typehash:", await token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH());
    } catch (e) { console.log("RECEIVE_WITH_AUTHORIZATION_TYPEHASH failed"); }

}

main().catch(console.error);
