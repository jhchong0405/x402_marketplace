'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Filter } from 'lucide-react';
import { getTokenSymbol } from '@/lib/tokens';

interface Service {
    id: string;
    name: string;
    description: string;
    price: number;
    tokenAddress: string | null;
    type: string;
    tags: string | null;
    provider: {
        name: string;
    };
}

interface Props {
    services: Service[];
}

export function ServiceGrid({ services }: Props) {
    const [selectedType, setSelectedType] = useState<string>('ALL');
    const [selectedTag, setSelectedTag] = useState<string>('ALL');

    // Extract unique tags
    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        services.forEach((service) => {
            if (service.tags) {
                const tags = service.tags.split(',').map((t) => t.trim());
                tags.forEach((tag) => tagSet.add(tag));
            }
        });
        return Array.from(tagSet).sort();
    }, [services]);

    // Filter services
    const filteredServices = useMemo(() => {
        return services.filter((service) => {
            const typeMatch = selectedType === 'ALL' || service.type === selectedType;

            let tagMatch = selectedTag === 'ALL';
            if (!tagMatch && service.tags) {
                const serviceTags = service.tags.split(',').map((t) => t.trim());
                tagMatch = serviceTags.includes(selectedTag);
            }

            return typeMatch && tagMatch;
        });
    }, [services, selectedType, selectedTag]);

    return (
        <div>
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-8">
                <div className="flex items-center gap-2">
                    <Filter className="h-5 w-5 text-gray-400" />
                    <span className="text-sm text-gray-400">Type:</span>
                    <div className="flex gap-2">
                        {['ALL', 'HOSTED', 'PROXY', 'API'].map((type) => (
                            <button
                                key={type}
                                onClick={() => setSelectedType(type)}
                                className={`px-3 py-1 rounded-lg text-sm font-medium transition ${selectedType === type
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                    }`}
                            >
                                {type === 'ALL' ? 'All' : type}
                            </button>
                        ))}
                    </div>
                </div>

                {allTags.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">Tag:</span>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setSelectedTag('ALL')}
                                className={`px-3 py-1 rounded-lg text-sm font-medium transition ${selectedTag === 'ALL'
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                    }`}
                            >
                                All
                            </button>
                            {allTags.slice(0, 5).map((tag) => (
                                <button
                                    key={tag}
                                    onClick={() => setSelectedTag(tag)}
                                    className={`px-3 py-1 rounded-lg text-sm font-medium transition ${selectedTag === tag
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                        }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Services Grid */}
            {filteredServices.length === 0 ? (
                <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-gray-400 mb-4">No services match your filters.</p>
                    <button
                        onClick={() => {
                            setSelectedType('ALL');
                            setSelectedTag('ALL');
                        }}
                        className="text-purple-400 hover:text-purple-300"
                    >
                        Clear filters →
                    </button>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredServices.map((service) => (
                        <Link
                            key={service.id}
                            href={`/service/${service.id}`}
                            className="group bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:border-purple-500/50 transition-all hover:bg-white/10"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex-1">
                                    <h3 className="text-lg font-semibold text-white group-hover:text-purple-300 transition">
                                        {service.name}
                                    </h3>
                                    <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                                        {service.type}
                                    </span>
                                </div>
                                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-sm rounded whitespace-nowrap ml-2">
                                    {service.price} {getTokenSymbol(service.tokenAddress)}
                                </span>
                            </div>
                            <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                                {service.description}
                            </p>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">by {service.provider.name}</span>
                                <ArrowRight className="h-4 w-4 text-purple-400 opacity-0 group-hover:opacity-100 transition" />
                            </div>
                            {service.tags && (
                                <div className="flex flex-wrap gap-1 mt-3">
                                    {service.tags.split(',').slice(0, 3).map((tag) => (
                                        <span
                                            key={tag}
                                            className="px-2 py-0.5 bg-purple-600/20 text-purple-300 text-xs rounded"
                                        >
                                            {tag.trim()}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
