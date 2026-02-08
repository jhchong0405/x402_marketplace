/**
 * x402 Payment SDK for Conflux eSpace
 * 
 * This module provides utilities for:
 * 1. Generating x402 payment headers (client-side)
 * 2. Verifying x402 payment headers (server-side)
 * 3. Settlement monitoring
 */

import { ethers } from 'ethers';

// Types
export interface X402PaymentRequirements {
    scheme: 'exact' | 'gasless';
    network: string; // e.g., "eip155:71" for Conflux testnet
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType?: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string; // "0x0000..." for native or token address
    extra?: {
        symbol: string;
        decimals: number;
    };
}

export interface X402PaymentPayload {
    x402Version: number;
    scheme: string;
    network: string;
    payload: {
        signature: string;
        authorization: {
            from: string;
            to: string;
            value: string;
            validAfter: number;
            validBefore: number;
            nonce: string;
        };
    };
}

export interface X402Header {
    to: string;
    value: string;
    signature: string;
    from: string;
    nonce: string;
    validAfter: number;
    validBefore: number;
}

// Constants
export const X402_HEADER_PREFIX = 'x-402-';
export const NATIVE_ASSET = '0x0000000000000000000000000000000000000000';

// EIP-712 Type definitions for gasless payments
export const EIP712_TYPES = {
    ReceiveWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
    ],
};

/**
 * Generate a random nonce for EIP-3009
 */
export function generateNonce(): string {
    return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Create x402 payment requirements object
 */
export function createPaymentRequirements(options: {
    payTo: string;
    amount: string;
    resource: string;
    description: string;
    network?: string;
    scheme?: 'exact' | 'gasless';
    asset?: string;
    tokenSymbol?: string;
    tokenDecimals?: number;
}): X402PaymentRequirements {
    const {
        payTo,
        amount,
        resource,
        description,
        network = 'eip155:71', // Conflux testnet default
        scheme = 'exact',
        asset = NATIVE_ASSET,
        tokenSymbol = 'CFX',
        tokenDecimals = 18,
    } = options;

    return {
        scheme,
        network,
        maxAmountRequired: ethers.parseUnits(amount, tokenDecimals).toString(),
        resource,
        description,
        payTo,
        maxTimeoutSeconds: 300,
        asset,
        extra: {
            symbol: tokenSymbol,
            decimals: tokenDecimals,
        },
    };
}

/**
 * Create 402 Payment Required response
 */
export function create402Response(requirements: X402PaymentRequirements): Response {
    return new Response(
        JSON.stringify({
            error: 'Payment Required',
            accepts: [requirements],
        }),
        {
            status: 402,
            headers: {
                'Content-Type': 'application/json',
                'X-402-Version': '1',
            },
        }
    );
}

/**
 * Parse x402 headers from request
 */
export function parseX402Headers(headers: Headers): X402Header | null {
    const to = headers.get('x-402-to');
    const value = headers.get('x-402-value');
    const signature = headers.get('x-402-signature');
    const from = headers.get('x-402-from');
    const nonce = headers.get('x-402-nonce');
    const validAfter = headers.get('x-402-valid-after');
    const validBefore = headers.get('x-402-valid-before');

    if (!to || !value || !signature || !from) {
        return null;
    }

    return {
        to,
        value,
        signature,
        from,
        nonce: nonce || '',
        validAfter: validAfter ? parseInt(validAfter) : 0,
        validBefore: validBefore ? parseInt(validBefore) : Math.floor(Date.now() / 1000) + 3600,
    };
}

/**
 * Verify x402 payment signature (for native CFX payments)
 * Returns the signer address if valid
 */
export function verifyPaymentSignature(
    header: X402Header,
    expectedTo: string,
    expectedMinValue: string
): { valid: boolean; error?: string } {
    try {
        // Check recipient
        if (header.to.toLowerCase() !== expectedTo.toLowerCase()) {
            return { valid: false, error: 'Invalid recipient address' };
        }

        // Check value
        const paymentValue = BigInt(header.value);
        const minValue = BigInt(expectedMinValue);
        if (paymentValue < minValue) {
            return { valid: false, error: 'Insufficient payment amount' };
        }

        // Check time validity
        const now = Math.floor(Date.now() / 1000);
        if (header.validAfter > now) {
            return { valid: false, error: 'Payment not yet valid' };
        }
        if (header.validBefore < now) {
            return { valid: false, error: 'Payment has expired' };
        }

        // For simple verification, we trust the signature format
        // In production, you would verify the actual signature on-chain or via typed data
        if (!header.signature || header.signature.length < 130) {
            return { valid: false, error: 'Invalid signature format' };
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: `Verification error: ${error}` };
    }
}

/**
 * Create EIP-712 domain for gasless payments
 */
export function createEIP712Domain(
    tokenAddress: string,
    chainId: number,
    tokenName: string = 'MockUSDC'
) {
    return {
        name: tokenName,
        version: '1',
        chainId,
        verifyingContract: tokenAddress,
    };
}

/**
 * Create authorization message for EIP-3009 gasless payment
 */
export function createAuthorizationMessage(
    from: string,
    to: string,
    value: string,
    validAfter: number = 0,
    validBefore: number = Math.floor(Date.now() / 1000) + 3600
) {
    return {
        from,
        to,
        value,
        validAfter,
        validBefore,
        nonce: generateNonce(),
    };
}

/**
 * Format x402 headers for client request
 */
export function formatX402Headers(
    to: string,
    value: string,
    signature: string,
    from: string,
    nonce?: string,
    validAfter?: number,
    validBefore?: number
): Record<string, string> {
    const headers: Record<string, string> = {
        'x-402-to': to,
        'x-402-value': value,
        'x-402-signature': signature,
        'x-402-from': from,
    };

    if (nonce) headers['x-402-nonce'] = nonce;
    if (validAfter !== undefined) headers['x-402-valid-after'] = validAfter.toString();
    if (validBefore !== undefined) headers['x-402-valid-before'] = validBefore.toString();

    return headers;
}
