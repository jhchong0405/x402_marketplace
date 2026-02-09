/**
 * x402 Relayer - Server-side settlement for gasless payments
 * 
 * This module handles on-chain settlement via the PaymentProcessor contract.
 * The server acts as a Relayer, paying gas on behalf of the user.
 */

import { ethers } from 'ethers';

// Conflux eSpace Testnet RPC
const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';

// EIP-3009 ABI for receiveWithAuthorization (direct token calls - legacy)
const EIP3009_ABI = [
    'function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
    'function balanceOf(address) view returns (uint256)',
    'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
];

// PaymentProcessor ABI (new contract-based settlement)
const PAYMENT_PROCESSOR_ABI = [
    'function processPayment(bytes32 serviceId, address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
    'function usedNonces(address payer, bytes32 nonce) view returns (bool)',
];

export interface SignatureData {
    from: string;
    to: string;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: string;
    v: number;
    r: string;
    s: string;
    serviceId?: string; // Optional: for contract-based settlement
}

export interface VerifyResult {
    isValid: boolean;
    payer: string;
    paymentId: string;
    timestamp: string;
    signatureData: SignatureData;
    error?: string;
}

export interface SettleResult {
    success: boolean;
    txHash?: string;
    error?: string;
}

/**
 * RelayerFacilitator - Handles verification and on-chain settlement
 */
export class RelayerFacilitator {
    private provider: ethers.JsonRpcProvider;
    private wallet: ethers.Wallet | null = null;
    private tokenAddress: string;
    private processorAddress: string | null;

    constructor(tokenAddress: string, processorAddress?: string, rpcUrl: string = RPC_URL) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.tokenAddress = tokenAddress;
        this.processorAddress = processorAddress || process.env.PAYMENT_PROCESSOR_ADDRESS || null;

        // Initialize wallet from env if available
        const privateKey = process.env.RELAYER_PRIVATE_KEY;
        if (privateKey) {
            this.wallet = new ethers.Wallet(privateKey, this.provider);
        }
    }

    /**
     * Get the relayer's address (payment recipient)
     */
    getRelayerAddress(): string | null {
        return this.wallet?.address || null;
    }

    /**
     * Decode tunnel mode payload
     */
    decodeTunnelPayload(proof: string): SignatureData | null {
        try {
            const decoded = Buffer.from(proof, 'base64').toString();
            return JSON.parse(decoded) as SignatureData;
        } catch {
            return null;
        }
    }

    /**
     * Verify a payment signature
     */
    async verify(payload: { proof?: string } & Partial<SignatureData>): Promise<VerifyResult> {
        let signatureData: SignatureData | null = null;

        // Handle tunnel mode (base64 encoded proof)
        if (payload.proof && typeof payload.proof === 'string') {
            signatureData = this.decodeTunnelPayload(payload.proof);
        }

        // Handle direct signature data
        if (!signatureData && payload.from && payload.v && payload.r && payload.s) {
            signatureData = payload as SignatureData;
        }

        if (!signatureData) {
            return {
                isValid: false,
                payer: 'unknown',
                paymentId: 'unknown',
                timestamp: new Date().toISOString(),
                signatureData: {} as SignatureData,
                error: 'Invalid signature data',
            };
        }

        // Check time validity
        const now = Math.floor(Date.now() / 1000);
        if (signatureData.validAfter > now) {
            return {
                isValid: false,
                payer: signatureData.from,
                paymentId: signatureData.nonce,
                timestamp: new Date().toISOString(),
                signatureData,
                error: 'Authorization not yet valid',
            };
        }

        if (signatureData.validBefore < now) {
            return {
                isValid: false,
                payer: signatureData.from,
                paymentId: signatureData.nonce,
                timestamp: new Date().toISOString(),
                signatureData,
                error: 'Authorization expired',
            };
        }

        // Check if nonce already used
        try {
            if (this.processorAddress) {
                // Use PaymentProcessor nonce check
                const processor = new ethers.Contract(this.processorAddress, PAYMENT_PROCESSOR_ABI, this.provider);
                const nonceUsed = await processor.usedNonces(signatureData.from, signatureData.nonce);
                if (nonceUsed) {
                    return {
                        isValid: false,
                        payer: signatureData.from,
                        paymentId: signatureData.nonce,
                        timestamp: new Date().toISOString(),
                        signatureData,
                        error: 'Nonce already used',
                    };
                }
            } else {
                // Fallback to token authorizationState
                const contract = new ethers.Contract(this.tokenAddress, EIP3009_ABI, this.provider);
                const nonceUsed = await contract.authorizationState(signatureData.from, signatureData.nonce);
                if (nonceUsed) {
                    return {
                        isValid: false,
                        payer: signatureData.from,
                        paymentId: signatureData.nonce,
                        timestamp: new Date().toISOString(),
                        signatureData,
                        error: 'Nonce already used',
                    };
                }
            }
        } catch {
            // Contract might not have the method, continue
        }

        return {
            isValid: true,
            payer: signatureData.from,
            paymentId: signatureData.nonce,
            timestamp: new Date().toISOString(),
            signatureData,
        };
    }

    /**
     * Settle payment on-chain via PaymentProcessor (preferred) or direct Token call (legacy)
     */
    async settle(signatureData: SignatureData, serviceId?: string): Promise<SettleResult> {
        if (!this.wallet) {
            return {
                success: false,
                error: 'Relayer wallet not configured (RELAYER_PRIVATE_KEY missing)',
            };
        }

        const { from, to, value, validAfter, validBefore, nonce, v, r, s } = signatureData;
        const effectiveServiceId = serviceId || signatureData.serviceId;

        console.log(`[Relayer] Settle called. Processor: ${this.processorAddress}, ServiceID: ${effectiveServiceId}`);

        // Use PaymentProcessor if available and serviceId provided
        if (this.processorAddress && effectiveServiceId) {
            return this.settleViaProcessor(effectiveServiceId, signatureData);
        }

        // Fallback to direct token call (legacy mode)
        return this.settleDirectToken(signatureData);
    }

    /**
     * Settle via PaymentProcessor contract (recommended)
     */
    private async settleViaProcessor(serviceId: string, signatureData: SignatureData): Promise<SettleResult> {
        const { from, value, validAfter, validBefore, nonce, v, r, s } = signatureData;

        try {
            const processor = new ethers.Contract(this.processorAddress!, PAYMENT_PROCESSOR_ABI, this.wallet);

            // Convert string values to BigInt for proper contract encoding
            const valueBigInt = BigInt(value);
            const validAfterBigInt = BigInt(validAfter);
            const validBeforeBigInt = BigInt(validBefore);

            console.log(`[Relayer] Settling via PaymentProcessor for service ${serviceId}`);
            console.log(`[Relayer] From: ${from}, Amount: ${valueBigInt}`);

            const tx = await processor.processPayment(
                serviceId,
                from,
                valueBigInt,
                validAfterBigInt,
                validBeforeBigInt,
                nonce,
                v,
                r,
                s,
                { gasLimit: 500000 } // Higher limit for complex contract interactions
            );

            console.log(`[Relayer] Transaction sent: ${tx.hash}`);

            const receipt = await tx.wait();
            console.log(`[Relayer] Transaction confirmed in block ${receipt.blockNumber}`);

            return {
                success: true,
                txHash: tx.hash,
            };
        } catch (error) {
            console.error('[Relayer] PaymentProcessor settlement failed:', error);
            return {
                success: false,
                error: `Settlement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Settle via direct token call (legacy mode)
     */
    private async settleDirectToken(signatureData: SignatureData): Promise<SettleResult> {
        const { from, to, value, validAfter, validBefore, nonce, v, r, s } = signatureData;

        try {
            const contract = new ethers.Contract(this.tokenAddress, EIP3009_ABI, this.wallet);

            console.log(`[Relayer] Settling directly on token from ${from} to ${to} for ${value}`);

            const tx = await contract.receiveWithAuthorization(
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce,
                v,
                r,
                s,
                { gasLimit: 200000 }
            );

            console.log(`[Relayer] Transaction sent: ${tx.hash}`);

            const receipt = await tx.wait();
            console.log(`[Relayer] Transaction confirmed in block ${receipt.blockNumber}`);

            return {
                success: true,
                txHash: tx.hash,
            };
        } catch (error) {
            console.error('[Relayer] Direct token settlement failed:', error);
            return {
                success: false,
                error: `Settlement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Check token balance
     */
    async getBalance(address: string): Promise<string> {
        try {
            const contract = new ethers.Contract(this.tokenAddress, EIP3009_ABI, this.provider);
            const balance = await contract.balanceOf(address);
            return ethers.formatEther(balance);
        } catch {
            return '0';
        }
    }
}

/**
 * Create a RelayerFacilitator instance for MockUSDC on Conflux testnet
 */
export function createConfluxRelayer(tokenAddress?: string, processorAddress?: string): RelayerFacilitator {
    const token = tokenAddress || process.env.MOCK_USDC_ADDRESS || '0x865310dc9D0bFE1460caB221B4bF3DA2040b94D7';
    const processor = processorAddress || process.env.PAYMENT_PROCESSOR_ADDRESS;
    return new RelayerFacilitator(token, processor);
}
