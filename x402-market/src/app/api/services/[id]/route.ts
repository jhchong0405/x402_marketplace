import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/services/[id] - Get service details
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
        return NextResponse.json(
            { error: 'Service not found' },
            { status: 404 }
        );
    }

    // Parse openApiSpec if it exists
    const serviceWithParsedSpec = {
        ...service,
        openApiSpec: service.openApiSpec ? JSON.parse(service.openApiSpec) : null,
        tags: service.tags ? service.tags.split(',') : [],
    };

    return NextResponse.json({ service: serviceWithParsedSpec });
}

// PATCH /api/services/[id] - Update service
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const { id } = await params;

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
            isActive,
        } = body;

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (endpointUrl !== undefined) updateData.endpointUrl = endpointUrl;
        if (price !== undefined) updateData.price = parseFloat(price);
        if (tokenAddress !== undefined) updateData.tokenAddress = tokenAddress;
        if (openApiSpec !== undefined) updateData.openApiSpec = JSON.stringify(openApiSpec);
        if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags.join(',') : tags;
        if (isActive !== undefined) updateData.isActive = isActive;

        const service = await prisma.service.update({
            where: { id },
            data: updateData,
            include: {
                provider: {
                    select: {
                        name: true,
                        walletAddress: true,
                    },
                },
            },
        });

        return NextResponse.json({ service });
    } catch (error) {
        console.error('Error updating service:', error);
        return NextResponse.json(
            { error: 'Failed to update service' },
            { status: 500 }
        );
    }
}

// DELETE /api/services/[id] - Deactivate service
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const { id } = await params;

    try {
        await prisma.service.update({
            where: { id },
            data: { isActive: false },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting service:', error);
        return NextResponse.json(
            { error: 'Failed to delete service' },
            { status: 500 }
        );
    }
}
