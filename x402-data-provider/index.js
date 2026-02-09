const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { exec } = require('child_process');
const app = express();
const PORT = process.env.PORT || 4000;
const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:3000';
const PLATFORM_WALLET = process.env.PLATFORM_WALLET;
const PROVIDER_ID = process.env.PROVIDER_ID || 'demo-provider-id';

app.use(cors());
app.use(express.json());

// Load reports data
const reportsPath = path.join(__dirname, 'data', 'reports.json');
const reports = JSON.parse(fs.readFileSync(reportsPath, 'utf8'));

// GET /api/reports - List all available reports
app.get('/api/reports', (req, res) => {
    // Return metadata only (no content)
    const reportsList = reports.map(({ id, title, description, price }) => ({
        id,
        title,
        description,
        price,
    }));

    res.json(reportsList);
});

// GET/POST /api/reports/:id - Get specific report (x402 protected)
app.all('/api/reports/:id', async (req, res) => {
    const { id } = req.params;
    const report = reports.find(r => r.id === id);

    if (!report) {
        return res.status(404).json({ error: 'Report not found' });
    }

    const paymentSignature = req.headers['payment-signature'];
    const gatewayTxHash = req.headers['x-402-txhash'];

    // Trust Gateway if TxHash is present (for demo purposes)
    if (gatewayTxHash) {
        console.log(`[Provider] Accepting generic gateway access with TxHash: ${gatewayTxHash}`);
        return res.json({
            id: report.id,
            title: report.title,
            description: report.description,
            content: report.content,
            txHash: gatewayTxHash,
        });
    }

    // No payment - return 402 with requirements
    if (!paymentSignature) {
        return res.status(402).json({
            error: 'Payment Required',
            accepts: [{
                scheme: 'gasless',
                network: 'eip155:71',
                maxAmountRequired: (report.price * 1e18).toString(),
                resource: `/api/reports/${id}`,
                description: `Access to: ${report.title}`,
                payTo: PLATFORM_WALLET,
                maxTimeoutSeconds: 300,
                asset: process.env.MOCK_USDC_ADDRESS || '0xB6f2355db983518173A8cb3c1D94b92814950D89',
                extra: {
                    symbol: 'mUSDC',
                    decimals: 18,
                },
            }],
        });
    }

    // Payment provided - verify with platform
    try {
        const verifyResponse = await fetch(`${PLATFORM_URL}/api/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paymentSignature,
                resourceId: id, // report ID for reference
                providerId: PROVIDER_ID,
                amount: report.price,
            }),
        });

        const verifyResult = await verifyResponse.json();

        if (!verifyResult.valid) {
            return res.status(402).json({
                error: 'Payment verification failed',
                details: verifyResult.error,
            });
        }

        // Payment verified - return full report
        res.json({
            id: report.id,
            title: report.title,
            description: report.description,
            content: report.content,
            txHash: verifyResult.txHash,
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ error: 'Payment verification failed' });
    }
});

// GET /api/predict/ai - Best AI Prediction
app.get('/api/predict/ai', async (req, res) => {
    const companies = req.query.companies || "OpenAI,Google,Anthropic";
    console.log(`[Provider] Running Best AI Prediction for: ${companies}`);

    exec(`python3 best_ai_prediction/run_prediction.py --companies "${companies}" --output ai_result.json`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ error: 'Prediction failed', details: stderr });
        }
        try {
            const result = JSON.parse(fs.readFileSync('ai_result.json', 'utf8'));
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: 'Failed to read prediction result' });
        }
    });
});

// GET /api/predict/gold - Gold Price Prediction
app.get('/api/predict/gold', async (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`[Provider] Running Gold Prediction for: ${date}`);

    exec(`python3 gwdc_tina_wrapper.py ${date} gold_result.json`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ error: 'Prediction failed', details: stderr });
        }
        try {
            const result = JSON.parse(fs.readFileSync('gold_result.json', 'utf8'));
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: 'Failed to read prediction result' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Data Provider Service running on port ${PORT}`);
    console.log(`📊 Available reports: ${reports.length}`);
    console.log(`💰 Platform: ${PLATFORM_URL}`);
});
