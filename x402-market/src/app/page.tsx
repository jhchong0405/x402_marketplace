import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/prisma';
import { ArrowRight, Shield, Globe, Zap } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { ServiceGrid } from '@/components/ServiceGrid';
import { getTokenSymbol } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

async function getServices() {
  return prisma.service.findMany({
    where: { isActive: true },
    include: {
      provider: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
}

export default async function HomePage() {
  const services = await getServices();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
        <Navigation />

        <div className="relative z-10 max-w-5xl mx-auto px-8 py-24 text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
            Pay-Per-Call
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              {' '}API Marketplace
            </span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Discover and consume APIs with instant micropayments powered by the x402 protocol on Conflux.
            No subscriptions. No API keys. Just pay and use.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="#services"
              className="px-6 py-3 bg-white text-slate-900 font-semibold rounded-lg hover:bg-gray-100 transition flex items-center gap-2"
            >
              Explore Services <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/submit"
              className="px-6 py-3 border border-white/20 text-white rounded-lg hover:bg-white/10 transition"
            >
              Publish Your API
            </Link>
          </div>
        </div>
      </header>

      {/* Trusted By Section */}
      <section className="py-12 px-8 border-b border-white/5 bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-purple-400 font-semibold mb-2">TRUSTED BY EXPERTS</p>
            <h2 className="text-3xl font-bold text-white">Leading Analysts & Institutions</h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {/* Analyst 1 */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col items-center text-center hover:bg-white/10 transition group">
              <div className="relative w-24 h-24 mb-4 rounded-full overflow-hidden border-2 border-purple-500/30 group-hover:border-purple-500 transition">
                <Image src="/analysts/alex.png" alt="Alex Rivera" fill className="object-cover" />
              </div>
              <h3 className="text-lg font-bold text-white">Alex Rivera</h3>
              <p className="text-purple-300 text-sm mb-2">Crypto Macro Strategist</p>
              <div className="flex gap-2 text-xs text-gray-400">
                <span className="bg-white/5 px-2 py-1 rounded">DeFi</span>
                <span className="bg-white/5 px-2 py-1 rounded">Layer 2</span>
              </div>
            </div>

            {/* Analyst 2 */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col items-center text-center hover:bg-white/10 transition group">
              <div className="relative w-24 h-24 mb-4 rounded-full overflow-hidden border-2 border-purple-500/30 group-hover:border-purple-500 transition">
                <Image src="/analysts/sarah.png" alt="Sarah Chen" fill className="object-cover" />
              </div>
              <h3 className="text-lg font-bold text-white">Sarah Chen</h3>
              <p className="text-purple-300 text-sm mb-2">Lead Data Scientist</p>
              <div className="flex gap-2 text-xs text-gray-400">
                <span className="bg-white/5 px-2 py-1 rounded">On-Chain</span>
                <span className="bg-white/5 px-2 py-1 rounded">MEV</span>
              </div>
            </div>

            {/* Institution 1 */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col items-center text-center hover:bg-white/10 transition group">
              <div className="relative w-24 h-24 mb-4 rounded-xl overflow-hidden border-2 border-purple-500/30 group-hover:border-purple-500 transition p-2 bg-slate-900">
                <Image src="/analysts/nexus.png" alt="Nexus Capital" fill className="object-contain p-2" />
              </div>
              <h3 className="text-lg font-bold text-white">Nexus Capital</h3>
              <p className="text-purple-300 text-sm mb-2">Digital Asset Fund</p>
              <div className="flex gap-2 text-xs text-gray-400">
                <span className="bg-white/5 px-2 py-1 rounded">Institutional</span>
                <span className="bg-white/5 px-2 py-1 rounded">Research</span>
              </div>
            </div>

            {/* Institution 2 */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col items-center text-center hover:bg-white/10 transition group">
              <div className="relative w-24 h-24 mb-4 rounded-xl overflow-hidden border-2 border-purple-500/30 group-hover:border-purple-500 transition p-2 bg-slate-900">
                <Image src="/analysts/alpha.png" alt="Alpha Insights" fill className="object-contain p-2" />
              </div>
              <h3 className="text-lg font-bold text-white">Alpha Insights</h3>
              <p className="text-purple-300 text-sm mb-2">Market Intelligence</p>
              <div className="flex gap-2 text-xs text-gray-400">
                <span className="bg-white/5 px-2 py-1 rounded">API</span>
                <span className="bg-white/5 px-2 py-1 rounded">Analytics</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-8">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Instant Payments</h3>
            <p className="text-gray-400">
              No subscriptions or monthly fees. Pay exactly what you use with x402 micropayments.
            </p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Gasless Transactions</h3>
            <p className="text-gray-400">
              Sign once, pay without gas. Relayers handle the on-chain settlement for you.
            </p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
              <Globe className="h-6 w-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Agent Ready</h3>
            <p className="text-gray-400">
              Every service is discoverable by AI agents via standard manifests and structured data.
            </p>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section id="services" className="py-16 px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-8">Featured Services</h2>
          {services.length === 0 ? (
            <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
              <p className="text-gray-400 mb-4">No services available yet.</p>
              <Link href="/submit" className="text-purple-400 hover:text-purple-300">
                Be the first to publish an API →
              </Link>
            </div>
          ) : (
            <ServiceGrid services={services} />
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-8 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-gray-500 text-sm">
          <p>© 2024 x402 Market. Powered by Conflux eSpace.</p>
          <div className="flex items-center gap-4">
            <Link href="/.well-known/ai-plugin.json" className="hover:text-white transition">
              AI Plugin Manifest
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
