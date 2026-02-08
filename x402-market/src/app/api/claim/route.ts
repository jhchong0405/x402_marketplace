import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || '';

// Escrow contract ABI for withdraw function
const ESCROW_ABI = [
    'function providerBalances(address provider) view returns (uint256)',
    'function withdraw(address provider, uint256 amount) external',
];

/**
 * POST /api/claim
 * Provider claims their earnings from Escrow contract
 * Body: { providerId?, walletAddress?, amount }
 * 
 * Note: This calls Escrow.withdraw() from the Relayer (contract owner)
 * The Escrow contract transfers tokens directly to the provider's wallet
 */
export async function POST(request: NextRequest) {
    if (!RELAYER_PRIVATE_KEY) {
        return NextResponse.json({ error: 'Relayer wallet not configured' }, { status: 500 });
    }

    if (!ESCROW_ADDRESS) {
        return NextResponse.json({ error: 'Escrow contract not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        let { providerId, walletAddress, amount } = body;

        if (!amount) {
            return NextResponse.json({ error: 'Missing amount' }, { status: 400 });
        }

        // Resolve wallet address
        if (!walletAddress) {
            if (!providerId || providerId === 'on-chain') {
                return NextResponse.json({ error: 'Missing walletAddress or valid providerId' }, { status: 400 });
            }

            // Lookup from database
            const provider = await prisma.provider.findUnique({
                where: { id: providerId },
            });

            if (!provider) {
                return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
            }
            walletAddress = provider.walletAddress;
        }

        // Validate wallet address
        if (!ethers.isAddress(walletAddress)) {
            return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
        }

        // Connect to Escrow contract
        const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
        const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, rpcProvider);
        const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, relayerWallet);

        // Check on-chain balance
        const balance = await escrow.providerBalances(walletAddress);
        const balanceFormatted = parseFloat(ethers.formatUnits(balance, 18));

        if (amount > balanceFormatted) {
            return NextResponse.json(
                { error: 'Insufficient claimable balance', claimableBalance: balanceFormatted },
                { status: 400 }
            );
        }

        // Convert amount to wei
        const amountWei = ethers.parseUnits(amount.toString(), 18);

        // Call Escrow.withdraw() to transfer tokens to provider
        console.log(`[Claim] Calling Escrow.withdraw(${walletAddress}, ${amountWei})`);
        const tx = await escrow.withdraw(walletAddress, amountWei, { gasLimit: 200000 });

        console.log(`[Claim] TX submitted: ${tx.hash}`);
        await tx.wait();
        console.log(`[Claim] TX confirmed: ${tx.hash}`);

        // Update database if provider exists
        if (providerId && providerId !== 'on-chain') {
            try {
                await prisma.claim.create({
                    data: {
                        providerId,
                        amount,
                        status: 'completed',
                        txHash: tx.hash,
                        completedAt: new Date(),
                    },
                });

                await prisma.provider.update({
                    where: { id: providerId },
                    data: {
                        claimedAmount: { increment: amount },
                    },
                });
            } catch (dbError) {
                console.warn('[Claim] Database update failed, but on-chain claim succeeded:', dbError);
            }
        }

        return NextResponse.json({
            success: true,
            txHash: tx.hash,
            amount,
            walletAddress,
            escrowContract: ESCROW_ADDRESS,
        });
    } catch (error) {
        console.error('Claim error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: 'Claim failed', details: errorMessage }, { status: 500 });
    }
}
