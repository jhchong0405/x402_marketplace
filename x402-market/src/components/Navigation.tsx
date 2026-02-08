'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { WalletButton } from './WalletButton';

export function Navigation() {
    return (
        <nav className="relative z-10 flex items-center justify-between px-8 py-6">
            <div className="flex items-center gap-2">
                <Zap className="h-8 w-8 text-purple-400" />
                <span className="text-2xl font-bold text-white">x402 Market</span>
            </div>
            <div className="flex items-center gap-4">
                <Link href="/" className="text-gray-300 hover:text-white transition hidden sm:block">
                    Home
                </Link>
                <Link href="/submit" className="text-gray-300 hover:text-white transition hidden sm:block">
                    Submit API
                </Link>
                <Link href="/dashboard" className="text-gray-300 hover:text-white transition hidden sm:block">
                    Dashboard
                </Link>
                <WalletButton />
            </div>
        </nav>
    );
}
