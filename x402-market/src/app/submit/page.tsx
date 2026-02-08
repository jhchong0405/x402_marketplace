'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ArrowLeft, Zap, Upload, Link as LinkIcon, Plus, X } from 'lucide-react';
import { WalletButton } from '@/components/WalletButton';

type ServiceType = 'HOSTED' | 'PROXY';

export default function SubmitServicePage() {
    const router = useRouter();
    const { address, isConnected } = useAccount();
    const [activeTab, setActiveTab] = useState<ServiceType>('HOSTED');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');

    const handleAddTag = () => {
        if (tagInput.trim() && !tags.includes(tagInput.trim())) {
            setTags([...tags, tagInput.trim()]);
            setTagInput('');
        }
    };

    const handleRemoveTag = (tag: string) => {
        setTags(tags.filter((t) => t !== tag));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const formData = new FormData(e.currentTarget);

        const data = {
            name: formData.get('name'),
            description: formData.get('description'),
            price: formData.get('price'),
            type: activeTab,
            tags,

            // HOSTED specific
            content: activeTab === 'HOSTED' ? formData.get('content') : null,

            // PROXY specific
            endpointUrl: activeTab === 'PROXY' ? formData.get('endpointUrl') : `${process.env.NEXT_PUBLIC_MARKET_URL}/api/gateway/${Date.now()}`,

            // Provider info
            providerWalletAddress: address,
            providerName: formData.get('providerName') || `Provider ${address?.slice(0, 6)}`,
            tokenAddress: process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS,
        };

        try {
            const response = await fetch('/api/services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit');
            }

            const { service } = await response.json();
            router.push(`/service/${service.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
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
                <h1 className="text-4xl font-bold text-white mb-2">Monetize Your Data</h1>
                <p className="text-gray-400 mb-8">
                    Upload data or connect your API - no coding required
                </p>

                {!isConnected && (
                    <div className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-400 px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
                        <span>Connect wallet to continue</span>
                        <WalletButton />
                    </div>
                )}

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                        {error}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-4 mb-6">
                    <button
                        onClick={() => setActiveTab('HOSTED')}
                        className={`flex-1 py-3 px-6 rounded-lg font-medium transition ${activeTab === 'HOSTED'
                            ? 'bg-purple-600 text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        <Upload className="inline h-5 w-5 mr-2" />
                        Upload Data
                    </button>
                    <button
                        onClick={() => setActiveTab('PROXY')}
                        className={`flex-1 py-3 px-6 rounded-lg font-medium transition ${activeTab === 'PROXY'
                            ? 'bg-purple-600 text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        <LinkIcon className="inline h-5 w-5 mr-2" />
                        Connect API
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                        <h2 className="text-xl font-semibold text-white mb-4">Basic Information</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Title *</label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                                    placeholder="e.g., Market Research Report 2024"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Description *</label>
                                <textarea
                                    name="description"
                                    required
                                    rows={3}
                                    className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                                    placeholder="Describe your data or API..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Price (mUSDC) *</label>
                                <input
                                    type="number"
                                    name="price"
                                    required
                                    step="0.01"
                                    min="0.01"
                                    className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                                    placeholder="5.00"
                                />
                            </div>

                            {/* Tags */}
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">
                                    Tags (optional)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={tagInput}
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddTag();
                                            }
                                        }}
                                        className="flex-1 px-4 py-3 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                                        placeholder="e.g., AI, Finance, Analytics"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddTag}
                                        className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
                                    >
                                        <Plus className="h-5 w-5" />
                                    </button>
                                </div>
                                {tags.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="inline-flex items-center gap-1 px-3 py-1 bg-purple-600/20 border border-purple-500/50 text-purple-300 rounded-full text-sm"
                                            >
                                                {tag}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveTag(tag)}
                                                    className="hover:text-purple-100"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* HOSTED: Content Upload */}
                    {activeTab === 'HOSTED' && (
                        <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4">Your Data</h2>
                            <textarea
                                name="content"
                                required
                                rows={10}
                                className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono text-sm resize-none"
                                placeholder="Paste your text data, JSON, or Markdown content here..."
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                We'll host this data and handle payments automatically
                            </p>
                        </section>
                    )}

                    {/* PROXY: API Endpoint */}
                    {activeTab === 'PROXY' && (
                        <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                            <h2 className="text-xl font-semibold text-white mb-4">API Endpoint</h2>
                            <input
                                type="url"
                                name="endpointUrl"
                                required
                                className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                                placeholder="https://your-api.com/endpoint"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                We'll proxy your API and handle payments - no code changes needed
                            </p>
                        </section>
                    )}

                    <button
                        type="submit"
                        disabled={!isConnected || isSubmitting}
                        className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Publishing...' : 'Publish & Start Earning'}
                    </button>
                </form>
            </div>
        </div>
    );
}
