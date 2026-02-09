const { ethers } = require('ethers');

async function main() {
    const typeString = "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)";
    const hash = ethers.keccak256(ethers.toUtf8Bytes(typeString));

    console.log("Calculated TypeHash: ", hash);
    console.log("Contract TypeHash:   ", "0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8");

    if (hash === "0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8") {
        console.log("✅ TypeHashes MATCH!");
    } else {
        console.log("❌ MISMATCH!");
    }
}

main().catch(console.error);
