import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ethers } from 'ethers';

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

const REGISTRY_ABI = [
    'function registerService(bytes32 id, address provider, uint256 price, string name, string endpoint) external'
];

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

        // ---------------------------------------------------------
        // On-Chain Registration (Fix)
        // ---------------------------------------------------------
        let onChainTx = null;
        try {
            const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY;
            const REGISTRY_ADDRESS = process.env.SERVICE_REGISTRY_ADDRESS;
            const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';

            if (RELAYER_KEY && REGISTRY_ADDRESS) {
                console.log(`[API] Registering service on-chain: ${service.id}`);
                const provider = new ethers.JsonRpcProvider(RPC_URL);
                const wallet = new ethers.Wallet(RELAYER_KEY, provider);
                const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);

                const serviceIdHash = ethers.keccak256(ethers.toUtf8Bytes(service.id));
                const priceWei = ethers.parseEther(price.toString());

                // Register: id, provider(wallet), price, name, endpoint
                const tx = await registry.registerService(
                    serviceIdHash,
                    providerWalletAddress, // The user's wallet acts as the provider
                    priceWei,
                    name,
                    endpointUrl
                );
                console.log(`[API] Tx Sent: ${tx.hash}`);
                onChainTx = tx.hash;
            } else {
                console.warn("[API] Missing Relayer config. Skipping on-chain registration.");
                // If on-chain registration is required, we should probably fail here too.
                // For now, let's allow local-only if env is missing (dev mode).
            }
        } catch (chainError: any) {
            console.error("[API] Failed to register on-chain:", chainError);

            // ROLLBACK: Delete the service from DB
            console.warn(`[API] Rolling back service creation for ${service.id}`);
            await prisma.service.delete({
                where: { id: service.id }
            });

            return NextResponse.json(
                {
                    error: 'Failed to register service on-chain. Creation rolled back.',
                    details: chainError.message || 'Unknown blockchain error'
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            service,
            onChainTx,
        }, { status: 201 });

    } catch (error) {
        console.error('Error creating service:', error);
        return NextResponse.json(
            { error: 'Failed to create service' },
            { status: 500 }
        );
    }
}
