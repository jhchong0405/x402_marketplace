require('dotenv').config();
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const ethers = require('ethers');

async function main() {
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    if (!PRIVATE_KEY) { console.error("No PRIVATE_KEY in .env"); process.exit(1); }

    // Connect to Conflux eSpace
    const provider = new ethers.providers.JsonRpcProvider("https://evmtestnet.confluxrpc.com");
    // const provider = new ethers.providers.JsonRpcProvider("https://evm.confluxrpc.com"); // Mainnet if needed
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`Deploying from: ${wallet.address}`);
    const balance = await wallet.getBalance();
    console.log(`Balance: ${ethers.utils.formatEther(balance)} CFX`);

    // Compile
    const contractPath = path.resolve(__dirname, 'MockUSDC.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    // Minimal standard JSON input
    const input = {
        language: 'Solidity',
        sources: {
            'MockUSDC.sol': { content: source }
        },
        settings: {
            optimizer: { enabled: true, runs: 200 },
            evmVersion: 'paris',
            outputSelection: {
                '*': { '*': ['*'] }
            }
        }
    };

    // Need to handle imports manually for solc-js or use a callback
    // Simpler: Just map the content since we know the paths
    function findImports(importPath) {
        if (importPath.startsWith('@openzeppelin')) {
            const nodeModulesPath = path.resolve(__dirname, '../node_modules', importPath);
            if (fs.existsSync(nodeModulesPath)) {
                return { contents: fs.readFileSync(nodeModulesPath, 'utf8') };
            }
        }
        return { error: 'File not found' };
    }

    console.log("Compiling...");
    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

    if (output.errors) {
        let hasError = false;
        output.errors.forEach(err => {
            console.error(err.formattedMessage);
            if (err.severity === 'error') hasError = true;
        });
        if (hasError) process.exit(1);
    }

    const bytecode = output.contracts['MockUSDC.sol']['MockUSDC'].evm.bytecode.object;
    const abi = output.contracts['MockUSDC.sol']['MockUSDC'].abi;

    // Deploy
    console.log("Deploying contract...");
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    // Gas limit manual override just in case
    const contract = await factory.deploy({ gasLimit: 3000000 });

    console.log(`Contract deploy tx: ${contract.deployTransaction.hash}`);
    await contract.deployed();

    console.log(`------------------------------------------------`);
    console.log(`MockUSDC Deployed at: ${contract.address}`);
    console.log(`------------------------------------------------`);

    // Mint some tokens to the client wallet (same wallet for simplicity in this demo, usually different)
    // Actually, user probably wants the client to be a different wallet, but for demo current wallet is fine.
    // Let's assume the "Client Address" is your wallet address from client.js
    // I'll see if I can find it or just mint to self (owner)

    const CLIENT_WALLET = "0xC08CC32481e49C167f505EdB5717ab6212012c07"; // Hardcoded from previous logs
    console.log(`Minting 1000 mUSDC to Client: ${CLIENT_WALLET}`);

    const mintTx = await contract.mint(CLIENT_WALLET, ethers.utils.parseEther("1000"));
    await mintTx.wait();
    console.log("Minted!");

    // Also verify balance
    const bal = await contract.balanceOf(CLIENT_WALLET);
    console.log(`Client Balance: ${ethers.utils.formatEther(bal)} mUSDC`);
}

main();
