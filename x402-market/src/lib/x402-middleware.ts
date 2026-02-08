import { NextRequest, NextResponse } from 'next/server';
import { parseX402Headers, verifyPaymentSignature, create402Response, createPaymentRequirements } from './x402';

export interface X402MiddlewareOptions {
    payTo: string;
    amount: string;
    resource: string;
    description: string;
    network?: string;
    asset?: string;
    tokenSymbol?: string;
    tokenDecimals?: number;
}

/**
 * x402 Middleware factory for Next.js API routes
 * 
 * Usage:
 * ```ts
 * const x402 = createX402Middleware({
 *   payTo: '0x...',
 *   amount: '0.1',
 *   resource: '/api/ai-service',
 *   description: 'AI Image Generation Service'
 * });
 * 
 * export async function POST(request: NextRequest) {
 *   const paymentResult = await x402(request);
 *   if (paymentResult) return paymentResult; // 402 response
 *   
 *   // Continue with paid request...
 * }
 * ```
 */
export function createX402Middleware(options: X402MiddlewareOptions) {
    const requirements = createPaymentRequirements(options);

    return async function x402Middleware(
        request: NextRequest
    ): Promise<Response | null> {
        // Parse x402 headers
        const paymentHeaders = parseX402Headers(request.headers);

        // No payment headers - return 402
        if (!paymentHeaders) {
            return create402Response(requirements);
        }

        // Verify payment
        const verification = verifyPaymentSignature(
            paymentHeaders,
            options.payTo,
            requirements.maxAmountRequired
        );

        if (!verification.valid) {
            return NextResponse.json(
                { error: 'Payment verification failed', details: verification.error },
                { status: 402 }
            );
        }

        // Payment verified - allow request to proceed
        return null;
    };
}

/**
 * Wrap an API handler with x402 payment verification
 */
export function withX402<T>(
    options: X402MiddlewareOptions,
    handler: (request: NextRequest, paymentInfo: { from: string; value: string }) => Promise<T>
) {
    const middleware = createX402Middleware(options);

    return async function (request: NextRequest): Promise<Response | T> {
        const paymentResult = await middleware(request);
        if (paymentResult) return paymentResult;

        const paymentHeaders = parseX402Headers(request.headers);
        if (!paymentHeaders) {
            return NextResponse.json({ error: 'Missing payment headers' }, { status: 402 });
        }

        return handler(request, {
            from: paymentHeaders.from,
            value: paymentHeaders.value,
        });
    };
}
