require('dotenv').config();
const ethers = require('ethers');
const axios = require('axios');

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SERVER_URL = "http://localhost:3000/premium-data";
const MOCK_USDC_ADDRESS = "0xB6f2355db983518173A8cb3c1D94b92814950D89";
const CHAIN_ID = 71;

async function main() {
    const provider = new ethers.providers.JsonRpcProvider("https://evmtestnet.confluxrpc.com");
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`Starting Benchmark...`);
    const startTotal = Date.now();

    // 1. Request (Round Trip 1)
    const startReq = Date.now();
    let paymentInfo;
    try {
        await axios.get(SERVER_URL);
    } catch (error) {
        if (error.response && error.response.status === 402) {
            const encodedInfo = error.response.headers['payment-required'];
            paymentInfo = JSON.parse(Buffer.from(encodedInfo, 'base64').toString());
        }
    }
    const endReq = Date.now();
    console.log(`1. 402 Discovery: ${endReq - startReq} ms`);

    // 2. Signing (Local)
    const startSign = Date.now();
    const { payTo, amount } = paymentInfo.accepts[0];
    const validBefore = Math.floor(Date.now() / 1000) + 3600;
    const randomNonce = ethers.utils.hexlify(ethers.utils.randomBytes(32));

    const domain = { name: "Mock USD Coin", version: "1", chainId: CHAIN_ID, verifyingContract: MOCK_USDC_ADDRESS };
    const types = {
        ReceiveWithAuthorization: [
            { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }
        ]
    };
    const value = { from: wallet.address, to: payTo, value: amount, validAfter: 0, validBefore, nonce: randomNonce };
    const signature = await wallet._signTypedData(domain, types, value);
    const { v, r, s } = ethers.utils.splitSignature(signature); // Local computation

    const signatureData = { from: wallet.address, to: payTo, value: amount, validAfter: 0, validBefore, nonce: randomNonce, v, r, s };
    const signatureBase64 = Buffer.from(JSON.stringify(signatureData)).toString('base64');

    const tokenPayload = {
        x402Version: 2,
        accepted: paymentInfo.accepts[0],
        proof: signatureBase64
    };
    const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
    const endSign = Date.now();
    console.log(`2. Signing (Local): ${endSign - startSign} ms`);

    // 3. Settlement (Server -> Blockchain -> Server)
    const startSettle = Date.now();
    try {
        await axios.get(SERVER_URL, { headers: { 'payment-signature': token } });
        const endSettle = Date.now();
        console.log(`3. Settlement (Relayer + Chain): ${endSettle - startSettle} ms`);
        console.log(`------------------------------------------------`);
        console.log(`TOTAL LATENCY: ${endSettle - startTotal} ms`);
        console.log(`------------------------------------------------`);
    } catch (e) {
        console.error("Failed:", e.message);
    }
}

main();
