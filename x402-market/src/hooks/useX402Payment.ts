'use client';

import { useCallback, useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import {
    formatX402Headers,
    generateNonce,
    createEIP712Domain,
    EIP712_TYPES,
    X402PaymentRequirements,
} from '@/lib/x402';

export interface UseX402PaymentOptions {
    onSuccess?: (response: Response) => void;
    onError?: (error: Error) => void;
}

export interface X402FetchResult {
    response: Response | null;
    error: Error | null;
    isLoading: boolean;
}

/**
 * Hook for making x402-authenticated requests
 */
export function useX402Payment(options: UseX402PaymentOptions = {}) {
    const { address } = useAccount();
    const { signTypedDataAsync } = useSignTypedData();
    const [isLoading, setIsLoading] = useState(false);

    const payAndFetch = useCallback(
        async (
            url: string,
            requirements: X402PaymentRequirements,
            fetchOptions: RequestInit = {}
        ): Promise<X402FetchResult> => {
            if (!address) {
                const error = new Error('Wallet not connected');
                options.onError?.(error);
                return { response: null, error, isLoading: false };
            }

            setIsLoading(true);

            try {
                const now = Math.floor(Date.now() / 1000);
                const nonce = generateNonce();
                const validAfter = now;
                const validBefore = now + requirements.maxTimeoutSeconds;

                // Create message to sign
                const message = {
                    from: address,
                    to: requirements.payTo,
                    value: BigInt(requirements.maxAmountRequired),
                    validAfter: BigInt(validAfter),
                    validBefore: BigInt(validBefore),
                    nonce: nonce as `0x${string}`,
                };

                // Get chain ID from network string (e.g., "eip155:71" -> 71)
                const chainId = parseInt(requirements.network.split(':')[1]);

                // Sign the typed data
                const signature = await signTypedDataAsync({
                    domain: createEIP712Domain(requirements.asset, chainId) as {
                        name: string;
                        version: string;
                        chainId: number;
                        verifyingContract: `0x${string}`;
                    },
                    types: EIP712_TYPES,
                    primaryType: 'ReceiveWithAuthorization',
                    message,
                });

                // Create x402 headers
                const x402Headers = formatX402Headers(
                    requirements.payTo,
                    requirements.maxAmountRequired,
                    signature,
                    address,
                    nonce,
                    validAfter,
                    validBefore
                );

                // Make the authenticated request
                const response = await fetch(url, {
                    ...fetchOptions,
                    headers: {
                        ...fetchOptions.headers,
                        ...x402Headers,
                    },
                });

                setIsLoading(false);
                options.onSuccess?.(response);
                return { response, error: null, isLoading: false };
            } catch (err) {
                setIsLoading(false);
                const error = err instanceof Error ? err : new Error('Unknown error');
                options.onError?.(error);
                return { response: null, error, isLoading: false };
            }
        },
        [address, signTypedDataAsync, options]
    );

    /**
     * Simple fetch that handles 402 automatically
     */
    const x402Fetch = useCallback(
        async (url: string, fetchOptions: RequestInit = {}): Promise<X402FetchResult> => {
            setIsLoading(true);

            try {
                // First, try without payment
                const initialResponse = await fetch(url, fetchOptions);

                // If not 402, return as-is
                if (initialResponse.status !== 402) {
                    setIsLoading(false);
                    return { response: initialResponse, error: null, isLoading: false };
                }

                // Parse 402 response to get payment requirements
                const paymentInfo = await initialResponse.json();
                if (!paymentInfo.accepts || paymentInfo.accepts.length === 0) {
                    throw new Error('No payment options available');
                }

                // Use first accepted payment option
                const requirements = paymentInfo.accepts[0] as X402PaymentRequirements;

                // Pay and retry
                return payAndFetch(url, requirements, fetchOptions);
            } catch (err) {
                setIsLoading(false);
                const error = err instanceof Error ? err : new Error('Unknown error');
                options.onError?.(error);
                return { response: null, error, isLoading: false };
            }
        },
        [payAndFetch, options]
    );

    return {
        payAndFetch,
        x402Fetch,
        isLoading,
        isConnected: !!address,
        address,
    };
}
