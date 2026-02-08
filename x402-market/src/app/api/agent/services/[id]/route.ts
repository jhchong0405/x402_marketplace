import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createConfluxRelayer } from '@/lib/x402-relayer';

const relayer = createConfluxRelayer();
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || '';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * Get detailed service info for agents
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    const { id } = await params;

    const service = await prisma.service.findUnique({
        where: { id },
        include: {
            provider: {
                select: {
                    name: true,
                    walletAddress: true,
                },
            },
        },
    });

    if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const relayerAddress = relayer.getRelayerAddress();

    // Comprehensive agent response
    const agentService = {
        id: service.id,
        name: service.name,
        description: service.description,
        endpoint: service.endpointUrl,

        // Pricing
        price: {
            amount: BigInt(Math.round(service.price * 1e18)).toString(),
            display: `${service.price} mUSDC`,
            token: service.tokenAddress || process.env.MOCK_USDC_ADDRESS || '',
            decimals: 18,
        },

        // Payment info - use ESCROW_ADDRESS for contract settlement
        payTo: ESCROW_ADDRESS,
        relayer: relayerAddress,

        // OpenAPI for understanding the API
        openApiSpec: service.openApiSpec ? JSON.parse(service.openApiSpec) : null,

        // Complete payment requirements
        paymentRequirements: {
            scheme: 'exact',
            network: 'eip155:71',
            maxAmountRequired: BigInt(Math.round(service.price * 1e18)).toString(),
            payTo: ESCROW_ADDRESS,
            asset: service.tokenAddress || process.env.MOCK_USDC_ADDRESS || '',
            maxTimeoutSeconds: 300,
            extra: {
                symbol: 'mUSDC',
                decimals: 18,
                tokenName: 'Mock USD Coin',
            },
        },

        // EIP-712 signing info
        signingInfo: {
            domain: {
                name: 'Mock USD Coin',
                version: '1',
                chainId: 71,
                verifyingContract: service.tokenAddress || process.env.MOCK_USDC_ADDRESS || '',
            },
            types: {
                ReceiveWithAuthorization: [
                    { name: 'from', type: 'address' },
                    { name: 'to', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'validAfter', type: 'uint256' },
                    { name: 'validBefore', type: 'uint256' },
                    { name: 'nonce', type: 'bytes32' },
                ],
            },
            primaryType: 'ReceiveWithAuthorization',
        },

        // Provider info
        provider: service.provider,
        tags: service.tags ? service.tags.split(',').map((t) => t.trim()) : [],

        // Execution endpoint
        executeEndpoint: '/api/agent/execute',
    };

    return NextResponse.json(
        { service: agentService },
        {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
        }
    );
}
