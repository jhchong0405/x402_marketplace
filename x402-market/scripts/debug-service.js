const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SERVICE_ID = "4e136c80-9cd2-44dd-b47e-ed305fba39f7";

async function main() {
    console.log(`Searching for service ID: ${SERVICE_ID}`);
    const service = await prisma.service.findUnique({
        where: { id: SERVICE_ID },
        include: { provider: true }
    });

    if (!service) {
        console.log("❌ Service NOT FOUND in database.");
        return;
    }

    console.log("✅ Service Found:");
    console.log("ID:", service.id);
    console.log("Name:", service.name);
    console.log("Type:", service.type);
    console.log("Endpoint URL:", service.endpointUrl);
    console.log("Content Length:", service.content ? service.content.length : "N/A");
    console.log("Is Active:", service.isActive);
    console.log("Provider:", service.provider.walletAddress);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
