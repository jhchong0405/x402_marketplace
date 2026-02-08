import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// Escrow contract ABI (only what we need)
const ESCROW_ABI = [
    'function providerBalances(address provider) view returns (uint256)',
];

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || '';

/**
 * GET /api/revenue/wallet?address=0x...
 * Returns on-chain balance for any wallet address (no database record required)
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('address');

    if (!walletAddress) {
        return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
    }

    if (!ethers.isAddress(walletAddress)) {
        return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    if (!ESCROW_ADDRESS) {
        return NextResponse.json({ error: 'Escrow contract not configured' }, { status: 500 });
    }

    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, provider);
        const balance = await escrow.providerBalances(walletAddress);

        // Convert from wei to token units (18 decimals)
        const balanceFormatted = parseFloat(ethers.formatUnits(balance, 18));

        return NextResponse.json({
            walletAddress,
            claimableBalance: balanceFormatted,
            rawBalance: balance.toString(),
            escrowContract: ESCROW_ADDRESS,
            source: 'on-chain',
        });
    } catch (error) {
        console.error('On-chain balance fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch on-chain balance' }, { status: 500 });
    }
}
