// Token address to symbol mapping
export const TOKEN_SYMBOLS: Record<string, string> = {
    '0xB6f2355db983518173A8cb3c1D94b92814950D89': 'mUSDC',
    '0x865310dc9D0bFE1460caB221B4bF3DA2040b94D7': 'mUSDC', // New deployment
    // Add more token addresses as needed
};

export function getTokenSymbol(tokenAddress: string | null): string {
    if (!tokenAddress) return 'CFX';
    return TOKEN_SYMBOLS[tokenAddress] || 'tokens';
}
