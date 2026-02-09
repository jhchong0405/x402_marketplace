const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.CONFLUX_RPC_URL || 'https://evmtestnet.confluxrpc.com';
const MOCK_USDC = process.env.MOCK_USDC_ADDRESS;
const PAY_TO = '0x8d4712191fa0a189ab95C58aBaF6E19EBEA74c7f'; // Escrow
const CLIENT_PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const client = new ethers.Wallet(CLIENT_PRIVATE_KEY, provider);
    const relayer = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider); // Relayer pays gas

    console.log("Client:", client.address);
    console.log("Relayer:", relayer.address);

    const abi = [
        'function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external'
    ];
    const token = new ethers.Contract(MOCK_USDC, abi, relayer); // Relayer signs transaciton

    const amount = ethers.parseEther("1.0"); // 1 mUSDC
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600;
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    const domain = {
        name: "Mock USD Coin",
        version: "1",
        chainId: 71,
        verifyingContract: MOCK_USDC
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
        from: client.address,
        to: PAY_TO,
        value: amount,
        validAfter: validAfter,
        validBefore: validBefore,
        nonce: nonce
    };

    console.log("Signing...");
    const signature = await client.signTypedData(domain, types, value);
    const { v, r, s } = ethers.Signature.from(signature);

    console.log("Sending receiveWithAuthorization...");
    try {
        const tx = await token.receiveWithAuthorization(
            client.address,
            PAY_TO,
            amount,
            validAfter,
            validBefore,
            nonce,
            v, r, s,
            { gasLimit: 200000 }
        );
        console.log("Tx Sent:", tx.hash);
        await tx.wait();
        console.log("✅ Direct Transfer Success!");
    } catch (e) {
        console.error("❌ Transfer Failed:", e.message || e);
        if (e.data) console.error("Data:", e.data);
    }
}

main().catch(console.error);
