require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const { paymentMiddleware, x402ResourceServer } = require('@x402/express');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
// const SERVER_ADDRESS = "0xA590a87764014a6fAdDA61F2a1756e8fc79190e6"; // Removed static
const MOCK_USDC_ADDRESS = "0xB6f2355db983518173A8cb3c1D94b92814950D89";
const PRICE_USDC = "1"; // 1 USDC
const CONFLUX_ESPACE_TESTNET = "eip155:71";

const USDC_ABI = [
    "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external"
];

class RelayerFacilitatorClient {
    constructor() {
        const provider = new ethers.providers.JsonRpcProvider("https://evmtestnet.confluxrpc.com");
        this.wallet = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, provider);
    }

    async getSupported() {
        return {
            kinds: [{
                x402Version: 2,
                network: CONFLUX_ESPACE_TESTNET,
                scheme: "exact"
            }]
        };
    }

    async verify(paymentPayload, paymentRequirements) {
        console.log(`[Relayer] Verifying...`);
        let signatureData = paymentPayload;

        // Handle Tunnel Mode decoding if present
        if (paymentPayload.proof && typeof paymentPayload.proof === 'string') {
            try {
                const inner = JSON.parse(Buffer.from(paymentPayload.proof, 'base64').toString());
                signatureData = inner;
            } catch (e) { }
        }

        return {
            isValid: true,
            payer: signatureData.from || "unknown",
            paymentId: signatureData.nonce || "unknown",
            timestamp: new Date().toISOString(),
            extra: { signatureData }
        };
    }

    async settle(paymentPayload, paymentRequirements, verifyResponse) {
        console.log(`[Relayer] Settling...`);
        const startSettle = Date.now();

        let signatureData = paymentPayload;
        if (paymentPayload.proof && typeof paymentPayload.proof === 'string') {
            try {
                signatureData = JSON.parse(Buffer.from(paymentPayload.proof, 'base64').toString());
            } catch (e) { }
        }

        const { from, to, value, validAfter, validBefore, nonce, v, r, s } = signatureData;

        try {
            const usdc = new ethers.Contract(MOCK_USDC_ADDRESS, USDC_ABI, this.wallet);

            console.log(`[Relayer] Preparing Tx...`);
            const startTxContext = Date.now();

            // Relayer sends the tx!
            const tx = await usdc.receiveWithAuthorization(
                from, to, value, validAfter, validBefore, nonce, v, r, s,
                { gasLimit: 200000 }
            );
            const endTxSubmission = Date.now();
            console.log(`[Relayer] Tx Sent: ${tx.hash}`);
            console.log(`[Relayer] Submission Time: ${endTxSubmission - startTxContext} ms`);

            // --- OPTIMISTIC RESPONSE ---
            if (process.env.OPTIMISTIC_SETTLEMENT === 'true') {
                console.log(`[Relayer] OPTIMISTIC MODE: Returning success immediately!`);
                // Background Confirmation
                tx.wait().then(receipt => {
                    const endTxWait = Date.now();
                    console.log(`[Relayer] (Background) Tx Confirmed: ${tx.hash}`);
                    console.log(`[Relayer] (Background) Mining Time: ${endTxWait - endTxSubmission} ms`);
                }).catch(err => {
                    console.error(`[Relayer] (Background) Tx FAILED: ${tx.hash}`, err);
                });

                return { success: true, transaction: { hash: tx.hash }, optimistic: true };
            }
            // ---------------------------


            console.log(`[Relayer] Waiting for Confirmation...`);
            const receipt = await tx.wait(); // Default is 1 conf?
            const endTxWait = Date.now();
            console.log(`[Relayer] Tx Confirmed!`);
            console.log(`[Relayer] Mining/Wait Time: ${endTxWait - endTxSubmission} ms`);
            console.log(`[Relayer] Total Settle Time (Internal): ${endTxWait - startSettle} ms`);

            return { success: true, transaction: { hash: tx.hash } };
        } catch (e) {
            console.error("[Relayer] Settlement Failed:", e);
            throw { errorReason: "On-chain settlement failed: " + e.message };
        }
    }
}

// ASYNC INIT WRAPPER
(async () => {
    try {
        console.log("------------------------------------------------");
        console.log("Initializing x402 Server (Dynamic Address)...");

        // Custom Scheme Object
        const gaslessScheme = {
            scheme: "exact", // KEY PROPERTY
            moneyParsers: [],

            get name() { return "exact"; },

            registerMoneyParser(parser) {
                this.moneyParsers.push(parser);
                return this;
            },

            parsePrice(amount, network) {
                for (const parser of this.moneyParsers) {
                    const result = parser(amount, network);
                    if (result) return result;
                }
                return null;
            },

            deserialize(token) {
                return token;
            },

            enhancePaymentRequirements(req) { return req; }
        };

        gaslessScheme.registerMoneyParser((amount, network) => {
            if (network === CONFLUX_ESPACE_TESTNET) {
                return {
                    amount: ethers.utils.parseEther(String(amount)).toString(),
                    asset: MOCK_USDC_ADDRESS,
                    extra: { symbol: "mUSDC", decimals: 18 }
                };
            }
            return null;
        });

        const facilitatorClient = new RelayerFacilitatorClient();
        const SERVER_ADDRESS = facilitatorClient.wallet.address; // DYNAMIC ADDRESS!
        console.log(`Relayer Address (Recipient): ${SERVER_ADDRESS}`);

        const resourceServer = new x402ResourceServer(facilitatorClient)
            .register(CONFLUX_ESPACE_TESTNET, gaslessScheme);

        await resourceServer.initialize();

        // Monkey Patch for debug
        const originalFind = resourceServer.findMatchingRequirements.bind(resourceServer);
        resourceServer.findMatchingRequirements = (accepts, payload) => {
            const result = originalFind(accepts, payload);
            console.log(`Match Result: ${result ? "MATCHED" : "FAILED"}`);
            return result;
        };

        const routes = {
            "GET /premium-data": {
                accepts: {
                    scheme: "exact",
                    price: PRICE_USDC,
                    network: CONFLUX_ESPACE_TESTNET,
                    payTo: SERVER_ADDRESS // Matches the wallet!
                },
                description: "Premium Conflux Data"
            }
        };

        app.use(paymentMiddleware(routes, resourceServer));

        app.get('/premium-data', (req, res) => {
            res.json({ success: true, data: "Verified content provided via Gasless x402 (Dynamic Recipient)!" });
        });

        app.listen(PORT, () => {
            console.log(`x402 Server running on http://localhost:${PORT}`);
            console.log("------------------------------------------------");
        });

    } catch (err) {
        console.error("FATAL ERROR during server init:", err);
        process.exit(1);
    }
})();
