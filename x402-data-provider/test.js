/**
 * Test script for data provider integration
 */

const PROVIDER_URL = 'http://localhost:4000';

async function testDataProvider() {
    console.log('🧪 Testing Data Provider Service\n');

    try {
        // Test 1: List reports
        console.log('1️⃣ Testing report listing...');
        const listRes = await fetch(`${PROVIDER_URL}/api/reports`);
        const reports = await listRes.json();
        console.log(`✅ Found ${reports.length} reports:`);
        reports.forEach(r => console.log(`   - ${r.title} ($${r.price})`));

        // Test 2: Access without payment
        console.log('\n2️⃣ Testing x402 protection...');
        const reportId = reports[0].id;
        const protectedRes = await fetch(`${PROVIDER_URL}/api/reports/${reportId}`);

        if (protectedRes.status === 402) {
            const data = await protectedRes.json();
            console.log('✅ Correctly returns 402 Payment Required');
            console.log(`   Payment goes to: ${data.accepts[0].payTo}`);
            console.log(`   Amount: ${data.accepts[0].maxAmountRequired}`);
        } else {
            console.log('❌ Expected 402, got', protectedRes.status);
        }

        console.log('\n✨ Data provider service is ready!');
        console.log('\n📝 Next steps:');
        console.log('1. Visit http://localhost:3000/submit');
        console.log('2. Register service with endpoint: http://localhost:4000/api/reports/btc-2026-q1');
        console.log('3. Use x402-market demo page to test payment flow');
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testDataProvider();
