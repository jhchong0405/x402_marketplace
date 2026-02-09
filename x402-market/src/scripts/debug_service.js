
const { ethers } = require('ethers');
const path = require('path');
const dotenv = require('dotenv');

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const REGISTRY_ADDRESS = process.env.SERVICE_REGISTRY_ADDRESS;
const SERVICE_ID = 'f7ba243b-bef4-4a77-9b23-2d7abac0fea1'; // From logs

const REGISTRY_ABI = [
    'function owner() view returns (address)',
    'function getService(bytes32 id) external view returns (address provider, uint256 price, bool isActive)',
    'function registerService(bytes32 id, address provider, uint256 price, string name, string endpoint) external',
    'function services(bytes32 id) external view returns (bytes32 id, address provider, uint256 price, string name, string endpoint, bool isActive, uint256 createdAt)'
];

async function main() {
    console.log('--- Debug Service Registry ---');
    console.log('RPC:', RPC_URL);
    console.log('Registry:', REGISTRY_ADDRESS);
    console.log('Service UUID:', SERVICE_ID);

    if (!REGISTRY_ADDRESS) {
        console.error('Missing SERVICE_REGISTRY_ADDRESS in .env');
        return;
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);

    // Compute ID Hash
    const serviceIdHash = ethers.keccak256(ethers.toUtf8Bytes(SERVICE_ID));
    console.log('Service ID Hash:', serviceIdHash);

    // Check Owner
    try {
        const owner = await registry.owner();
        console.log('Registry Owner:', owner);
    } catch (err) {
        console.log('Failed to get owner:', err.message);
    }

    try {
        console.log('Checking registration...');
        // Try calling getService
        // If it reverts with "Service not found", we know it's not registered
        // If it returns zeros, it might also mean not registered depending on implementation
        const result = await registry.getService(serviceIdHash);
        console.log('✅ Service Found:');
        console.log('  Provider:', result.provider);
        console.log('  Price:', ethers.formatEther(result.price));
        console.log('  Active:', result.isActive);
    } catch (error) {
        console.log('❌ Service Check Failed:', error.message || error);
        if (error.data) {
            console.log('  Revert Data:', error.data);
        } else if (error.info && error.info.error) {
            console.log('  Inner Error:', error.info.error.message);
        }
    }
}

main().catch(console.error);
