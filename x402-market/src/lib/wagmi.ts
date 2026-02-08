import { getDefaultConfig } from '@rainbow-me/rainbowkit';

// Conflux eSpace Mainnet
const confluxESpace = {
    id: 1030,
    name: 'Conflux eSpace',
    nativeCurrency: {
        decimals: 18,
        name: 'CFX',
        symbol: 'CFX',
    },
    rpcUrls: {
        default: { http: ['https://evm.confluxrpc.com'] },
        public: { http: ['https://evm.confluxrpc.com'] },
    },
    blockExplorers: {
        default: { name: 'ConfluxScan', url: 'https://evm.confluxscan.io' },
    },
} as const;

// Conflux eSpace Testnet
const confluxESpaceTestnet = {
    id: 71,
    name: 'Conflux eSpace Testnet',
    nativeCurrency: {
        decimals: 18,
        name: 'CFX',
        symbol: 'CFX',
    },
    rpcUrls: {
        default: { http: ['https://evmtestnet.confluxrpc.com'] },
        public: { http: ['https://evmtestnet.confluxrpc.com'] },
    },
    blockExplorers: {
        default: { name: 'ConfluxScan', url: 'https://evmtestnet.confluxscan.io' },
    },
    testnet: true,
} as const;

export const config = getDefaultConfig({
    appName: 'x402 Market',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'x402-market-demo',
    chains: [confluxESpace, confluxESpaceTestnet],
    ssr: true,
});

export { confluxESpace, confluxESpaceTestnet };
