import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createConfluxRelayer } from '@/lib/x402-relayer';

const relayer = createConfluxRelayer();
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || '';

/**
 * Agent-optimized service discovery endpoint
 * 
 * Returns services in a format optimized for AI agent consumption,
 * with structured pricing, payment requirements, and OpenAPI specs.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const tag = searchParams.get('tag');
    const search = searchParams.get('search');

    // Build query
    const where: Record<string, unknown> = { isActive: true };

    if (tag) {
        where.tags = { contains: tag };
    }

    if (search) {
        where.OR = [
            { name: { contains: search } },
            { description: { contains: search } },
        ];
    }

    const services = await prisma.service.findMany({
        where,
        include: {
            provider: {
                select: {
                    name: true,
                    walletAddress: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    // Format for agent consumption
    const agentServices = services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        endpoint: service.endpointUrl,

        // Structured pricing info
        price: {
            amount: BigInt(Math.round(service.price * 1e18)).toString(),
            display: `${service.price} ${service.tokenAddress ? 'Token' : 'mUSDC'}`,
            token: service.tokenAddress || '0x865310dc9D0bFE1460caB221B4bF3DA2040b94D7',
            decimals: 18,
        },

        // Payment destination
        payTo: ESCROW_ADDRESS,

        // Metadata
        tags: service.tags ? service.tags.split(',').map(t => t.trim()) : [],
        provider: service.provider.name,

        // OpenAPI spec for understanding API schema
        openApiSpec: service.openApiSpec ? JSON.parse(service.openApiSpec) : null,

        // x402 payment requirements
        paymentRequirements: {
            scheme: 'exact',
            network: 'eip155:71',
            maxAmountRequired: BigInt(Math.round(service.price * 1e18)).toString(),
            payTo: ESCROW_ADDRESS,
            asset: service.tokenAddress || '0x865310dc9D0bFE1460caB221B4bF3DA2040b94D7',
            maxTimeoutSeconds: 300,
        },
    }));

    return NextResponse.json(
        {
            services: agentServices,
            meta: {
                total: agentServices.length,
                documentation: '/AGENT.md',
                executeEndpoint: '/api/agent/execute',
                network: 'Conflux eSpace Testnet (chainId: 71)',
            },
        },
        {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
        }
    );
}
