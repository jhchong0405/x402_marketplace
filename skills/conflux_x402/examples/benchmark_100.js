require('dotenv').config();
const ethers = require('ethers');
const axios = require('axios');
const fs = require('fs');

const { CLIENT_PRIVATE_KEY, SERVER_PRIVATE_KEY } = process.env;
const SERVER_URL = "http://localhost:3000/premium-data";
const MOCK_USDC_ADDRESS = "0xB6f2355db983518173A8cb3c1D94b92814950D89";
const CHAIN_ID = 71;

async function runBenchmark(count = 100) {
    console.log(`Starting Benchmark: ${count} transactions (Sequential)...`);

    const provider = new ethers.providers.JsonRpcProvider("https://evmtestnet.confluxrpc.com");
    // Use CLIENT key for signing
    const wallet = new ethers.Wallet(CLIENT_PRIVATE_KEY, provider);

    const results = [];
    const errors = [];

    const startTimeTotal = Date.now();

    for (let i = 1; i <= count; i++) {
        process.stdout.write(`Tx ${i}/${count}: `);
        const start = Date.now();
        try {
            // 1. Request
            let paymentInfo;
            try {
                await axios.get(SERVER_URL);
            } catch (error) {
                if (error.response && error.response.status === 402) {
                    const encodedInfo = error.response.headers['payment-required'];
                    paymentInfo = JSON.parse(Buffer.from(encodedInfo, 'base64').toString());
                } else {
                    throw new Error("Unexpected Response: " + (error.response ? error.response.status : error.message));
                }
            }

            // 2. Sign
            const { amount, payTo } = paymentInfo.accepts[0];
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
            const { v, r, s } = ethers.utils.splitSignature(signature);

            const signatureData = { from: wallet.address, to: payTo, value: amount, validAfter: 0, validBefore, nonce: randomNonce, v, r, s };
            const signatureBase64 = Buffer.from(JSON.stringify(signatureData)).toString('base64');

            const tokenPayload = {
                x402Version: 2,
                accepted: paymentInfo.accepts[0],
                proof: signatureBase64
            };
            const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');

            // 3. Send
            await axios.get(SERVER_URL, { headers: { 'payment-signature': token } });

            const duration = Date.now() - start;
            console.log(`✅ ${duration} ms`);
            results.push(duration);

        } catch (e) {
            const duration = Date.now() - start; // Time until failure
            console.log(`❌ Failed (${duration} ms): ${e.message}`);
            errors.push({ i, error: e.message, duration });
        }
    }

    const endTimeTotal = Date.now();
    const totalTime = endTimeTotal - startTimeTotal;

    // Stats
    const successCount = results.length;
    const failCount = errors.length;

    if (successCount > 0) {
        const sum = results.reduce((a, b) => a + b, 0);
        const avg = sum / successCount;
        const min = Math.min(...results);
        const max = Math.max(...results);

        console.log(`\n================================================`);
        console.log(`Benchmark Results (${count} Txs)`);
        console.log(`================================================`);
        console.log(`Completed: ${successCount}`);
        console.log(`Failed:    ${failCount}`);
        console.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
        console.log(`------------------------------------------------`);
        console.log(`Average Latency: ${avg.toFixed(2)} ms`);
        console.log(`Minimum Latency: ${min} ms`);
        console.log(`Maximum Latency: ${max} ms`);
        console.log(`================================================`);
    } else {
        console.log(`\nAll transactions failed.`);
    }
}

const count = process.argv[2] ? parseInt(process.argv[2]) : 100;
runBenchmark(count).catch(console.error);
