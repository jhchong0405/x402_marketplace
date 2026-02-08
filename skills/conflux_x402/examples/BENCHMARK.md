# Running the Performance Benchmark

## Prerequisites
1. Ensure you have dependencies installed: `npm install`
2. Ensure you have the correct `.env` config (Server & Client wallets formatted correctly).
   - If Client wallet is empty, run `node mint_to_client.js`.

## Steps

### 1. Start the Server (Relayer)
Open a terminal and run:
```bash
node server.js
```
*Keep this terminal open.*

### 2. Run the Benchmark
Open a **new terminal** and run:
```bash
# Run default 100 transactions
node benchmark_100.js

# Or specify a custom count (e.g., 10)
node benchmark_100.js 10
```

### 3. Analyze Results
The script will output the latency for each transaction and a summary at the end.
If transactions fail with `ECONNREFUSED`, ensure `server.js` is running on port 3000.
