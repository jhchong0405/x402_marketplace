const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SERVICE_ID = "4e136c80-9cd2-44dd-b47e-ed305fba39f7";

async function main() {
    console.log(`Fixing service type for ID: ${SERVICE_ID}`);
    const updated = await prisma.service.update({
        where: { id: SERVICE_ID },
        data: {
            type: 'HOSTED',
            content: JSON.stringify({
                prediction: "Bullish",
                confidence: 0.85,
                report: "Based on recent earnings..."
            })
        }
    });

    console.log("✅ Service Updated to HOSTED with mock content.");
    console.log("New Type:", updated.type);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
