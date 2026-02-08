const ethers = require('ethers');

async function main() {
    const rpcUrl = "https://evmtestnet.confluxrpc.com";
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    console.log(`Connecting to ${rpcUrl}...`);

    try {
        const latestBlock = await provider.getBlock("latest");
        const span = 100; // Look back 100 blocks
        const pastBlockNumber = latestBlock.number - span;

        console.log(`Fetching block info for average calculation (Span: ${span} blocks)...`);
        const pastBlock = await provider.getBlock(pastBlockNumber);

        if (!pastBlock) {
            console.error("Could not fetch past block.");
            return;
        }

        const timeDiff = latestBlock.timestamp - pastBlock.timestamp;
        const avgTime = timeDiff / span;

        console.log(`------------------------------------------------`);
        console.log(`Latest Block: ${latestBlock.number} (Timestamp: ${latestBlock.timestamp})`);
        console.log(`Past Block:   ${pastBlock.number} (Timestamp: ${pastBlock.timestamp})`);
        console.log(`Total Time:   ${timeDiff} seconds`);
        console.log(`------------------------------------------------`);
        console.log(`Average Block Time: ${avgTime.toFixed(4)} seconds`);
        console.log(`------------------------------------------------`);

    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
