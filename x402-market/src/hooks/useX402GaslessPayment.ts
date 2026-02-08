'use client';

import { useCallback, useState } from 'react';
import { useAccount, useSignTypedData, useChainId } from 'wagmi';

// EIP-712 Types for EIP-3009 ReceiveWithAuthorization
const RECEIVE_WITH_AUTH_TYPES = {
    ReceiveWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
    ],
} as const;

export interface PaymentRequirement {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    payTo: string;
    asset: string;
    maxTimeoutSeconds: number;
    extra?: {
        symbol: string;
        decimals: number;
        tokenName?: string;
    };
}

export interface X402PaymentResult {
    success: boolean;
    response?: Response;
    data?: unknown;
    error?: string;
    txHash?: string;
}

/**
 * Generate a random bytes32 nonce
 */
function generateNonce(): `0x${string}` {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Hook for making gasless x402 payments using EIP-3009
 */
export function useX402GaslessPayment() {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { signTypedDataAsync } = useSignTypedData();
    const [isLoading, setIsLoading] = useState(false);
    const [lastTxHash, setLastTxHash] = useState<string | null>(null);

    /**
     * Sign an EIP-3009 authorization for gasless payment
     */
    const signAuthorization = useCallback(
        async (
            tokenAddress: string,
            tokenName: string,
            payTo: string,
            amount: string,
            validitySeconds: number = 3600
        ) => {
            if (!address) throw new Error('Wallet not connected');

            const now = Math.floor(Date.now() / 1000);
            const validAfter = now;
            const validBefore = now + validitySeconds;
            const nonce = generateNonce();

            // EIP-712 Domain
            const domain = {
                name: tokenName,
                version: '1',
                chainId,
                verifyingContract: tokenAddress as `0x${string}`,
            };

            // Message to sign
            const message = {
                from: address,
                to: payTo as `0x${string}`,
                value: BigInt(amount),
                validAfter: BigInt(validAfter),
                validBefore: BigInt(validBefore),
                nonce,
            };

            // Sign typed data
            const signature = await signTypedDataAsync({
                domain,
                types: RECEIVE_WITH_AUTH_TYPES,
                primaryType: 'ReceiveWithAuthorization',
                message,
            });

            // Split signature into v, r, s
            const r = signature.slice(0, 66) as `0x${string}`;
            const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
            const v = parseInt(signature.slice(130, 132), 16);

            return {
                from: address,
                to: payTo,
                value: amount,
                validAfter,
                validBefore,
                nonce,
                v,
                r,
                s,
                signature,
            };
        },
        [address, chainId, signTypedDataAsync]
    );

    /**
     * Make a gasless x402 request with auto-handling of 402 responses
     */
    const x402GaslessFetch = useCallback(
        async (
            url: string,
            options: RequestInit = {}
        ): Promise<X402PaymentResult> => {
            if (!address) {
                return { success: false, error: 'Wallet not connected' };
            }

            setIsLoading(true);

            try {
                // Step 1: Initial request
                const initialResponse = await fetch(url, options);

                // If not 402, return as-is
                if (initialResponse.status !== 402) {
                    const data = await initialResponse.json().catch(() => null);
                    setIsLoading(false);
                    return {
                        success: initialResponse.ok,
                        response: initialResponse,
                        data,
                    };
                }

                // Step 2: Parse payment requirements
                const paymentInfo = await initialResponse.json();
                if (!paymentInfo.accepts || paymentInfo.accepts.length === 0) {
                    throw new Error('No payment options available');
                }

                const requirement = paymentInfo.accepts[0] as PaymentRequirement;
                const tokenAddress = requirement.asset;
                const tokenName = requirement.extra?.tokenName || 'Mock USD Coin';
                const payTo = requirement.payTo;
                const amount = requirement.maxAmountRequired;

                console.log('[x402] Payment required:', {
                    token: tokenAddress,
                    amount,
                    payTo,
                });

                // Step 3: Sign authorization
                const authData = await signAuthorization(
                    tokenAddress,
                    tokenName,
                    payTo,
                    amount,
                    requirement.maxTimeoutSeconds
                );

                console.log('[x402] Authorization signed');

                // Step 4: Create tunnel mode payload
                const signatureData = {
                    from: authData.from,
                    to: authData.to,
                    value: authData.value,
                    validAfter: authData.validAfter,
                    validBefore: authData.validBefore,
                    nonce: authData.nonce,
                    v: authData.v,
                    r: authData.r,
                    s: authData.s,
                };

                const proof = Buffer.from(JSON.stringify(signatureData)).toString('base64');

                // Token payload echoes back the requirement
                const tokenPayload = {
                    x402Version: 2,
                    accepted: requirement,
                    proof,
                };

                const paymentToken = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');

                // Step 5: Retry with payment signature
                console.log('[x402] Sending payment to relayer...');

                const paidResponse = await fetch(url, {
                    ...options,
                    headers: {
                        ...options.headers,
                        'payment-signature': paymentToken,
                        'Content-Type': 'application/json',
                    },
                });

                const responseData = await paidResponse.json().catch(() => null);

                if (responseData?.txHash) {
                    setLastTxHash(responseData.txHash);
                }

                setIsLoading(false);

                return {
                    success: paidResponse.ok,
                    response: paidResponse,
                    data: responseData,
                    txHash: responseData?.txHash,
                };
            } catch (error) {
                setIsLoading(false);
                const message = error instanceof Error ? error.message : 'Unknown error';
                console.error('[x402] Payment failed:', message);
                return { success: false, error: message };
            }
        },
        [address, signAuthorization]
    );

    return {
        x402GaslessFetch,
        signAuthorization,
        isLoading,
        isConnected,
        address,
        chainId,
        lastTxHash,
    };
}
