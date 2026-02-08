'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap, CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { WalletButton } from '@/components/WalletButton';
import { useX402GaslessPayment } from '@/hooks/useX402GaslessPayment';

export default function DemoPage() {
    const { x402GaslessFetch, isLoading, isConnected, address, chainId, lastTxHash } = useX402GaslessPayment();
    const [result, setResult] = useState<{
        success: boolean;
        data?: Record<string, unknown>;
        error?: string;
    } | null>(null);

    const handleCallApi = async () => {
        setResult(null);
        const response = await x402GaslessFetch('/api/demo');
        setResult({
            success: response.success,
            data: response.data as Record<string, unknown> | undefined,
            error: response.error,
        });
    };

    const getExplorerUrl = (txHash: string) => {
        const baseUrl = chainId === 71
            ? 'https://evmtestnet.confluxscan.io/tx/'
            : 'https://evm.confluxscan.io/tx/';
        return `${baseUrl}${txHash}`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            {/* Navigation */}
            <nav className="flex items-center justify-between px-8 py-6 border-b border-white/10">
                <Link href="/" className="flex items-center gap-2 text-gray-300 hover:text-white transition">
                    <ArrowLeft className="h-5 w-5" />
                    Back to Marketplace
                </Link>
                <div className="flex items-center gap-4">
                    <Link href="/" className="flex items-center gap-2">
                        <Zap className="h-6 w-6 text-purple-400" />
                        <span className="text-xl font-bold text-white hidden sm:inline">x402 Market</span>
                    </Link>
                    <WalletButton />
                </div>
            </nav>

            <div className="max-w-2xl mx-auto px-8 py-12">
                <h1 className="text-4xl font-bold text-white mb-2">x402 Demo</h1>
                <p className="text-gray-400 mb-8">
                    Experience gasless payments in action. Click the button below to access paid content.
                </p>

                {/* Connection Status */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Connection Status</h2>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-400">Wallet</span>
                            <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
                                {isConnected ? 'Connected' : 'Not Connected'}
                            </span>
                        </div>
                        {address && (
                            <div className="flex justify-between">
                                <span className="text-gray-400">Address</span>
                                <span className="text-white font-mono text-xs">
                                    {address.slice(0, 6)}...{address.slice(-4)}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-gray-400">Network</span>
                            <span className="text-white">
                                {chainId === 71 ? 'Conflux eSpace Testnet' : chainId === 1030 ? 'Conflux eSpace' : `Chain ${chainId}`}
                            </span>
                        </div>
                    </div>
                </div>

                {/* How It Works */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
                    <h2 className="text-lg font-semibold text-white mb-4">How It Works</h2>
                    <ol className="space-y-3 text-sm text-gray-300">
                        <li className="flex gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/30 text-purple-300 flex items-center justify-center text-xs">1</span>
                            <span>You click &quot;Call Paid API&quot; → Server returns 402 Payment Required</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/30 text-purple-300 flex items-center justify-center text-xs">2</span>
                            <span>Your wallet signs an EIP-3009 authorization (no gas needed from you)</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/30 text-purple-300 flex items-center justify-center text-xs">3</span>
                            <span>Server (Relayer) submits the transaction on-chain, paying gas for you</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/30 text-purple-300 flex items-center justify-center text-xs">4</span>
                            <span>Once confirmed, server returns the paid content</span>
                        </li>
                    </ol>
                </div>

                {/* Action Button */}
                <button
                    onClick={handleCallApi}
                    disabled={!isConnected || isLoading}
                    className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 mb-6"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Processing Payment...
                        </>
                    ) : (
                        <>
                            <Zap className="h-5 w-5" />
                            Call Paid API (1 mUSDC)
                        </>
                    )}
                </button>

                {!isConnected && (
                    <div className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-400 px-4 py-3 rounded-lg mb-6 text-center">
                        Please connect your wallet to test the payment flow
                    </div>
                )}

                {/* Result */}
                {result && (
                    <div className={`backdrop-blur-sm border rounded-2xl p-6 ${result.success
                        ? 'bg-green-500/10 border-green-500/50'
                        : 'bg-red-500/10 border-red-500/50'
                        }`}>
                        <div className="flex items-center gap-2 mb-4">
                            {result.success ? (
                                <>
                                    <CheckCircle className="h-5 w-5 text-green-400" />
                                    <h3 className="text-lg font-semibold text-green-400">Payment Successful!</h3>
                                </>
                            ) : (
                                <>
                                    <XCircle className="h-5 w-5 text-red-400" />
                                    <h3 className="text-lg font-semibold text-red-400">Payment Failed</h3>
                                </>
                            )}
                        </div>

                        {result.success && result.data && (
                            <div className="space-y-3">
                                <pre className="bg-black/30 rounded-lg p-4 overflow-auto text-xs text-gray-300">
                                    {JSON.stringify(result.data, null, 2)}
                                </pre>
                                {lastTxHash && (
                                    <a
                                        href={getExplorerUrl(lastTxHash)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm"
                                    >
                                        View on ConfluxScan
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                )}
                            </div>
                        )}

                        {!result.success && result.error && (
                            <p className="text-red-300 text-sm">{result.error}</p>
                        )}
                    </div>
                )}

                {/* Info Box */}
                <div className="mt-8 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-300">
                    <strong>Note:</strong> This demo uses MockUSDC on Conflux eSpace Testnet.
                    You need mUSDC tokens in your wallet. The Relayer server also needs CFX for gas.
                </div>
            </div>
        </div>
    );
}
