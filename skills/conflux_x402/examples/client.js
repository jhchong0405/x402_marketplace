require('dotenv').config();
const ethers = require('ethers');
const axios = require('axios');

const PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY;
const SERVER_URL = "http://localhost:3000/premium-data";
const MOCK_USDC_ADDRESS = "0xB6f2355db983518173A8cb3c1D94b92814950D89";
const CHAIN_ID = 71;

async function main() {
    if (!PRIVATE_KEY) { console.error("Missing CLIENT_PRIVATE_KEY"); process.exit(1); }
    const provider = new ethers.providers.JsonRpcProvider("https://evmtestnet.confluxrpc.com");
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`\n------------------------------------------------`);
    console.log(`Gasless x402 Client (Tunnel Mode)`);
    console.log(`Wallet: ${wallet.address}`);

    // Check mUSDC Balance
    const usdcAbi = ["function balanceOf(address) view returns (uint256)"];
    const usdc = new ethers.Contract(MOCK_USDC_ADDRESS, usdcAbi, wallet);
    const bal = await usdc.balanceOf(wallet.address);
    console.log(`Balance: ${ethers.utils.formatEther(bal)} mUSDC`);
    console.log("------------------------------------------------");

    // 1. Request
    console.log("1. Requesting resource...");
    try {
        await axios.get(SERVER_URL);
    } catch (error) {
        if (error.response && error.response.status === 402) {
            console.log("Server responded with 402 Payment Required.");

            const encodedInfo = error.response.headers['payment-required'];
            const paymentInfo = JSON.parse(Buffer.from(encodedInfo, 'base64').toString());
            const { amount, payTo } = paymentInfo.accepts[0];

            console.log(`Price: ${ethers.utils.formatEther(amount)} mUSDC`);

            // 2. Sign
            console.log("2. Signing EIP-3009 Authorization...");
            const validAfter = 0;
            const validBefore = Math.floor(Date.now() / 1000) + 3600;
            const randomNonce = ethers.utils.hexlify(ethers.utils.randomBytes(32));

            const domain = {
                name: "Mock USD Coin",
                version: "1",
                chainId: CHAIN_ID,
                verifyingContract: MOCK_USDC_ADDRESS
            };

            const types = {
                ReceiveWithAuthorization: [
                    { name: "from", type: "address" },
                    { name: "to", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "validAfter", type: "uint256" },
                    { name: "validBefore", type: "uint256" },
                    { name: "nonce", type: "bytes32" }
                ]
            };

            const value = {
                from: wallet.address,
                to: payTo,
                value: amount,
                validAfter: validAfter,
                validBefore: validBefore,
                nonce: randomNonce
            };

            const signature = await wallet._signTypedData(domain, types, value);
            const { v, r, s } = ethers.utils.splitSignature(signature);

            // 3. Send
            console.log("3. Sending Signature to Server (Relayer)...");

            // Encode the Full Signature Data
            const signatureData = {
                from: wallet.address,
                to: payTo,
                value: amount,
                validAfter, validBefore, nonce: randomNonce,
                v, r, s
            };

            const signatureBase64 = Buffer.from(JSON.stringify(signatureData)).toString('base64');

            // Echo back the matched requirement in 'accepted' field
            const requirement = paymentInfo.accepts[0];
            const tokenPayload = {
                x402Version: 2,
                accepted: requirement,
                proof: signatureBase64 // Tunneling!
            };

            const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');

            try {
                const response = await axios.get(SERVER_URL, {
                    headers: { 'payment-signature': token }
                });
                console.log("\n------------------------------------------------");
                console.log("Success! Server Response:");
                console.log(response.data);
                console.log("------------------------------------------------");
            } catch (retryError) {
                console.error("Retry Failed:", retryError.response ? retryError.response.data : retryError.message);
            }
        } else {
            console.error("Unexpected error:", error.message);
        }
    }
}

main();
