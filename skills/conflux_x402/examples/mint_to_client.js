require('dotenv').config();
const ethers = require('ethers');

async function main() {
    const provider = new ethers.providers.JsonRpcProvider('https://evmtestnet.confluxrpc.com');
    const wallet = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, provider);
    const usdc = new ethers.Contract(
        '0xB6f2355db983518173A8cb3c1D94b92814950D89',
        ['function mint(address,uint256)', 'function balanceOf(address) view returns (uint256)'],
        wallet
    );

    const clientAddr = '0x81e4CE4E4b079CeC8d420b42F0DEC70A5F26f922';
    const amount = ethers.utils.parseEther('100');

    console.log('Minting 100 mUSDC to client:', clientAddr);
    const tx = await usdc.mint(clientAddr, amount, { gasLimit: 100000 });
    console.log('Tx sent:', tx.hash);
    await tx.wait();
    console.log('Tx confirmed!');

    const balance = await usdc.balanceOf(clientAddr);
    console.log('Client balance:', ethers.utils.formatEther(balance), 'mUSDC');
}

main().catch(console.error);
