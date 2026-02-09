const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SERVICE_ID = "4e136c80-9cd2-44dd-b47e-ed305fba39f7";
const BASE_URL = process.env.NEXT_PUBLIC_MARKET_URL || "https://6cce-3-113-245-119.ngrok-free.app";

async function main() {
    console.log(`Fixing endpoint URL for service ID: ${SERVICE_ID}`);
    const correctUrl = `${BASE_URL}/api/gateway/${SERVICE_ID}`;

    const updated = await prisma.service.update({
        where: { id: SERVICE_ID },
        data: {
            endpointUrl: correctUrl
        }
    });

    console.log("✅ Endpoint URL Updated.");
    console.log("Old URL: .../api/gateway/<timestamp>");
    console.log("New URL:", updated.endpointUrl);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
