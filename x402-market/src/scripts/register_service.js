
const { ethers } = require('ethers');
const path = require('path');
const dotenv = require('dotenv');

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const REGISTRY_ADDRESS = process.env.SERVICE_REGISTRY_ADDRESS;
const PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY; // Owner of Registry

// Service Details
const SERVICE_ID = 'f7ba243b-bef4-4a77-9b23-2d7abac0fea1';
const PRICE = '3000000000000000000'; // 3 mUSDC (18 decimals)
const NAME = 'Datadog financial report predict';
const ENDPOINT = 'https://gateway.x402.market/1770592522367'; // From logs
const PROVIDER = '0xC08CC32481e49C167f505EdB5717ab6212012c07'; // From DB

const REGISTRY_ABI = [
    'function registerService(bytes32 id, address provider, uint256 price, string name, string endpoint) external'
];

async function main() {
    console.log('--- Register Service ---');
    console.log('RPC:', RPC_URL);
    console.log('Registry:', REGISTRY_ADDRESS);

    if (!PRIVATE_KEY) {
        throw new Error('Missing RELAYER_PRIVATE_KEY');
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);

    // Compute ID Hash
    const serviceIdHash = ethers.keccak256(ethers.toUtf8Bytes(SERVICE_ID));
    console.log('Service ID Hash:', serviceIdHash);

    console.log('Registering service...');
    console.log('  UUID:', SERVICE_ID);
    console.log('  Provider:', PROVIDER);
    console.log('  Price:', PRICE);

    try {
        const tx = await registry.registerService(
            serviceIdHash,
            PROVIDER,
            PRICE,
            NAME,
            ENDPOINT
        );
        console.log('Tx sent:', tx.hash);
        await tx.wait();
        console.log('✅ Service Registered Successfully');
    } catch (error) {
        console.error('❌ Registration Failed:', error.message || error);
        if (error.data) {
            console.log('  Revert Data:', error.data);
        }
    }
}

main().catch(console.error);
