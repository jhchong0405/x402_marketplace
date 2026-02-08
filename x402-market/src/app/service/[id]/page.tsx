import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { ArrowLeft, ExternalLink, Copy, Zap } from 'lucide-react';
import { createConfluxRelayer } from '@/lib/x402-relayer';
import { getTokenSymbol } from '@/lib/tokens';

interface ServicePageProps {
    params: Promise<{ id: string }>;
}

async function getService(id: string) {
    return prisma.service.findUnique({
        where: { id, isActive: true },
        include: {
            provider: {
                select: { name: true, walletAddress: true },
            },
        },
    });
}

export default async function ServicePage({ params }: ServicePageProps) {
    const { id } = await params;
    const service = await getService(id);

    if (!service) {
        notFound();
    }

    const openApiSpec = service.openApiSpec ? JSON.parse(service.openApiSpec) : null;
    const tags = service.tags ? service.tags.split(',') : [];
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const relayer = createConfluxRelayer();
    const relayerAddress = relayer.getRelayerAddress();
    const escrowAddress = process.env.ESCROW_ADDRESS || relayerAddress;
    const tokenSymbol = getTokenSymbol(service.tokenAddress);

    // JSON-LD for Agent discovery
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebAPI',
        name: service.name,
        description: service.description,
        url: service.endpointUrl,
        provider: {
            '@type': 'Organization',
            name: service.provider.name,
        },
        potentialAction: {
            '@type': 'ConsumeAction',
            target: service.endpointUrl,
            priceSpecification: {
                '@type': 'PriceSpecification',
                price: service.price,
                priceCurrency: tokenSymbol,
            },
        },
    };

    return (
        <>
            {/* Agent-readable metadata */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <meta name="x402-receiver" content={escrowAddress || ''} />
            <meta name="x402-price" content={service.price.toString()} />
            <meta name="x402-token" content={service.tokenAddress || 'native'} />
            {openApiSpec && (
                <script
                    type="application/json"
                    id="openapi-spec"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(openApiSpec) }}
                />
            )}

            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
                {/* Navigation */}
                <nav className="flex items-center justify-between px-8 py-6 border-b border-white/10">
                    <Link href="/" className="flex items-center gap-2 text-gray-300 hover:text-white transition">
                        <ArrowLeft className="h-5 w-5" />
                        Back to Marketplace
                    </Link>
                    <Link href="/" className="flex items-center gap-2">
                        <Zap className="h-6 w-6 text-purple-400" />
                        <span className="text-xl font-bold text-white">x402 Market</span>
                    </Link>
                </nav>

                <div className="max-w-4xl mx-auto px-8 py-12">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h1 className="text-4xl font-bold text-white mb-2">{service.name}</h1>
                                <p className="text-gray-400">by {service.provider.name}</p>
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-bold text-green-400">{service.price} {tokenSymbol}</div>
                                <div className="text-gray-500 text-sm">per call</div>
                            </div>
                        </div>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="px-3 py-1 bg-purple-500/20 text-purple-300 text-sm rounded-full"
                                    >
                                        {tag.trim()}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
                        <h2 className="text-xl font-semibold text-white mb-4">Description</h2>
                        <p className="text-gray-300 leading-relaxed">{service.description}</p>
                    </section>

                    {/* x402 Payment Info */}
                    <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
                        <h2 className="text-xl font-semibold text-white mb-4">Payment Details (x402)</h2>
                        <dl className="space-y-4">
                            <div className="flex items-start justify-between">
                                <dt className="text-gray-400">Payment Receiver (Escrow)</dt>
                                <dd className="text-white font-mono text-sm flex items-center gap-2">
                                    <span className="truncate max-w-[200px]">{escrowAddress}</span>
                                    <button
                                        className="text-gray-400 hover:text-white transition"
                                        title="Copy address"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </button>
                                </dd>
                            </div>
                            <div className="flex items-start justify-between">
                                <dt className="text-gray-400">Token</dt>
                                <dd className="text-white">{tokenSymbol} {service.tokenAddress && `(${service.tokenAddress.slice(0, 10)}...)`}</dd>
                            </div>
                            <div className="flex items-start justify-between">
                                <dt className="text-gray-400">Price per Call</dt>
                                <dd className="text-green-400 font-semibold">{service.price} {tokenSymbol}</dd>
                            </div>
                        </dl>
                    </section>

                    {/* Endpoint */}
                    <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
                        <h2 className="text-xl font-semibold text-white mb-4">Endpoint</h2>
                        <div className="flex items-center gap-4 bg-slate-800 rounded-lg p-4">
                            <code className="text-purple-300 flex-1 overflow-x-auto">{service.endpointUrl}</code>
                            <a
                                href={service.endpointUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-white transition"
                            >
                                <ExternalLink className="h-5 w-5" />
                            </a>
                        </div>
                    </section>

                    {/* Integration Example */}
                    <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                        <h2 className="text-xl font-semibold text-white mb-4">Integration Example</h2>
                        <pre className="bg-slate-800 rounded-lg p-4 overflow-x-auto text-sm">
                            <code className="text-gray-300">{`const response = await fetch('${service.endpointUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
                    'x-402-to': '${escrowAddress}',
    'x-402-value': '${service.price}',
    'x-402-signature': signature, // Your EIP-191/712 signature
  },
  body: JSON.stringify({ /* your payload */ }),
});`}</code>
                        </pre>
                    </section>
                </div>
            </div >
        </>
    );
}
