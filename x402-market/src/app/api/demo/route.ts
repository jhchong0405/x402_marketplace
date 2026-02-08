import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createConfluxRelayer } from '@/lib/x402-relayer';
import { create402Response, createPaymentRequirements } from '@/lib/x402';

const prisma = new PrismaClient();
const relayer = createConfluxRelayer();

// For contract-based settlement, payTo must be the Escrow contract
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || process.env.MOCK_USDC_ADDRESS || '';
const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '0.05'); // 5% default

export async function GET(request: NextRequest) {
    const paymentSignature = request.headers.get('payment-signature');

    if (!paymentSignature) {
        // Return 402 with payment requirements
        const requirements = createPaymentRequirements({
            payTo: ESCROW_ADDRESS,
            amount: '1.0',
            resource: '/api/demo',
            description: 'Demo API Access',
            scheme: 'gasless',
            asset: process.env.MOCK_USDC_ADDRESS || '',
            tokenSymbol: 'mUSDC',
            tokenDecimals: 18,
        });
        return create402Response(requirements);
    }

    // Parse and verify payment
    try {
        const tokenPayload = JSON.parse(Buffer.from(paymentSignature, 'base64').toString());
        const verifyResult = await relayer.verify(tokenPayload);

        if (!verifyResult.isValid) {
            return NextResponse.json({ error: verifyResult.error }, { status: 402 });
        }

        // Settle payment on-chain
        const settleResult = await relayer.settle(verifyResult.signatureData);

        if (!settleResult.success) {
            return NextResponse.json({ error: settleResult.error }, { status: 500 });
        }

        // Log access with revenue tracking
        const amount = parseFloat(verifyResult.signatureData.value);
        const platformFee = amount * PLATFORM_FEE_PERCENT;
        const providerRevenue = amount - platformFee;

        // For demo, we'll use a fixed provider (first in DB or create one)
        let provider = await prisma.provider.findFirst();
        if (!provider) {
            provider = await prisma.provider.create({
                data: {
                    walletAddress: '0x0000000000000000000000000000000000000000',
                    name: 'Demo Provider',
                },
            });
        }

        // Log the access
        await prisma.accessLog.create({
            data: {
                serviceId: 'demo-service', // For demo purposes
                callerAddress: verifyResult.payer,
                txHash: settleResult.txHash,
                amount,
                providerId: provider.id,
                providerRevenue,
            },
        });

        // Update provider's total earnings
        await prisma.provider.update({
            where: { id: provider.id },
            data: {
                totalEarnings: { increment: providerRevenue },
            },
        });

        // Return paid content
        return NextResponse.json({
            message: 'Payment successful! Here is your exclusive content.',
            txHash: settleResult.txHash,
            amount: amount.toString(),
            platformFee: platformFee.toString(),
            providerRevenue: providerRevenue.toString(),
        });
    } catch (error) {
        console.error('Payment processing error:', error);
        return NextResponse.json({ error: 'Payment processing failed' }, { status: 500 });
    }
}
