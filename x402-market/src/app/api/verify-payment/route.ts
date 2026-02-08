import { NextRequest, NextResponse } from 'next/server';
import { createConfluxRelayer } from '@/lib/x402-relayer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const relayer = createConfluxRelayer();

const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '0.05');

/**
 * POST /api/verify-payment
 * 
 * External services can call this to verify and settle x402 payments.
 * This allows third-party providers to delegate payment processing to the platform.
 * 
 * Body: {
 *   paymentSignature: string (base64 encoded),
 *   serviceId: string,
 *   providerId: string,
 *   amount: number
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { paymentSignature, serviceId, providerId, amount, resourceId } = body;

        if (!paymentSignature || !providerId || amount === undefined || !serviceId) {
            return NextResponse.json({ error: 'Missing required fields (serviceId is required)' }, { status: 400 });
        }

        // Parse and verify payment signature
        const tokenPayload = JSON.parse(Buffer.from(paymentSignature, 'base64').toString());
        const verifyResult = await relayer.verify(tokenPayload);

        if (!verifyResult.isValid) {
            return NextResponse.json({
                valid: false,
                error: verifyResult.error
            }, { status: 402 });
        }

        // Settle payment on-chain via PaymentProcessor
        // Now requires serviceId to route funds correctly
        const settleResult = await relayer.settle(verifyResult.signatureData, serviceId);

        if (!settleResult.success) {
            return NextResponse.json({
                valid: false,
                error: settleResult.error
            }, { status: 500 });
        }

        // Calculate revenue split
        const platformFee = amount * PLATFORM_FEE_PERCENT;
        const providerRevenue = amount - platformFee;

        // Log access with revenue tracking (only if serviceId provided)
        if (serviceId) {
            try {
                await prisma.accessLog.create({
                    data: {
                        serviceId,
                        callerAddress: verifyResult.payer,
                        txHash: settleResult.txHash,
                        amount,
                        providerId,
                        providerRevenue,
                    },
                });
            } catch (logError) {
                console.warn('Failed to log access (service may not be registered):', logError);
            }
        }

        // Find or create provider
        let provider = await prisma.provider.findUnique({
            where: { id: providerId },
        });

        if (!provider) {
            // Auto-create provider for external services
            provider = await prisma.provider.create({
                data: {
                    id: providerId,
                    walletAddress: verifyResult.payer, // Use payer as placeholder
                    name: `External Provider (${resourceId || 'unknown'})`,
                },
            });
        }

        // Update provider's total earnings
        await prisma.provider.update({
            where: { id: providerId },
            data: {
                totalEarnings: { increment: providerRevenue },
            },
        });

        return NextResponse.json({
            valid: true,
            txHash: settleResult.txHash,
            payer: verifyResult.payer,
            amount,
            platformFee,
            providerRevenue,
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        return NextResponse.json({
            valid: false,
            error: 'Payment verification failed'
        }, { status: 500 });
    }
}
