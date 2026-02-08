
const { ethers } = require("ethers");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

async function interactDemo() {
    console.log('🚀 Starting Interaction Demo\n');

    // Configuration
    const API_BASE = "http://localhost:3000";
    const provider = new ethers.JsonRpcProvider(process.env.CONFLUX_RPC_URL);
    // User wallet (using Relayer key for this demo as it has funds)
    const userWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);

    console.log(`👤 User: ${userWallet.address}`);

    try {
        // 1. Discover Service
        console.log('\n🔍 Step 1: Discovering BTC Service...');
        const servicesRes = await fetch(`${API_BASE}/api/agent/services`);
        const servicesData = await servicesRes.json();
        const services = Array.isArray(servicesData) ? servicesData : servicesData.services || [];

        if (!services || !Array.isArray(services)) {
            console.error("❌ Invalid services response:", servicesData);
            return;
        }

        // Find the "BTC Fundamentals" service (or any available proxy service)
        const targetService = services.find(s => s.name.includes("BTC") || s.description.includes("BTC") || s.name.includes("Fundamental"));

        if (!targetService) {
            console.error("❌ BTC Service not found! Listing all services:");
            services.forEach(s => console.log(`- ${s.name} (${s.id})`));
            return;
        }

        console.log(`✅ Found Service: "${targetService.name}"`);
        console.log(`   ID: ${targetService.id}`);

        // Handle Price (Object or String)
        let priceAmount, priceDisplay;
        if (typeof targetService.price === 'object') {
            priceDisplay = targetService.price.display;
            priceAmount = targetService.price.amount;
        } else {
            priceDisplay = `${targetService.price} mUSDC`;
            priceAmount = ethers.parseUnits(targetService.price.toString(), 18).toString();
        }

        console.log(`   Price: ${priceDisplay}`);
        console.log(`   Endpoint: ${targetService.endpoint}`);

        // 2. Prepare Payment (EIP-712 Signature)
        console.log('\n💳 Step 2: Generating Payment Signature...');

        const chainId = (await provider.getNetwork()).chainId;
        const usdcAddress = process.env.MOCK_USDC_ADDRESS;
        const paymentProcessorAddress = process.env.PAYMENT_PROCESSOR_ADDRESS;
        const escrowAddress = process.env.ESCROW_ADDRESS; // Correct recipient

        if (!escrowAddress) {
            console.error("❌ ESCROW_ADDRESS not found in .env");
            return;
        }

        // EIP-712 Domain
        const domain = {
            name: 'Mock USD Coin', // Correct Name from Contract
            version: '1',
            chainId: Number(chainId),
            verifyingContract: usdcAddress,
        };

        // EIP-3009 Types (ReceiveWithAuthorization)
        const types = {
            ReceiveWithAuthorization: [
                { name: 'from', type: 'address' },
                { name: 'to', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'validAfter', type: 'uint256' },
                { name: 'validBefore', type: 'uint256' },
                { name: 'nonce', type: 'bytes32' },
            ],
        };

        // Payment Values
        const value = priceAmount;
        const validAfter = 0;
        const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour
        const nonce = ethers.hexlify(ethers.randomBytes(32));

        const message = {
            from: userWallet.address,
            to: escrowAddress, // MUST match the Escrow contract logic
            value: value.toString(),
            validAfter,
            validBefore,
            nonce,
        };

        // Sign typed data
        const signature = await userWallet.signTypedData(domain, types, message);
        console.log(`✅ Signature generated`);

        // 3. Execute Service Call
        console.log('\n🚀 Step 3: Executing Service Call...');

        const executePayload = {
            serviceId: targetService.id,
            walletAddress: userWallet.address,
            signature: {
                v: ethers.Signature.from(signature).v,
                r: ethers.Signature.from(signature).r,
                s: ethers.Signature.from(signature).s,
                from: userWallet.address,
                to: escrowAddress, // MUST match the message.to
                value: value.toString(),
                validAfter,
                validBefore,
                nonce,
            }
        };

        const execRes = await fetch(`${API_BASE}/api/agent/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(executePayload)
        });

        const result = await execRes.json();

        if (!execRes.ok) {
            console.error('❌ Execution Failed:', result);
            return;
        }

        console.log('✅ Execution Successful!');

        // Log the actual response data
        console.log('📦 Service Response:');
        console.dir(result.response, { depth: null, colors: true });

        if (result.payment && result.payment.txHash) {
            console.log(`\n🔗 Transaction Hash: ${result.payment.txHash}`);
            console.log(`🌐 Explorer: https://evmtestnet.confluxscan.io/tx/${result.payment.txHash}`);
        } else {
            console.log('\n⚠️ No TX hash returned (maybe already paid?)');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

interactDemo();
