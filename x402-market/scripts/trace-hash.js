const { ethers } = require('ethers');

const SERVICE_ID = "468efc1e-66bc-4cf7-a32c-42eb35fe0069";
const ERROR_VALUE = "0xed2999543a6aafedf125584ada4141167293c435edaa2272afa6c7f30de5c79";

function main() {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(SERVICE_ID));
    console.log("Service ID:", SERVICE_ID);
    console.log("Calculated Hash:", hash);
    console.log("Error Value:    ", ERROR_VALUE);

    if (hash.toLowerCase() === ERROR_VALUE.toLowerCase()) {
        console.log("✅ MATCH! The error value is indeed the Service ID Hash.");
    } else {
        console.log("❌ NO MATCH. The error value is something else.");
    }
}

main();
