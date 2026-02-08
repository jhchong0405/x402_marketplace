import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/services - List all services
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const tag = searchParams.get('tag');
    const search = searchParams.get('search');

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

    return NextResponse.json({ services });
}

// POST /api/services - Register a new service
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            name,
            description,
            endpointUrl,
            price,
            tokenAddress,

            openApiSpec,
            tags,
            providerWalletAddress,
            providerName,
        } = body;

        // Validate required fields
        if (!name || !description || !endpointUrl || price === undefined || !providerWalletAddress) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Find or create provider
        let provider = await prisma.provider.findUnique({
            where: { walletAddress: providerWalletAddress },
        });

        if (!provider) {
            provider = await prisma.provider.create({
                data: {
                    walletAddress: providerWalletAddress,
                    name: providerName || 'Anonymous Provider',
                },
            });
        }

        // Create service
        const service = await prisma.service.create({
            data: {
                name,
                description,
                endpointUrl,
                price: parseFloat(price),
                tokenAddress: tokenAddress || null,

                openApiSpec: openApiSpec ? JSON.stringify(openApiSpec) : null,
                tags: Array.isArray(tags) ? tags.join(',') : tags,
                providerId: provider.id,
            },
            include: {
                provider: {
                    select: {
                        name: true,
                        walletAddress: true,
                    },
                },
            },
        });

        return NextResponse.json({ service }, { status: 201 });
    } catch (error) {
        console.error('Error creating service:', error);
        return NextResponse.json(
            { error: 'Failed to create service' },
            { status: 500 }
        );
    }
}
