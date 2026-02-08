'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { WalletButton } from '@/components/WalletButton';
import { ArrowLeft, Zap, TrendingUp, Wallet, Clock, CheckCircle, XCircle } from 'lucide-react';

interface RevenueData {
    providerId: string;
    walletAddress: string;
    totalEarnings: number;
    claimedAmount: number;
    claimableBalance: number;
    recentClaims: Array<{
        id: string;
        amount: number;
        status: string;
        txHash: string | null;
        createdAt: string;
        completedAt: string | null;
    }>;
}

export default function DashboardPage() {
    const { address, isConnected } = useAccount();
    const [revenue, setRevenue] = useState<RevenueData | null>(null);
    const [loading, setLoading] = useState(false);
    const [claiming, setClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successData, setSuccessData] = useState<{ amount: number; txHash: string } | null>(null);

    useEffect(() => {
        if (isConnected && address) {
            fetchRevenue();
        }
    }, [isConnected, address]);

    const fetchRevenue = async () => {
        if (!address) return;

        setLoading(true);
        setError(null);

        try {
            const servicesRes = await fetch(`/api/services`);
            if (servicesRes.ok) {
                const data = await servicesRes.json();
                const services = data.services || data;
                const providerFromServices = (Array.isArray(services) ? services : []).find((s: { provider?: { walletAddress?: string; id?: string } }) =>
                    s.provider?.walletAddress?.toLowerCase() === address.toLowerCase()
                );

                if (providerFromServices?.provider?.id) {
                    const providerId = providerFromServices.provider.id;
                    const res = await fetch(`/api/revenue/${providerId}`);
                    if (res.ok) {
                        const data = await res.json();
                        setRevenue(data);
                        return;
                    }
                }
            }

            const walletRes = await fetch(`/api/revenue/wallet?address=${address}`);
            if (walletRes.ok) {
                const data = await walletRes.json();
                setRevenue({
                    providerId: 'on-chain',
                    walletAddress: data.walletAddress,
                    totalEarnings: data.claimableBalance,
                    claimedAmount: 0,
                    claimableBalance: data.claimableBalance,
                    recentClaims: [],
                });
            } else {
                const errorData = await walletRes.json().catch(() => ({}));
                setError(errorData.error || 'No on-chain balance found');
            }
        } catch (err) {
            setError('Failed to load revenue data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleClaim = async () => {
        if (!revenue || revenue.claimableBalance <= 0) return;

        setClaiming(true);
        setError(null);

        try {
            const res = await fetch('/api/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerId: revenue.providerId !== 'on-chain' ? revenue.providerId : undefined,
                    walletAddress: revenue.walletAddress,
                    amount: revenue.claimableBalance,
                }),
            });

            const data = await res.json();

            if (res.ok) {
                setSuccessData({
                    amount: revenue.claimableBalance,
                    txHash: data.txHash
                });
                fetchRevenue();
            } else {
                setError(data.error || 'Claim failed');
            }
        } catch (err) {
            setError('Claim request failed');
            console.error(err);
        } finally {
            setClaiming(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            {/* Navigation */}
            <nav className="flex items-center justify-between px-8 py-6 border-b border-white/10">
                <Link href="/" className="flex items-center gap-2 text-gray-300 hover:text-white transition">
                    <ArrowLeft className="h-5 w-5" />
                    Back to Home
                </Link>
                <div className="flex items-center gap-4">
                    <Link href="/" className="flex items-center gap-2">
                        <Zap className="h-6 w-6 text-purple-400" />
                        <span className="text-xl font-bold text-white hidden sm:inline">x402 Market</span>
                    </Link>
                    <WalletButton />
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-8 py-12">
                <div className="mb-12">
                    <h1 className="text-4xl font-bold text-white mb-2">Provider Dashboard</h1>
                    <p className="text-gray-400">Track your earnings and manage withdrawals</p>
                </div>

                {!isConnected ? (
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-12 text-center">
                        <Wallet className="h-16 w-16 text-purple-400 mx-auto mb-4" />
                        <p className="text-gray-400 mb-6 text-lg">Connect your wallet to view your earnings</p>
                        <WalletButton />
                    </div>
                ) : loading ? (
                    <div className="text-center py-20">
                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500 border-t-transparent mx-auto"></div>
                        <p className="text-gray-400 mt-4">Loading your data...</p>
                    </div>
                ) : error ? (
                    <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-8 text-center">
                        <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                        <p className="text-red-400 text-lg">{error}</p>
                    </div>
                ) : revenue ? (
                    <div className="space-y-8">
                        {/* Revenue Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 border border-blue-500/20">
                                <div className="flex items-center justify-between mb-4">
                                    <TrendingUp className="h-8 w-8 text-blue-200" />
                                </div>
                                <p className="text-blue-200 text-sm font-medium mb-1">Total Earnings</p>
                                <p className="text-4xl font-bold text-white">{revenue.totalEarnings.toFixed(2)}</p>
                                <p className="text-blue-200 text-sm mt-1">mUSDC</p>
                            </div>

                            <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 border border-green-500/20">
                                <div className="flex items-center justify-between mb-4">
                                    <Wallet className="h-8 w-8 text-green-200" />
                                </div>
                                <p className="text-green-200 text-sm font-medium mb-1">Claimable Balance</p>
                                <p className="text-4xl font-bold text-white">{revenue.claimableBalance.toFixed(2)}</p>
                                <p className="text-green-200 text-sm mt-1">mUSDC</p>
                            </div>

                            <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 border border-purple-500/20">
                                <div className="flex items-center justify-between mb-4">
                                    <CheckCircle className="h-8 w-8 text-purple-200" />
                                </div>
                                <p className="text-purple-200 text-sm font-medium mb-1">Total Claimed</p>
                                <p className="text-4xl font-bold text-white">{revenue.claimedAmount.toFixed(2)}</p>
                                <p className="text-purple-200 text-sm mt-1">mUSDC</p>
                            </div>
                        </div>

                        {/* Claim Button */}
                        {revenue.claimableBalance > 0 && (
                            <button
                                onClick={handleClaim}
                                disabled={claiming}
                                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-5 px-6 rounded-2xl transition-all transform hover:scale-[1.02] shadow-lg"
                            >
                                {claiming ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                                        Processing...
                                    </span>
                                ) : (
                                    `💰 Claim ${revenue.claimableBalance.toFixed(2)} mUSDC`
                                )}
                            </button>
                        )}

                        {/* Recent Claims */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <Clock className="h-6 w-6 text-purple-400" />
                                <h2 className="text-2xl font-bold text-white">Recent Claims</h2>
                            </div>
                            {revenue.recentClaims.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-gray-400">No claims yet. Start earning to see your claim history!</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {revenue.recentClaims.map((claim) => (
                                        <div key={claim.id} className="flex items-center justify-between bg-white/5 rounded-xl p-5 hover:bg-white/10 transition">
                                            <div>
                                                <p className="text-xl font-semibold text-white">{claim.amount.toFixed(2)} mUSDC</p>
                                                <p className="text-sm text-gray-400 mt-1">
                                                    {new Date(claim.createdAt).toLocaleString()}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold ${claim.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/50' :
                                                    claim.status === 'failed' ? 'bg-red-500/20 text-red-400 border border-red-500/50' :
                                                        'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                                                    }`}>
                                                    {claim.status.toUpperCase()}
                                                </span>
                                                {claim.txHash && (
                                                    <p className="text-xs text-gray-500 mt-2 font-mono">
                                                        TX: {claim.txHash.slice(0, 10)}...
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}

                {/* Success Modal */}
                {successData && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSuccessData(null)}></div>
                        <div className="relative bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-300">
                            <button
                                onClick={() => setSuccessData(null)}
                                className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>

                            <div className="text-center">
                                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/20 rounded-full mb-6 relative">
                                    <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping"></div>
                                    <CheckCircle className="w-10 h-10 text-green-400 relative z-10" />
                                </div>

                                <h3 className="text-2xl font-bold text-white mb-2">Claim Successful!</h3>
                                <p className="text-gray-300 mb-6">Your earnings have been successfully processed.</p>

                                <div className="bg-white/5 rounded-xl p-4 mb-6">
                                    <p className="text-sm text-gray-400 mb-1">Amount Claimed</p>
                                    <p className="text-3xl font-bold text-green-400">{successData.amount.toFixed(2)} mUSDC</p>
                                </div>

                                <div className="space-y-4">
                                    <a
                                        href={`https://evmtestnet.confluxscan.io/tx/${successData.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition text-sm flex items-center justify-center gap-2"
                                    >
                                        View Transaction <ArrowLeft className="w-4 h-4 rotate-180" />
                                    </a>
                                    <button
                                        onClick={() => setSuccessData(null)}
                                        className="block w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-6 rounded-lg transition text-sm"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
