import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

// Escrow contract ABI (only what we need)
const ESCROW_ABI = [
    'function providerBalances(address provider) view returns (uint256)',
];

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || '';

/**
 * GET /api/revenue/:providerId
 * Returns revenue information for a specific provider
 * - On-chain balance from Escrow contract (claimableBalance)
 * - Database records for history (totalEarnings, claims)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ providerId: string }> }
) {
    const { providerId } = await params;

    try {
        // 1. Get provider from database
        const provider = await prisma.provider.findUnique({
            where: { id: providerId },
            include: {
                claims: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                },
            },
        });

        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
        }

        // 2. Read on-chain balance from Escrow contract
        let onChainBalance = 0;
        try {
            if (ESCROW_ADDRESS && provider.walletAddress) {
                const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
                const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, rpcProvider);
                const balance = await escrow.providerBalances(provider.walletAddress);
                // Convert from wei to token units (18 decimals)
                onChainBalance = parseFloat(ethers.formatUnits(balance, 18));
            }
        } catch (chainError) {
            console.error('Failed to read on-chain balance:', chainError);
            // Fall back to database calculation
            onChainBalance = provider.totalEarnings - provider.claimedAmount;
        }

        return NextResponse.json({
            providerId: provider.id,
            walletAddress: provider.walletAddress,
            // Database records for history
            totalEarnings: provider.totalEarnings,
            claimedAmount: provider.claimedAmount,
            // On-chain balance (source of truth)
            claimableBalance: onChainBalance,
            onChainBalanceUsed: true,
            recentClaims: provider.claims,
        });
    } catch (error) {
        console.error('Revenue fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
