import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering - this route needs database access
export const dynamic = 'force-dynamic';

// GET /.well-known/ai-plugin.json - Agent Discovery Manifest
export async function GET() {
    const services = await prisma.service.findMany({
        where: { isActive: true },
        select: {
            id: true,
            name: true,
            description: true,
            endpointUrl: true,
            price: true,
            tokenAddress: true,
            tags: true,
            provider: {
                select: {
                    walletAddress: true,
                },
            },
        },
        take: 50, // Limit for manifest
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const manifest = {
        schema_version: 'v1',
        name_for_human: 'x402 Service Marketplace',
        name_for_model: 'x402_marketplace',
        description_for_human: 'A marketplace for discovering and using pay-per-call APIs powered by x402 protocol on Conflux.',
        description_for_model: `This plugin provides access to a marketplace of APIs that can be called using x402 payment headers. Each service has an endpoint URL, price (in CFX tokens), and receiver address. To call a service:
1. Construct the x402 payment header with the required amount
2. Sign the payment authorization
3. Send the request to the service endpoint with the x402 headers
4. The service will verify payment and respond`,
        auth: {
            type: 'x402',
            instructions: 'Use EIP-191 or EIP-712 signatures to authorize payments',
        },
        api: {
            type: 'openapi',
            url: `${baseUrl}/api/openapi.json`,
        },
        logo_url: `${baseUrl}/logo.png`,
        contact_email: 'support@x402market.com',
        legal_info_url: `${baseUrl}/legal`,
        services: services.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            endpoint: s.endpointUrl,
            price: {
                amount: s.price,
                token: s.tokenAddress || 'native',
                currency: 'CFX',
            },
            receiver: s.provider.walletAddress,
            details_url: `${baseUrl}/service/${s.id}`,
            tags: s.tags ? s.tags.split(',') : [],
        })),
    };

    return NextResponse.json(manifest, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
    });
}
