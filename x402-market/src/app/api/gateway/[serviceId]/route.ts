import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { prisma } from '@/lib/prisma';

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';
const PAYMENT_PROCESSOR_ADDRESS = process.env.PAYMENT_PROCESSOR_ADDRESS || '';
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || '';
const MOCK_USDC_ADDRESS = process.env.MOCK_USDC_ADDRESS || '';

const PROCESSOR_ABI = [
    'function processPayment(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s, bytes32 serviceId) external',
];

/**
 * Gateway API - Unified entry point for HOSTED and PROXY services
 * Handles x402 payment verification automatically
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { serviceId: string } }
) {
    const { serviceId } = params;

    // 1. Fetch service
    const service = await prisma.service.findUnique({
        where: { id: serviceId },
        include: { provider: true },
    });

    if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    if (!service.isActive) {
        return NextResponse.json({ error: 'Service is inactive' }, { status: 410 });
    }

    // Only HOSTED and PROXY types use this gateway
    if (service.type === 'API') {
        return NextResponse.json(
            { error: 'This service uses direct x402 API. Check endpointUrl for access.' },
            { status: 400 }
        );
    }

    const paymentSignature = request.headers.get('payment-signature');

    // 2. No payment - return 402 Payment Required
    if (!paymentSignature) {
        return NextResponse.json(
            {
                error: 'Payment Required',
                accepts: [
                    {
                        scheme: 'gasless',
                        network: 'eip155:71',
                        maxAmountRequired: (service.price * 1e18).toString(),
                        resource: `/api/gateway/${serviceId}`,
                        description: `Access to: ${service.name}`,
                        payTo: service.provider.walletAddress,
                        maxTimeoutSeconds: 300,
                        asset: MOCK_USDC_ADDRESS,
                        extra: {
                            symbol: 'mUSDC',
                            decimals: 18,
                        },
                    },
                ],
            },
            { status: 402 }
        );
    }

    // 3. Verify payment signature
    try {
        const sig = JSON.parse(paymentSignature);
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
        const processor = new ethers.Contract(PAYMENT_PROCESSOR_ADDRESS, PROCESSOR_ABI, relayerWallet);

        // Submit payment transaction
        const tx = await processor.processPayment(
            sig.from,
            ESCROW_ADDRESS,
            sig.value,
            sig.validAfter,
            sig.validBefore,
            sig.nonce,
            sig.v,
            sig.r,
            sig.s,
            ethers.id(serviceId), // serviceId as bytes32
            { gasLimit: 500000 }
        );

        await tx.wait();

        // 4. Update stats
        await prisma.service.update({
            where: { id: serviceId },
            data: {
                accessCount: { increment: 1 },
                totalRevenue: { increment: service.price },
            },
        });

        await prisma.accessLog.create({
            data: {
                serviceId,
                callerAddress: sig.from,
                txHash: tx.hash,
                amount: service.price,
                providerId: service.providerId,
                providerRevenue: service.price * 0.95,
            },
        });

        // 5. Return data based on type
        if (service.type === 'HOSTED') {
            return NextResponse.json({
                id: service.id,
                name: service.name,
                description: service.description,
                content: service.content,
                txHash: tx.hash,
            });
        }

        if (service.type === 'PROXY') {
            // Forward to actual API
            const targetUrl = service.endpointUrl;
            const targetResponse = await fetch(targetUrl, {
                method: request.method,
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            const data = await targetResponse.json();

            return NextResponse.json({
                ...data,
                txHash: tx.hash,
            });
        }
    } catch (error: any) {
        console.error('Payment verification error:', error);
        return NextResponse.json(
            { error: 'Payment verification failed', details: error.message },
            { status: 402 }
        );
    }
    return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
}

export async function POST(
    request: NextRequest,
    { params }: { params: { serviceId: string } }
) {
    return GET(request, { params });
}
