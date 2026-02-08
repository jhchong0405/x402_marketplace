import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { prisma } from '@/lib/prisma';
import { createConfluxRelayer, SignatureData } from '@/lib/x402-relayer';

interface ExecuteRequest {
    serviceId: string;
    walletAddress: string;
    signature: SignatureData;
    requestBody?: Record<string, unknown>;
}

/**
 * Unified execution endpoint for AI agents
 * 
 * Handles:
 * 1. Service lookup
 * 2. Payment verification and settlement
 * 3. Proxying the request to the actual service
 */
export async function POST(request: NextRequest) {
    try {
        const body: ExecuteRequest = await request.json();
        const { serviceId, walletAddress, signature, requestBody } = body;

        // Validate required fields
        if (!serviceId || !walletAddress || !signature) {
            return NextResponse.json(
                {
                    error: 'Missing required fields',
                    required: ['serviceId', 'walletAddress', 'signature'],
                },
                { status: 400 }
            );
        }

        // Find the service
        const service = await prisma.service.findUnique({
            where: { id: serviceId },
            include: {
                provider: true,
            },
        });

        if (!service || !service.isActive) {
            return NextResponse.json(
                { error: 'Service not found or inactive' },
                { status: 404 }
            );
        }

        // Verify signature destination matches ESCROW contract
        const relayer = createConfluxRelayer();
        const escrowAddress = process.env.ESCROW_ADDRESS || '';
        if (signature.to.toLowerCase() !== escrowAddress.toLowerCase()) {
            return NextResponse.json(
                {
                    error: 'Signature payTo address does not match Escrow contract',
                    expected: escrowAddress,
                    received: signature.to,
                },
                { status: 400 }
            );
        }

        // Verify payment amount
        const expectedAmount = BigInt(Math.round(service.price * 1e18));
        const providedAmount = BigInt(signature.value);
        if (providedAmount < expectedAmount) {
            return NextResponse.json(
                {
                    error: 'Insufficient payment amount',
                    expected: expectedAmount.toString(),
                    provided: providedAmount.toString(),
                },
                { status: 400 }
            );
        }


        const verifyResult = await relayer.verify({ ...signature });

        if (!verifyResult.isValid) {
            return NextResponse.json(
                {
                    error: 'Payment verification failed',
                    details: verifyResult.error,
                },
                { status: 402 }
            );
        }

        // Settle on-chain
        // Compute serviceId hash for contract
        const serviceIdHash = ethers.keccak256(ethers.toUtf8Bytes(service.id));
        const settleResult = await relayer.settle(verifyResult.signatureData, serviceIdHash);

        if (!settleResult.success) {
            return NextResponse.json(
                {
                    error: 'Payment settlement failed',
                    details: settleResult.error,
                },
                { status: 500 }
            );
        }

        // Log access
        try {
            await prisma.accessLog.create({
                data: {
                    serviceId: service.id,
                    callerAddress: walletAddress,
                    amount: service.price,
                    txHash: settleResult.txHash,
                },
            });
        } catch {
            // AccessLog model might not exist yet, continue
        }

        // Proxy the request to the actual service
        let serviceResponse: unknown = null;
        try {
            const proxyResponse = await fetch(service.endpointUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-402-Payer': walletAddress,
                    'X-402-TxHash': settleResult.txHash || '',
                },
                body: JSON.stringify(requestBody || {}),
            });

            if (proxyResponse.ok) {
                serviceResponse = await proxyResponse.json();
            } else {
                serviceResponse = {
                    error: 'Service returned error',
                    status: proxyResponse.status,
                };
            }
        } catch (proxyError) {
            // Service might not be reachable, but payment was made
            serviceResponse = {
                error: 'Could not reach service endpoint',
                message: proxyError instanceof Error ? proxyError.message : 'Unknown error',
                note: 'Payment was processed successfully',
            };
        }

        return NextResponse.json({
            success: true,
            payment: {
                txHash: settleResult.txHash,
                payer: walletAddress,
                amount: service.price,
                receiver: escrowAddress,
            },
            service: {
                id: service.id,
                name: service.name,
                endpoint: service.endpointUrl,
            },
            response: serviceResponse,
        });
    } catch (error) {
        console.error('[Agent Execute] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * OPTIONS for CORS
 */
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
