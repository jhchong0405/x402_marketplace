const hre = require("hardhat");

async function main() {
    const path = require('path');
    const deploymentPath = path.join(__dirname, '../../deployment.json');
    const deployment = require(deploymentPath);
    const tokenAddress = deployment.contracts.PaymentToken;

    console.log(`🔍 Diagnosing Token Contract at ${tokenAddress}`);

    const code = await hre.ethers.provider.getCode(tokenAddress);
    console.log(`   Bytecode Length: ${code.length} bytes`);

    if (code === '0x') {
        console.error('   ❌ No code found at this address!');
        return;
    }

    // 1. Check for EIP712Domain TypeHash
    // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    const typeHash = "8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f";
    if (code.includes(typeHash)) {
        console.log(`   ✅ Found Standard EIP712Domain TypeHash`);
    } else {
        console.log(`   ⚠️ TypeHash NOT found. Might utilize non-standard domain or salt.`);
    }

    // 2. Search for readable strings
    const stringsToCheck = [
        "Mock USD Coin",
        "MockUSDC",
        "USD Coin",
        "USDC",
        "EIP712Domain",
        "1",
        "2"
    ];

    console.log("\n   String Search in Bytecode:");
    for (const str of stringsToCheck) {
        const hex = Buffer.from(str).toString('hex');
        if (code.includes(hex)) {
            console.log(`      Found: "${str}"`);
        }
    }

    // 3. Try to call basic PERMIT functions to see if it's EIP-2612 compatible instead
    // permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
    // Selector: 0xd505accf
    if (code.includes("d505accf")) {
        console.log(`   ✅ Found 'permit' function selector (EIP-2612)`);
    }

    // 4. Try to call receiveWithAuthorization selector
    // receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
    // Selector: 0xef55bec6
    if (code.includes("ef55bec6")) {
        console.log(`   ✅ Found 'receiveWithAuthorization' function selector (EIP-3009)`);
    }

    // 5. Try to read DOMAIN_SEPARATOR directly
    // Selector: 0x3644e515
    if (code.includes("3644e515")) {
        console.log(`   ✅ Found 'DOMAIN_SEPARATOR' function selector`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
