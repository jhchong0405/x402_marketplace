const { ethers } = require('ethers');

// Test Vector
const PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
const MOCK_USDC = '0x865310dc9D0bFE1460caB221B4bF3DA2040b94D7';
const PAY_TO = '0x8d4712191fa0a189ab95C58aBaF6E19EBEA74c7f';
const NONCE = '0x0000000000000000000000000000000000000000000000000000000000000001';
const AMOUNT = '5000000000000000000'; // 5 * 1e18
const VALID_AFTER = 0;
const VALID_BEFORE = 2000000000;

async function main() {
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    console.log("Address:", wallet.address);

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
        from: wallet.address,
        to: PAY_TO,
        value: AMOUNT,
        validAfter: VALID_AFTER,
        validBefore: VALID_BEFORE,
        nonce: NONCE
    };

    const signature = await wallet.signTypedData(domain, types, value);
    const { v, r, s } = ethers.Signature.from(signature);

    console.log("Signature:");
    console.log("v:", v);
    console.log("r:", r);
    console.log("s:", s);
}

main().catch(console.error);
